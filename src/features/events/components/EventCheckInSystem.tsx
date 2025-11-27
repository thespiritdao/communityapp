'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  QrCode, 
  Camera, 
  CheckCircle, 
  Clock, 
  Users, 
  Award,
  Download,
  User
} from 'lucide-react';

import type { EventWithStats, EventRegistration } from '../types/event';
import type { CheckInProcessingResult } from '../types/qr-types';
import { useEventRegistrations } from '../hooks/useEvents';
import { EventService } from '../lib/supabase';
import { QRCodeService } from '../services/QRCodeService';
import { EventManagerService } from '../services/EventManagerService';
import { QRScanner } from './QRScanner';
import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import { useAccount, useWalletClient } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from "@coinbase/onchainkit/transaction";

const BASE_CHAIN_ID = 8453;

interface EventCheckInSystemProps {
  event: EventWithStats;
}

export const EventCheckInSystem: React.FC<EventCheckInSystemProps> = ({ event }) => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { registrations, loading, refetch } = useEventRegistrations(event.id);
  const { getCompleteEventCall, getBatchMintCertificatesCall } = useSimplifiedEventTransactions();
  const [selectedRegistration, setSelectedRegistration] = useState<EventRegistration | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [eventQRCode, setEventQRCode] = useState<string>('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [processingCompletion, setProcessingCompletion] = useState(false);
  const [mintingNFTs, setMintingNFTs] = useState(false);
  const [showNFTMintingModal, setShowNFTMintingModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [nftMintingData, setNftMintingData] = useState<{
    recipients: string[];
    metadataURIs: string[];
    registrations: EventRegistration[];
  } | null>(null);
  const [scanResult, setScanResult] = useState<CheckInProcessingResult | null>(null);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [profilesLoading, setProfilesLoading] = useState(false);

  // Generate event QR code and store it
  useEffect(() => {
    const generateEventQR = async () => {
      try {
        const qrCodeURL = await QRCodeService.generateEventQRCode(event);
        setEventQRCode(qrCodeURL);
        
        // Store event QR code in database if not already stored
        if (!event.qr_code_data) {
          try {
            const qrData = {
              eventId: event.id,
              eventTitle: event.title,
              checkInUrl: `${window.location.origin}/events/${event.id}/checkin`,
              organizerMode: true,
              timestamp: Date.now(),
              version: '2.0'
            };
            
            await EventService.updateEvent(event.id, {
              qr_code_data: JSON.stringify(qrData)
            });
            
            console.log('✅ Stored event QR code data in database');
          } catch (error) {
            console.warn('⚠️ Failed to store event QR code data:', error);
          }
        }
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateEventQR();
  }, [event]);

  // Fetch user profiles for registrations
  useEffect(() => {
    const fetchProfiles = async () => {
      if (!registrations.length) {
        setProfilesLoading(false);
        return;
      }

      setProfilesLoading(true);
      try {
        const profileMap = new Map();
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              const profile = await EventService.getUserProfileByWallet(registration.user_address);
              if (profile) {
                profileMap.set(registration.user_address, profile);
              }
            } catch (error) {
              console.warn(`Failed to fetch profile for ${registration.user_address}:`, error);
              // Set a default profile with wallet address
              profileMap.set(registration.user_address, {
                wallet_address: registration.user_address,
                first_name: registration.user_address.slice(0, 6) + '...',
                last_name: '',
                profile_picture: null
              });
            }
          })
        );
        setProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching attendee profiles:', error);
      } finally {
        setProfilesLoading(false);
      }
    };

    if (registrations.length > 0) {
      fetchProfiles();
    } else {
      setProfilesLoading(false);
    }
  }, [registrations]);

  // Generate individual user QR code
  const generateUserQR = async (registration: EventRegistration) => {
    try {
      const qrCodeURL = await QRCodeService.generateUserQRCode(event.id, registration);
      setQrCodeData(qrCodeURL);
      setSelectedRegistration(registration);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating user QR code:', error);
    }
  };

  // Handle QR scan success
  const handleScanSuccess = async (result: CheckInProcessingResult) => {
    setScanResult(result);
    await refetch(); // Refresh the registration list
    // Auto-close scanner after successful check-in
    setTimeout(() => {
      setShowScannerModal(false);
      setScanResult(null);
    }, 2000);
  };

  // Handle QR scan error
  const handleScanError = (error: string) => {
    console.log('QR scan error:', error);
    // Error is handled within the QRScanner component
    // Optionally show a toast or alert here
  };

  const handleCheckIn = async (registrationId: string) => {
    try {
      setCheckingIn(true);
      console.log('🔄 Attempting check-in for registration:', registrationId);
      
      // Use the dedicated checkInUser method
      await EventService.checkInUser(registrationId);
      
      console.log('✅ Check-in successful, refreshing data...');
      await refetch();
    } catch (error) {
      console.error('❌ Error checking in user:', {
        error,
        registrationId,
        errorMessage: error?.message,
        errorCode: error?.code
      });
      // Show user-friendly error
      alert('Failed to check in user. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCompleteEvent = async () => {
    try {
      setProcessingCompletion(true);
      
      // Mark event as completed in database
      await EventService.completeEvent(event.id);
      
      // Get checked-in users who should receive NFTs
      const checkedInUsers = registrations.filter(
        reg => reg.registration_status === 'checked_in'
      );
      
      console.log(`🎯 Completing event with ${checkedInUsers.length} attendees to receive NFTs`);
      
      if (checkedInUsers.length > 0) {
        // Prepare NFT minting data
        await prepareNFTMintingData(checkedInUsers);
      } else {
        // No NFTs to mint, just update registrations
        await refetch();
        console.log('✅ Event completion process finished (no attendees for NFTs)');
      }
    } catch (error) {
      console.error('❌ Error completing event:', error);
      alert('Error completing event. Please try again.');
    } finally {
      setProcessingCompletion(false);
    }
  };

  const prepareNFTMintingData = async (checkedInUsers: EventRegistration[]) => {
    try {
      console.log('🎨 Preparing NFT minting data...');
      
      const recipients: string[] = [];
      const metadataURIs: string[] = [];

      for (const registration of checkedInUsers) {
        try {
          // Get user profile for NFT metadata
          const userProfile = profiles.get(registration.user_address);
          const userName = userProfile ? 
            `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() :
            undefined;

          // Generate metadata for the completion certificate
          const metadata = EventManagerService.generateCertificateMetadata(
            event,
            registration.user_address,
            userName
          );

          // Create metadata URI (in production, upload to IPFS)
          const metadataURI = await EventManagerService.createMetadataURI(metadata);

          recipients.push(registration.user_address);
          metadataURIs.push(metadataURI);

          console.log(`📋 Prepared NFT for ${userName || registration.user_address}`);
        } catch (error) {
          console.log(`Error preparing NFT for ${registration.user_address}:`, error);
          // Continue with other users even if one fails
        }
      }

      if (recipients.length > 0) {
        setNftMintingData({
          recipients,
          metadataURIs,
          registrations: checkedInUsers
        });
        setShowNFTMintingModal(true);
      } else {
        console.log('No NFTs to mint');
        await refetch();
      }
    } catch (error) {
      console.log('❌ Error preparing NFT minting data:', error);
      alert('Error preparing NFT data. Please try again.');
    }
  };

  const handleNFTMintingSuccess = async (response: any) => {
    console.log('✅ NFT minting successful:', response);
    
    try {
      const txHash = response?.transactionReceipts?.[0]?.transactionHash;
      
      if (nftMintingData) {
        // Update registrations with NFT transaction hash for tracking
        for (let i = 0; i < nftMintingData.recipients.length; i++) {
          const registration = nftMintingData.registrations.find(
            r => r.user_address === nftMintingData.recipients[i]
          );
          
          if (registration) {
            try {
              const tokenId = `${txHash}-${i}`;
              
              // Update registration with completion status
              await EventService.updateRegistration(registration.id, {
                registration_status: 'completed',
                completed_at: new Date().toISOString(),
                completion_token_id: tokenId
              });

              // Create event_tokens entry for tracking
              try {
                await EventService.createEventToken({
                  event_id: event.id,
                  user_address: nftMintingData.recipients[i],
                  token_id: tokenId,
                  transaction_hash: txHash || '',
                  metadata_uri: nftMintingData.metadataURIs[i],
                  minted_at: new Date().toISOString(),
                  token_type: 'completion_certificate'
                });
                console.log(`✅ Created event_tokens entry for ${nftMintingData.recipients[i]}`);
              } catch (tokenError) {
                console.log(`⚠️ Failed to create event_tokens entry:`, tokenError);
              }
            } catch (error) {
              console.log(`Error updating registration ${registration.id}:`, error);
            }
          }
        }

        console.log(`🎯 Updated registrations with NFT data and completion status`);
        
        // Show success message with tracking info
        alert(`✅ Successfully minted ${nftMintingData.recipients.length} NFT completion certificates!${txHash ? `\n\nTransaction Hash: ${txHash}\n\nYou can track the NFT generation status using this transaction hash.` : ''}`);
      }
      
      // Close modals and refresh data
      setShowNFTMintingModal(false);
      setShowCompletionModal(false);
      setNftMintingData(null);
      await refetch();
      
    } catch (error) {
      console.log('❌ Error handling NFT minting success:', error);
    }
  };

  const prepareBatchMintCalls = () => {
    if (!nftMintingData) return null;
    
    try {
      const eventId = event.blockchain_event_id || event.id;
      console.log('🎨 Preparing event completion + NFT minting calls for eventId:', eventId);
      
      // Check if event has started (required for completion)
      const eventStartDate = new Date(event.event_date);
      const now = new Date();
      const eventHasStarted = now >= eventStartDate;
      
      console.log('📅 Event timing check:', {
        eventStartDate: eventStartDate.toISOString(),
        currentTime: now.toISOString(),
        eventHasStarted,
        eventId,
        note: 'Smart contract requires event to be completed before minting NFTs'
      });
      
      if (!eventHasStarted) {
        alert('Cannot mint certificates: Event has not started yet. The smart contract requires the event to have started before completion.');
        return null;
      }
      
      // Step 1: Complete the event on blockchain (required for NFT minting)
      const completeEventCalls = getCompleteEventCall(eventId);
      
      // Step 2: Mint NFTs (can only happen after event is completed)
      const mintCalls = getBatchMintCertificatesCall(
        eventId,
        nftMintingData.recipients as any,
        nftMintingData.metadataURIs
      );
      
      // Combine both calls - completion first, then minting
      const combinedCalls = [...completeEventCalls, ...mintCalls];
      
      console.log('🎯 Prepared combined calls: complete event + mint NFTs', {
        completeEventCallsCount: completeEventCalls.length,
        mintCallsCount: mintCalls.length,
        totalCalls: combinedCalls.length
      });
      
      return combinedCalls;
    } catch (error) {
      console.error('❌ Error preparing batch mint calls:', error);
      
      // Show user-friendly error message
      if (error instanceof Error && error.message.includes('Event manager contract not configured')) {
        alert('Smart contract not configured. Please contact the administrator to configure the EventManager contract address.');
      } else {
        alert(`Error preparing NFT transaction: ${error.message || error}`);
      }
      
      return null;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const registeredCount = registrations.length;
  const checkedInCount = registrations.filter(reg => reg.registration_status === 'checked_in').length;
  const completedCount = registrations.filter(reg => reg.registration_status === 'completed').length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-gray-600">{event.title}</p>
          </div>
          
          {/* Complete Button - Top Right */}
          {event.status === 'published' && checkedInCount > 0 && (
            <Button
              onClick={() => setShowCompletionModal(true)}
              disabled={processingCompletion || mintingNFTs}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: '#3F7A5A' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2F5D50'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3F7A5A'}
            >
              <Award className="w-4 h-4 mr-2" />
              Complete
            </Button>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => setShowScannerModal(true)}
          >
            <Camera className="w-4 h-4 mr-2" />
            Scan QR Code
          </Button>
        </div>
      </div>

      {/* Stats - 2x2 Layout */}
      <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1" style={{ color: '#2F5D50' }} />
            <p className="text-lg sm:text-xl font-bold text-gray-900">{registeredCount}</p>
            <p className="text-xs text-gray-600">Registered</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1" style={{ color: '#3F7A5A' }} />
            <p className="text-lg sm:text-xl font-bold text-gray-900">{checkedInCount}</p>
            <p className="text-xs text-gray-600">Checked In</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1" style={{ color: '#6A5F7A' }} />
            <p className="text-lg sm:text-xl font-bold text-gray-900">{completedCount}</p>
            <p className="text-xs text-gray-600">Completed</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 text-center">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1" style={{ color: '#C6933F' }} />
            <p className="text-lg sm:text-xl font-bold text-gray-900">
              {registeredCount > 0 ? Math.round((checkedInCount / registeredCount) * 100) : 0}%
            </p>
            <p className="text-xs text-gray-600">Attendance Rate</p>
          </CardContent>
        </Card>
      </div>


      {/* Event QR Code */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <QrCode className="w-5 h-5 mr-2" />
              Event Check-In QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {eventQRCode ? (
              <div className="space-y-4">
                <img
                  src={eventQRCode}
                  alt="Event QR Code"
                  className="mx-auto border rounded-lg"
                />
                <p className="text-sm text-gray-600">
                  Display this QR code for attendees to scan for check-in
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.download = `${event.title}-qr-code.png`;
                    link.href = eventQRCode;
                    link.click();
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download QR Code
                </Button>
              </div>
            ) : (
              <div className="py-8">
                <QrCode className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Generating QR code...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Registrations List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendee List</CardTitle>
            </CardHeader>
            <CardContent>
              {registrations.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No registrations yet</p>
                </div>
              ) : profilesLoading ? (
                <div className="animate-pulse space-y-3">
                  {registrations.map((registration) => (
                    <div key={registration.id} className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                      <div className="flex-1 space-y-1">
                        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {registrations.map((registration) => {
                    const profile = profiles.get(registration.user_address);
                    return (
                      <div
                        key={registration.id}
                        className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                          {profile?.profile_picture ? (
                            <img 
                              src={profile.profile_picture} 
                              alt={`${profile.first_name} ${profile.last_name}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {profile?.first_name || 'Anonymous'} {profile?.last_name || ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            {registration.user_address.slice(0, 6)}...{registration.user_address.slice(-4)}
                          </p>
                          {registration.checked_in_at && (
                            <p className="text-xs text-gray-500">
                              Checked in: {formatTime(registration.checked_in_at)}
                            </p>
                          )}
                          {registration.payment_amount !== '0' && (
                            <p className="text-xs text-gray-500">
                              Paid: {registration.payment_amount} {registration.payment_token}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <Badge
                            variant={
                              registration.registration_status === 'completed' ? 'default' :
                              registration.registration_status === 'checked_in' ? 'secondary' :
                              'outline'
                            }
                            className="text-xs"
                          >
                            {registration.registration_status}
                          </Badge>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateUserQR(registration)}
                            className="h-8 px-2"
                          >
                            <QrCode className="w-3 h-3" />
                          </Button>

                          {registration.registration_status === 'registered' && (
                            <Button
                              size="sm"
                              onClick={() => handleCheckIn(registration.id)}
                              disabled={checkingIn}
                              className="h-8 px-2"
                            >
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* User QR Code Modal */}
      <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Member Entry Code</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            {selectedRegistration && (
              <>
                {qrCodeData && (
                  <img
                    src={qrCodeData}
                    alt="User QR Code"
                    className="mx-auto border rounded-lg"
                  />
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* NFT Minting Modal */}
      <Dialog open={showNFTMintingModal} onOpenChange={setShowNFTMintingModal}>
        <DialogContent className="max-w-md">
        <DialogHeader className="space-y-0">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-5 h-5 shrink-0" />
            <DialogTitle className="leading-tight m-0">Complete Event & Mint Certificates</DialogTitle>
          </div>
        </DialogHeader>

          <div className="space-y-4">
            {nftMintingData && (
              <>
                <div className="text-center">


                  <div className="p-3 rounded-lg mb-4" style={{ backgroundColor: '#E8F1EE' }}>
                    <p className="text-sm font-medium" style={{ color: '#1F453A' }}>
                      🏁 Step 1: Complete event on blockchain
                    </p>
                    <p className="text-sm font-medium" style={{ color: '#1F453A' }}>
                      💎 Step 2: Mint certificates for {nftMintingData.recipients.length} attendees
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNFTMintingModal(false);
                      setNftMintingData(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>

                  {(() => {
                    const calls = prepareBatchMintCalls();
                    
                    if (!calls) {
                      return (
                        <Button disabled={true} className="flex-1">
                          Unable to Mint
                        </Button>
                      );
                    }

                    return (
                      <Transaction
                        account={address?.toLowerCase() as `0x${string}`}
                        chainId={BASE_CHAIN_ID}
                        calls={calls}
                        isSponsored={true}
                        onStatus={(status) => {
                          console.log('📋 NFT Minting status:', status);
                          if (status.statusName === 'buildingTransaction') {
                            setMintingNFTs(true);
                          }
                        }}
                        onSuccess={handleNFTMintingSuccess}
                        onError={(error) => {
                          console.error('❌ NFT Minting Transaction Failed:', error);
                          setMintingNFTs(false);
                          alert(`NFT minting failed: ${error?.message || error}`);
                        }}
                      >
                        <TransactionButton
                          text={mintingNFTs ? 'Processing...' : 'Complete & Mint'}
                          disabled={mintingNFTs}
                          className="flex-1 text-white disabled:bg-gray-400"
                          style={{ backgroundColor: '#6A5F7A' }}
                          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                            if (!mintingNFTs) e.currentTarget.style.backgroundColor = '#574C66';
                          }}
                          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                            if (!mintingNFTs) e.currentTarget.style.backgroundColor = '#6A5F7A';
                          }}
                        />
                        <TransactionSponsor />
                        <TransactionStatus>
                          <TransactionStatusLabel />
                          <TransactionStatusAction />
                        </TransactionStatus>
                      </Transaction>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Scanner */}
      {showScannerModal && console.log('🎯 EventCheckInSystem: Rendering QRScanner with:', { 
        eventId: event.id, 
        eventTitle: event.title,
        isShowingScannerModal: showScannerModal 
      })}
      
      {/* Event Completion Modal */}
      {showCompletionModal && (
        <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Award className="w-5 h-5 mr-2" style={{ color: '#3F7A5A' }} />
                Complete Event
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-gray-600">
                This will mark the event as completed and generate NFT certificates for all checked-in attendees ({checkedInCount} people).
              </p>

              <div className="space-y-3">
                <Button
                  onClick={handleCompleteEvent}
                  disabled={processingCompletion || mintingNFTs}
                  className="w-full text-white hover:opacity-90"
                  style={{ backgroundColor: '#3F7A5A' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2F5D50'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3F7A5A'}
                >
                  <Award className="w-4 h-4 mr-2" />
                  {processingCompletion || mintingNFTs ? 'Processing...' : 'Complete & Mint NFTs'}
                </Button>
                
                <Button
                  onClick={async () => {
                    try {
                      setProcessingCompletion(true);
                      await EventService.completeEvent(event.id);
                      await refetch();
                      setShowCompletionModal(false);
                      
                      // Record that NFTs were declined
                      console.log('📝 Event completed without NFT minting - user declined');
                    } catch (error) {
                      console.error('Error completing event:', error);
                    } finally {
                      setProcessingCompletion(false);
                    }
                  }}
                  variant="outline"
                  disabled={processingCompletion || mintingNFTs}
                  className="w-full"
                >
                  Complete Without NFTs
                </Button>
                
                <Button
                  onClick={() => setShowCompletionModal(false)}
                  variant="ghost"
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <QRScanner
        eventId={event.id}
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onCheckInSuccess={handleScanSuccess}
        onCheckInError={handleScanError}
      />
    </div>
  );
};