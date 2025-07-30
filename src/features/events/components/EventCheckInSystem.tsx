'use client';

import React, { useState, useEffect } from 'react';
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
  Eye,
  Smartphone
} from 'lucide-react';

import { EventWithStats, EventRegistration } from '../types/event';
import { useEventRegistrations } from '../hooks/useEvents';
import { EventService } from '../lib/supabase';
import QRCode from 'qrcode';

interface EventCheckInSystemProps {
  event: EventWithStats;
}

export const EventCheckInSystem: React.FC<EventCheckInSystemProps> = ({ event }) => {
  const { registrations, loading, refetch } = useEventRegistrations(event.id);
  const [selectedRegistration, setSelectedRegistration] = useState<EventRegistration | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [eventQRCode, setEventQRCode] = useState<string>('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [processingCompletion, setProcessingCompletion] = useState(false);

  // Generate event QR code
  useEffect(() => {
    const generateEventQR = async () => {
      try {
        const qrData = JSON.stringify({
          eventId: event.id,
          eventTitle: event.title,
          checkInUrl: `${window.location.origin}/events/${event.id}/checkin`
        });
        
        const qrCodeURL = await QRCode.toDataURL(qrData, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        setEventQRCode(qrCodeURL);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateEventQR();
  }, [event]);

  // Generate individual user QR code
  const generateUserQR = async (registration: EventRegistration) => {
    try {
      const qrData = JSON.stringify({
        eventId: event.id,
        registrationId: registration.id,
        userAddress: registration.user_address,
        timestamp: Date.now()
      });
      
      const qrCodeURL = await QRCode.toDataURL(qrData, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      setQrCodeData(qrCodeURL);
      setSelectedRegistration(registration);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating user QR code:', error);
    }
  };

  const handleCheckIn = async (registrationId: string) => {
    try {
      setCheckingIn(true);
      await EventService.updateRegistration(registrationId, {
        registration_status: 'checked_in',
        checked_in_at: new Date().toISOString()
      });
      await refetch();
    } catch (error) {
      console.error('Error checking in user:', error);
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCompleteEvent = async () => {
    try {
      setProcessingCompletion(true);
      
      // Mark event as completed
      await EventService.completeEvent(event.id);
      
      // Process completion NFTs for checked-in users
      const checkedInUsers = registrations.filter(
        reg => reg.registration_status === 'checked_in'
      );
      
      for (const registration of checkedInUsers) {
        await EventService.updateRegistration(registration.id, {
          registration_status: 'completed',
          completed_at: new Date().toISOString()
        });
        
        // TODO: Mint completion NFT
        // This would integrate with the EventCompletionNFT contract
      }
      
      await refetch();
    } catch (error) {
      console.error('Error completing event:', error);
    } finally {
      setProcessingCompletion(false);
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Event Check-In</h2>
          <p className="text-gray-600">{event.title}</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => setShowScannerModal(true)}
          >
            <Camera className="w-4 h-4 mr-2" />
            Scan QR Code
          </Button>
          
          {event.status === 'published' && checkedInCount > 0 && (
            <Button
              onClick={handleCompleteEvent}
              disabled={processingCompletion}
              className="bg-green-600 hover:bg-green-700"
            >
              <Award className="w-4 h-4 mr-2" />
              {processingCompletion ? 'Processing...' : 'Complete Event'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Registered</p>
                <p className="text-2xl font-bold">{registeredCount}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Checked In</p>
                <p className="text-2xl font-bold">{checkedInCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
              <Award className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Attendance Rate</p>
                <p className="text-2xl font-bold">
                  {registeredCount > 0 ? Math.round((checkedInCount / registeredCount) * 100) : 0}%
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
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
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {registrations.map((registration) => (
                    <div
                      key={registration.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {registration.user_address.substring(0, 6)}...{registration.user_address.substring(38)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Registered: {formatTime(registration.registered_at)}
                          {registration.checked_in_at && (
                            <span className="ml-2">
                              • Checked in: {formatTime(registration.checked_in_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            registration.registration_status === 'completed' ? 'default' :
                            registration.registration_status === 'checked_in' ? 'secondary' :
                            'outline'
                          }
                        >
                          {registration.registration_status}
                        </Badge>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateUserQR(registration)}
                        >
                          <QrCode className="w-4 h-4 mr-1" />
                          QR
                        </Button>

                        {registration.registration_status === 'registered' && (
                          <Button
                            size="sm"
                            onClick={() => handleCheckIn(registration.id)}
                            disabled={checkingIn}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Check In
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
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
            <DialogTitle>Individual Check-In QR Code</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            {selectedRegistration && (
              <>
                <p className="text-sm text-gray-600">
                  QR Code for {selectedRegistration.user_address.substring(0, 6)}...{selectedRegistration.user_address.substring(38)}
                </p>
                {qrCodeData && (
                  <img
                    src={qrCodeData}
                    alt="User QR Code"
                    className="mx-auto border rounded-lg"
                  />
                )}
                <p className="text-xs text-gray-500">
                  This QR code is unique to this attendee and can be used for check-in
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Modal */}
      <Dialog open={showScannerModal} onOpenChange={setShowScannerModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Check-In QR Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
              <Camera className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-4">
                QR Scanner would be implemented here
              </p>
              <p className="text-sm text-gray-500">
                Use a QR code scanning library like react-qr-scanner
              </p>
            </div>
            
            <div className="flex items-center text-sm text-gray-600">
              <Smartphone className="w-4 h-4 mr-2" />
              <span>Point your camera at the attendee's QR code</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};