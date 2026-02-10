'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  QrCode,
  Camera,
  CheckCircle,
  Clock,
  Users,
  Award,
  Download,
  FileDown,
  User,
  Shield,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import type { EventWithStats, EventRegistration } from '../types/event';
import type {
  CheckInProcessingResult,
  AttendeeExportData,
} from '../types/qr-types';
import { useEventRegistrations } from '../hooks/useEvents';
import { EventService } from '../lib/supabase';
import { QRCodeService } from '../services/QRCodeService';
import { QRScanner } from './QRScanner';

interface EnhancedEventCheckInSystemProps {
  event: EventWithStats;
}

export const EnhancedEventCheckInSystem: React.FC<
  EnhancedEventCheckInSystemProps
> = ({ event }) => {
  const { registrations, loading, refetch } = useEventRegistrations(event.id);
  const [selectedRegistration, setSelectedRegistration] =
    useState<EventRegistration | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [eventQRCode, setEventQRCode] = useState<string>('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [processingCompletion, setProcessingCompletion] = useState(false);
  const [exportData, setExportData] = useState<AttendeeExportData[]>([]);
  const [exporting, setExporting] = useState(false);
  const [recentCheckIns, setRecentCheckIns] = useState<
    CheckInProcessingResult[]
  >([]);
  const [userProfiles, setUserProfiles] = useState<Map<string, any>>(new Map());
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // Fetch user profiles for all registrations
  useEffect(() => {
    const fetchProfiles = async () => {
      if (registrations.length === 0) return;

      setLoadingProfiles(true);
      const profileMap = new Map();

      try {
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              const profile = await EventService.getUserProfileByWallet(
                registration.user_address,
              );
              if (profile) {
                profileMap.set(registration.user_address, profile);
              }
            } catch (error) {
              console.warn(
                `Failed to fetch profile for ${registration.user_address}:`,
                error,
              );
              // Set a default profile without showing wallet address
              profileMap.set(registration.user_address, {
                wallet_address: registration.user_address,
                first_name: '',
                last_name: '',
                profile_picture: null,
              });
            }
          }),
        );
        setUserProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching attendee profiles:', error);
      } finally {
        setLoadingProfiles(false);
      }
    };

    fetchProfiles();
  }, [registrations]);

  // Generate enhanced event QR code
  useEffect(() => {
    const generateEventQR = async () => {
      try {
        const qrCodeURL = await QRCodeService.generateEventQRCode(event);
        setEventQRCode(qrCodeURL);
      } catch (error) {
        console.error('Error generating event QR code:', error);
        toast.error('Failed to generate event QR code');
      }
    };

    generateEventQR();
  }, [event]);

  // Generate enhanced individual user QR code
  const generateUserQR = async (registration: EventRegistration) => {
    try {
      const qrCodeURL = await QRCodeService.generateUserQRCode(
        event.id,
        registration,
      );
      setQrCodeData(qrCodeURL);
      setSelectedRegistration(registration);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating user QR code:', error);
      toast.error('Failed to generate user QR code');
    }
  };

  // Handle manual check-in
  const handleCheckIn = async (registrationId: string) => {
    try {
      setCheckingIn(true);
      await EventService.updateRegistration(registrationId, {
        registration_status: 'checked_in',
        checked_in_at: new Date().toISOString(),
      });
      await refetch();
      toast.success('User checked in successfully');
    } catch (error) {
      console.error('Error checking in user:', error);
      toast.error('Failed to check in user');
    } finally {
      setCheckingIn(false);
    }
  };

  // Handle QR scanner success
  const handleScannerSuccess = (result: CheckInProcessingResult) => {
    setRecentCheckIns((prev) => [result, ...prev.slice(0, 4)]); // Keep last 5 check-ins
    refetch();
    toast.success(result.message);
  };

  // Handle QR scanner error
  const handleScannerError = (error: string) => {
    toast.error(error);
  };

  // Export attendee data
  const handleExportAttendees = async () => {
    try {
      setExporting(true);
      const data = await QRCodeService.exportAttendeeList(event.id, true);
      setExportData(data);
      setShowExportModal(true);
    } catch (error) {
      console.error('Error exporting attendees:', error);
      toast.error('Failed to export attendee data');
    } finally {
      setExporting(false);
    }
  };

  // Download CSV export
  const downloadCSV = () => {
    try {
      const csv = QRCodeService.generateCSVExport(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${event.title}-attendees-${new Date().toISOString().split('T')[0]}.csv`;

      // ✅ FIX: Append to DOM before clicking (required for some browsers/desktop)
      document.body.appendChild(link);
      link.click();

      // ✅ FIX: Clean up after a delay (immediate cleanup can prevent download)
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);

      toast.success('CSV downloaded successfully');
    } catch (error) {
      console.error('Error downloading CSV:', error);
      toast.error('Failed to download CSV. Please try again.');
    }
  };

  // Complete event and process NFTs
  const handleCompleteEvent = async () => {
    try {
      setProcessingCompletion(true);

      await EventService.completeEvent(event.id);

      const checkedInUsers = registrations.filter(
        (reg) => reg.registration_status === 'checked_in',
      );

      for (const registration of checkedInUsers) {
        await EventService.updateRegistration(registration.id, {
          registration_status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }

      await refetch();
      toast.success('Event completed successfully!');
    } catch (error) {
      console.error('Error completing event:', error);
      toast.error('Failed to complete event');
    } finally {
      setProcessingCompletion(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatUserAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(38)}`;
  };

  const registeredCount = registrations.length;
  const checkedInCount = registrations.filter(
    (reg) => reg.registration_status === 'checked_in',
  ).length;
  const completedCount = registrations.filter(
    (reg) => reg.registration_status === 'completed',
  ).length;

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
          <h2 className="text-2xl font-bold">Enhanced Event Check-In</h2>
          <p className="text-gray-600">{event.title}</p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setShowScannerModal(true)}>
            <Camera className="w-4 h-4 mr-2" />
            Scan QR Code
          </Button>

          <Button
            variant="outline"
            onClick={handleExportAttendees}
            disabled={exporting}
          >
            <FileDown className="w-4 h-4 mr-2" />
            {exporting ? 'Exporting...' : 'Export'}
          </Button>

          {event.status === 'published' && checkedInCount > 0 && (
            <Button
              onClick={handleCompleteEvent}
              disabled={processingCompletion}
              className="text-white hover:opacity-90"
              style={{ backgroundColor: '#3F7A5A' }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#2F5D50')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = '#3F7A5A')
              }
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
              <Users className="h-8 w-8" style={{ color: '#2F5D50' }} />
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
              <CheckCircle className="h-8 w-8" style={{ color: '#3F7A5A' }} />
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
              <Award className="h-8 w-8" style={{ color: '#6A5F7A' }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Attendance Rate
                </p>
                <p className="text-2xl font-bold">
                  {registeredCount > 0
                    ? Math.round((checkedInCount / registeredCount) * 100)
                    : 0}
                  %
                </p>
              </div>
              <Clock className="h-8 w-8" style={{ color: '#C6933F' }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Check-ins */}
      {recentCheckIns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle2
                className="w-5 h-5 mr-2"
                style={{ color: '#3F7A5A' }}
              />
              Recent Check-ins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentCheckIns.map((checkIn, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}
                >
                  <div className="flex items-center">
                    <User
                      className="w-4 h-4 mr-2"
                      style={{ color: '#3F7A5A' }}
                    />
                    <span className="font-medium">
                      {checkIn.userProfile?.first_name || 'Unknown'}{' '}
                      {checkIn.userProfile?.last_name || ''}
                    </span>
                    {checkIn.userProfile?.email && (
                      <span className="text-sm text-gray-600 ml-2">
                        ({checkIn.userProfile.email})
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">Just now</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event QR Code and Attendee List */}
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

        {/* Enhanced Registrations List */}
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
                  {registrations.map((registration) => {
                    const profile = userProfiles.get(registration.user_address);
                    const displayName = profile?.first_name && profile?.last_name
                      ? `${profile.first_name} ${profile.last_name}`
                      : profile?.first_name
                        ? profile.first_name
                        : 'Attendee';

                    return (
                      <div
                        key={registration.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-3 flex-1">
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                            {profile?.profile_picture ? (
                              <img
                                src={profile.profile_picture}
                                alt={displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-6 h-6 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {displayName}
                            </div>
                            <div className="text-sm text-gray-600">
                              Registered: {formatTime(registration.registered_at)}
                              {registration.checked_in_at && (
                                <span className="ml-2">
                                  • Checked in:{' '}
                                  {formatTime(registration.checked_in_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            registration.registration_status === 'completed'
                              ? 'default'
                              : registration.registration_status ===
                                  'checked_in'
                                ? 'secondary'
                                : 'outline'
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
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* QR Scanner */}
      <QRScanner
        eventId={event.id}
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onCheckInSuccess={handleScannerSuccess}
        onCheckInError={handleScannerError}
      />

      {/* User QR Code Modal */}
      <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan this Code</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            {selectedRegistration && (
              <>
                <p className="text-sm text-gray-600">
                  QR Code for{' '}
                  {(() => {
                    const profile = userProfiles.get(selectedRegistration.user_address);
                    return profile?.first_name && profile?.last_name
                      ? `${profile.first_name} ${profile.last_name}`
                      : profile?.first_name
                        ? profile.first_name
                        : 'Attendee';
                  })()}
                </p>
                {qrCodeData && (
                  <img
                    src={qrCodeData}
                    alt="User QR Code"
                    className="mx-auto border rounded-lg"
                  />
                )}
                <p className="text-xs text-gray-500">
                  This enhanced QR code includes user profile data and security
                  validation
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Export Attendee Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                {exportData.length} attendees found
              </p>
              <Button onClick={downloadCSV}>
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </Button>
            </div>

            <div className="max-h-96 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {exportData.map((attendee) => (
                    <tr key={attendee.registrationId} className="border-t">
                      <td className="p-2">
                        {attendee.firstName} {attendee.lastName}
                      </td>
                      <td className="p-2">{attendee.email}</td>
                      <td className="p-2">
                        <Badge variant="outline">
                          {attendee.registrationStatus}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {attendee.hasRequiredTokens ? (
                          <Shield
                            className="w-4 h-4"
                            style={{ color: '#3F7A5A' }}
                          />
                        ) : (
                          <AlertTriangle
                            className="w-4 h-4"
                            style={{ color: '#C6933F' }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
