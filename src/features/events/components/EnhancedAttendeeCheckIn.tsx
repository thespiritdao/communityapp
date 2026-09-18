'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  QrCode,
  CheckCircle,
  Clock,
  Calendar,
  MapPin,
  Award,
  Download,
  Share2,
  User,
  Mail,
  Shield,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';

import type { EventWithStats } from '../types/event';
import type { UserProfile } from '../types/qr-types';
import { useEventRegistration } from '../hooks/useEvents';
import { useUserWallet } from '@/hooks/useUserWallet';
import { QRCodeService } from '../services/QRCodeService';

interface EnhancedAttendeeCheckInProps {
  event: EventWithStats;
}

export const EnhancedAttendeeCheckIn: React.FC<
  EnhancedAttendeeCheckInProps
> = ({ event }) => {
  const address = useUserWallet();
  const { registration, loading } = useEventRegistration(event.id);

  const [userQRCode, setUserQRCode] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [tokenValidation, setTokenValidation] = useState<{
    hasAccess: boolean;
    loading: boolean;
    error?: string;
  }>({ hasAccess: true, loading: false });

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!address) return;

      try {
        // This would use the existing user profile service
        const { data, error } = await supabase
          .from('public_profiles')
          .select('*')
          .eq('wallet_address', address.toLowerCase())
          .single();

        if (!error && data) {
          setUserProfile(data);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    fetchUserProfile();
  }, [address]);

  // Generate enhanced user QR code
  useEffect(() => {
    const generateQRCode = async () => {
      if (!registration || !address) return;

      try {
        setGeneratingQR(true);
        const qrCodeURL = await QRCodeService.generateUserQRCode(
          event.id,
          registration,
          userProfile || undefined,
        );
        setUserQRCode(qrCodeURL);
      } catch (error) {
        console.error('Error generating enhanced QR code:', error);
        toast.error('Failed to generate QR code');
      } finally {
        setGeneratingQR(false);
      }
    };

    generateQRCode();
  }, [registration, address, event.id, userProfile]);

  // Validate token access
  useEffect(() => {
    const validateTokens = async () => {
      if (
        !address ||
        !event.required_tokens ||
        event.required_tokens.length === 0
      ) {
        setTokenValidation({ hasAccess: true, loading: false });
        return;
      }

      try {
        setTokenValidation((prev) => ({ ...prev, loading: true }));

        // Use existing token validation logic
        const balances = await fetchTokenBalances(address);
        const hasAccess =
          balances.hasEventManagement || balances.hasExecutivePod;

        setTokenValidation({ hasAccess, loading: false });
      } catch (error) {
        console.error('Error validating tokens:', error);
        setTokenValidation({
          hasAccess: false,
          loading: false,
          error: 'Failed to validate token access',
        });
      }
    };

    validateTokens();
  }, [address, event.required_tokens]);

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isEventToday = () => {
    const eventDate = new Date(event.event_date);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  };

  const isEventStarted = () => {
    return new Date(event.event_date) <= new Date();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'registered':
        return 'bg-[#2F5D50]';
      case 'checked_in':
        return 'bg-[#3F7A5A]';
      case 'completed':
        return 'bg-[#2F5D50]';
      case 'cancelled':
        return 'bg-[#8B3A3A]';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusMessage = (status: string) => {
    if (!tokenValidation.hasAccess) {
      return 'You need required tokens to access this event. Please check your wallet.';
    }

    switch (status) {
      case 'registered':
        return isEventToday()
          ? 'Ready for check-in! Show your QR code at the event.'
          : "You're registered! Check in when the event begins.";
      case 'checked_in':
        return "You're checked in! Enjoy the event.";
      case 'completed':
        return 'Event completed! Your completion NFT should be in your wallet.';
      case 'cancelled':
        return 'Your registration was cancelled.';
      default:
        return '';
    }
  };

  const downloadQRCode = () => {
    if (!userQRCode) return;

    const link = document.createElement('a');
    link.download = `${event.title}-checkin-qr.png`;
    link.href = userQRCode;
    link.click();
    toast.success('QR code downloaded');
  };

  const shareEvent = async () => {
    const shareData = {
      title: event.title,
      text: `Join me at ${event.title}!`,
      url: `${window.location.origin}/events/${event.id}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Event link copied to clipboard');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      toast.error('Failed to share event');
    }
  };

  const addToCalendar = () => {
    const startDate = new Date(event.event_date);
    const endDate = event.event_end_date
      ? new Date(event.event_end_date)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${formatDate(startDate)}/${formatDate(endDate)}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location || '')}`;

    window.open(calendarUrl, '_blank');
  };

  if (loading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!registration) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Not Registered</h2>
          <p className="text-gray-600 mb-4">
            You need to register for this event to access check-in.
          </p>
          <Button asChild={true}>
            <a href={`/events/${event.id}`}>View Event & Register</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Enhanced Header with User Profile */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-2xl">{event.title}</CardTitle>
              <div className="flex items-center space-x-4 mt-2 text-gray-600">
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  {formatDateTime(event.event_date)}
                </div>
                {event.location && (
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {event.location}
                  </div>
                )}
              </div>

              {/* User Profile Summary */}
              {userProfile && (
                <div
                  className="mt-3 p-3 rounded-lg"
                  style={{
                    backgroundColor: '#E8F1EE',
                    border: '1px solid #B8D9CA',
                  }}
                >
                  <div className="flex items-center">
                    <User
                      className="w-4 h-4 mr-2"
                      style={{ color: '#2F5D50' }}
                    />
                    <span className="font-medium" style={{ color: '#1F453A' }}>
                      {userProfile.first_name} {userProfile.last_name}
                    </span>
                    {userProfile.email && (
                      <>
                        <Mail
                          className="w-4 h-4 ml-4 mr-1"
                          style={{ color: '#2F5D50' }}
                        />
                        <span style={{ color: '#2F5D50' }}>
                          {userProfile.email}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end space-y-2">
              <Badge
                className={`${getStatusColor(registration.registration_status)} text-white`}
              >
                {registration.registration_status.replace('_', ' ')}
              </Badge>

              {/* Token Validation Status */}
              {tokenValidation.loading ? (
                <Badge variant="outline">Checking tokens...</Badge>
              ) : tokenValidation.hasAccess ? (
                <Badge
                  variant="outline"
                  style={{ borderColor: '#3F7A5A', color: '#3F7A5A' }}
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Token access verified
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  style={{ borderColor: '#8B3A3A', color: '#8B3A3A' }}
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Token access required
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Alert
            style={{
              borderColor: tokenValidation.hasAccess ? '#B8D9CA' : '#E8CBCB',
              backgroundColor: tokenValidation.hasAccess
                ? '#E8F1EE'
                : '#F5E6E6',
            }}
          >
            <AlertDescription
              style={{
                color: tokenValidation.hasAccess ? '#1F453A' : '#5C1F1F',
              }}
            >
              {getStatusMessage(registration.registration_status)}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Enhanced Check-in QR Code */}
      {(registration.registration_status === 'registered' ||
        registration.registration_status === 'checked_in') &&
        tokenValidation.hasAccess && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <QrCode className="w-5 h-5 mr-2" />
                  Your Enhanced Check-In QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                {generatingQR ? (
                  <div className="py-8">
                    <QrCode className="w-16 h-16 mx-auto text-gray-400 mb-4 animate-pulse" />
                    <p className="text-gray-500">
                      Generating enhanced QR code...
                    </p>
                  </div>
                ) : userQRCode ? (
                  <div className="space-y-4">
                    <div
                      className="inline-block p-4 bg-white border-2 rounded-lg cursor-pointer transition-transform hover:scale-105"
                      style={{
                        borderColor: isEventToday() ? '#3F7A5A' : '#e5e7eb',
                        boxShadow: isEventToday()
                          ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          : 'none',
                      }}
                      onClick={() => setShowQRCode(!showQRCode)}
                    >
                      <img
                        src={userQRCode}
                        alt="Enhanced Check-in QR Code"
                        className="w-48 h-48 mx-auto"
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        {isEventToday()
                          ? '🟢 Show this QR code to event organizers for check-in'
                          : '⏰ Save this QR code for event check-in'}
                      </p>

                      <div
                        className="text-xs p-2 rounded border"
                        style={{
                          color: '#2F5D50',
                          backgroundColor: '#E8F1EE',
                          borderColor: '#B8D9CA',
                        }}
                      >
                        ✨ Enhanced with profile data and security validation
                      </div>

                      <div className="flex justify-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadQRCode}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={shareEvent}
                        >
                          <Share2 className="w-4 h-4 mr-1" />
                          Share Event
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addToCalendar}
                        >
                          <Calendar className="w-4 h-4 mr-1" />
                          Add to Calendar
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8">
                    <QrCode className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">Unable to generate QR code</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enhanced Event Information */}
            <Card>
              <CardHeader>
                <CardTitle>Event & Registration Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div className="p-3 bg-gray-50 rounded border">
                    <p className="font-medium text-gray-600 mb-1">Event Date</p>
                    <p>{formatDateTime(event.event_date)}</p>
                  </div>

                  {event.location && (
                    <div className="p-3 bg-gray-50 rounded border">
                      <p className="font-medium text-gray-600 mb-1">Location</p>
                      <p>{event.location}</p>
                    </div>
                  )}

                  <div className="p-3 bg-gray-50 rounded border">
                    <p className="font-medium text-gray-600 mb-1">
                      Registration Status
                    </p>
                    <p className="capitalize">
                      {registration.registration_status.replace('_', ' ')}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded border">
                    <p className="font-medium text-gray-600 mb-1">
                      Registered On
                    </p>
                    <p>
                      {new Date(
                        registration.registered_at,
                      ).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Token Requirements */}
                  {event.required_tokens &&
                    event.required_tokens.length > 0 && (
                      <div className="p-3 bg-gray-50 rounded border">
                        <p className="font-medium text-gray-600 mb-1">
                          Token Requirements
                        </p>
                        <div className="flex items-center">
                          <Shield
                            className="w-4 h-4 mr-2"
                            style={{
                              color: tokenValidation.hasAccess
                                ? '#3F7A5A'
                                : '#8B3A3A',
                            }}
                          />
                          <span
                            style={{
                              color: tokenValidation.hasAccess
                                ? '#3F7A5A'
                                : '#8B3A3A',
                            }}
                          >
                            {tokenValidation.hasAccess
                              ? 'Requirements met'
                              : 'Missing required tokens'}
                          </span>
                        </div>
                      </div>
                    )}
                </div>

                {registration.checked_in_at && (
                  <div
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: '#E8F1EE',
                      border: '1px solid #B8D9CA',
                    }}
                  >
                    <div className="flex items-center">
                      <CheckCircle
                        className="w-5 h-5 mr-2"
                        style={{ color: '#3F7A5A' }}
                      />
                      <div>
                        <p className="font-medium" style={{ color: '#1F453A' }}>
                          Checked In Successfully
                        </p>
                        <p className="text-sm" style={{ color: '#3F7A5A' }}>
                          {new Date(
                            registration.checked_in_at,
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {registration.completed_at && (
                  <div
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: '#E8F1EE',
                      border: '1px solid #B8D9CA',
                    }}
                  >
                    <div className="flex items-center">
                      <Award
                        className="w-5 h-5 mr-2"
                        style={{ color: '#2F5D50' }}
                      />
                      <div>
                        <p className="font-medium" style={{ color: '#1F453A' }}>
                          Event Completed
                        </p>
                        <p className="text-sm" style={{ color: '#2F5D50' }}>
                          Completion NFT issued on{' '}
                          {new Date(
                            registration.completed_at,
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      {/* Enhanced Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Enhanced Check-In Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div
                className="rounded-full p-2 flex-shrink-0"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <span
                  className="font-bold text-sm"
                  style={{ color: '#2F5D50' }}
                >
                  1
                </span>
              </div>
              <div>
                <p className="font-medium">Verify Token Access</p>
                <p className="text-sm text-gray-600">
                  Ensure your wallet contains the required tokens for this
                  event.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div
                className="rounded-full p-2 flex-shrink-0"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <span
                  className="font-bold text-sm"
                  style={{ color: '#2F5D50' }}
                >
                  2
                </span>
              </div>
              <div>
                <p className="font-medium">Arrive at the Event</p>
                <p className="text-sm text-gray-600">
                  Make sure to arrive on time for the event check-in process.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div
                className="rounded-full p-2 flex-shrink-0"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <span
                  className="font-bold text-sm"
                  style={{ color: '#2F5D50' }}
                >
                  3
                </span>
              </div>
              <div>
                <p className="font-medium">Show Your Enhanced QR Code</p>
                <p className="text-sm text-gray-600">
                  Present your QR code to event organizers. The enhanced code
                  includes your profile data for faster check-in.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div
                className="rounded-full p-2 flex-shrink-0"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <span
                  className="font-bold text-sm"
                  style={{ color: '#2F5D50' }}
                >
                  4
                </span>
              </div>
              <div>
                <p className="font-medium">Attend the Event</p>
                <p className="text-sm text-gray-600">
                  Participate fully in the event to be eligible for completion
                  NFT.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div
                className="rounded-full p-2 flex-shrink-0"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <span
                  className="font-bold text-sm"
                  style={{ color: '#2F5D50' }}
                >
                  5
                </span>
              </div>
              <div>
                <p className="font-medium">Receive Completion NFT</p>
                <p className="text-sm text-gray-600">
                  After the event ends, you'll receive a completion NFT
                  certificate in your wallet.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Helpful Links */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto py-4" asChild={true}>
              <a href={`/events/${event.id}`}>
                <div className="text-center">
                  <Calendar className="w-6 h-6 mx-auto mb-2" />
                  <div>View Event Details</div>
                </div>
              </a>
            </Button>

            <Button variant="outline" className="h-auto py-4" asChild={true}>
              <a href="/events">
                <div className="text-center">
                  <Clock className="w-6 h-6 mx-auto mb-2" />
                  <div>View My Events</div>
                </div>
              </a>
            </Button>

            <Button variant="outline" className="h-auto py-4" asChild={true}>
              <a href="/profile">
                <div className="text-center">
                  <User className="w-6 h-6 mx-auto mb-2" />
                  <div>Update Profile</div>
                </div>
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mobile App Promotion */}
      {isEventToday() && (
        <Card style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Smartphone
                  className="w-5 h-5 mr-2"
                  style={{ color: '#3F7A5A' }}
                />
                <div>
                  <p className="font-medium" style={{ color: '#1F453A' }}>
                    Event Day Tip
                  </p>
                  <p className="text-sm" style={{ color: '#2F5D50' }}>
                    Download your QR code to your phone for easy access at the
                    venue
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={downloadQRCode}>
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
