'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  QrCode, 
  CheckCircle, 
  Clock, 
  Calendar,
  MapPin,
  Award,
  Download,
  Share2
} from 'lucide-react';

import { EventWithStats, EventRegistration } from '../types/event';
import { useEventRegistration } from '../hooks/useEvents';
import { useAccount } from 'wagmi';
import QRCode from 'qrcode';

interface AttendeeCheckInProps {
  event: EventWithStats;
}

export const AttendeeCheckIn: React.FC<AttendeeCheckInProps> = ({ event }) => {
  const { address } = useAccount();
  const { registration, loading } = useEventRegistration(event.id);
  
  const [userQRCode, setUserQRCode] = useState<string>('');
  const [showQRCode, setShowQRCode] = useState(false);

  // Generate user's check-in QR code
  useEffect(() => {
    const generateQRCode = async () => {
      if (!registration || !address) return;

      try {
        const qrData = JSON.stringify({
          eventId: event.id,
          registrationId: registration.id,
          userAddress: registration.user_address,
          timestamp: Date.now()
        });
        
        const qrCodeURL = await QRCode.toDataURL(qrData, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        setUserQRCode(qrCodeURL);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQRCode();
  }, [registration, address, event.id]);

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
        return 'bg-blue-500';
      case 'checked_in':
        return 'bg-green-500';
      case 'completed':
        return 'bg-purple-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'registered':
        return isEventToday() 
          ? 'Ready for check-in! Show your QR code at the event.'
          : 'You\'re registered! Check in when the event begins.';
      case 'checked_in':
        return 'You\'re checked in! Enjoy the event.';
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
  };

  const shareEvent = async () => {
    const shareData = {
      title: event.title,
      text: `Join me at ${event.title}!`,
      url: `${window.location.origin}/events/${event.id}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback to copying URL to clipboard
        await navigator.clipboard.writeText(shareData.url);
        // You could show a toast message here
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
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
          <Button asChild>
            <a href={`/events/${event.id}`}>
              View Event & Register
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
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
            </div>
            
            <Badge className={`${getStatusColor(registration.registration_status)} text-white`}>
              {registration.registration_status}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 font-medium">
              {getStatusMessage(registration.registration_status)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Check-in QR Code */}
      {(registration.registration_status === 'registered' || registration.registration_status === 'checked_in') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <QrCode className="w-5 h-5 mr-2" />
                Your Check-In QR Code
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              {userQRCode ? (
                <div className="space-y-4">
                  <div 
                    className={`inline-block p-4 bg-white border-2 rounded-lg cursor-pointer transition-transform hover:scale-105 ${
                      isEventToday() ? 'border-green-500 shadow-lg' : 'border-gray-200'
                    }`}
                    onClick={() => setShowQRCode(!showQRCode)}
                  >
                    <img
                      src={userQRCode}
                      alt="Check-in QR Code"
                      className="w-48 h-48 mx-auto"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      {isEventToday() 
                        ? '🟢 Show this QR code to event organizers for check-in'
                        : '⏰ Save this QR code for event check-in'}
                    </p>
                    
                    <div className="flex justify-center space-x-2">
                      <Button variant="outline" size="sm" onClick={downloadQRCode}>
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={shareEvent}>
                        <Share2 className="w-4 h-4 mr-1" />
                        Share Event
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8">
                  <QrCode className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Generating your QR code...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event Information */}
          <Card>
            <CardHeader>
              <CardTitle>Event Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-600">Event Date</p>
                  <p>{formatDateTime(event.event_date)}</p>
                </div>
                
                {event.location && (
                  <div>
                    <p className="font-medium text-gray-600">Location</p>
                    <p>{event.location}</p>
                  </div>
                )}
                
                <div>
                  <p className="font-medium text-gray-600">Registration Status</p>
                  <p className="capitalize">{registration.registration_status.replace('_', ' ')}</p>
                </div>
                
                <div>
                  <p className="font-medium text-gray-600">Registered On</p>
                  <p>{new Date(registration.registered_at).toLocaleDateString()}</p>
                </div>
              </div>

              {registration.checked_in_at && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <div>
                      <p className="font-medium text-green-800">Checked In Successfully</p>
                      <p className="text-sm text-green-600">
                        {new Date(registration.checked_in_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {registration.completed_at && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <Award className="w-5 h-5 text-purple-600 mr-2" />
                    <div>
                      <p className="font-medium text-purple-800">Event Completed</p>
                      <p className="text-sm text-purple-600">
                        Completion NFT issued on {new Date(registration.completed_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Check-In Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium">Arrive at the Event</p>
                <p className="text-sm text-gray-600">
                  Make sure to arrive on time for the event check-in process.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium">Show Your QR Code</p>
                <p className="text-sm text-gray-600">
                  Present your QR code to event organizers or scan it at the check-in station.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium">Attend the Event</p>
                <p className="text-sm text-gray-600">
                  Participate fully in the event to be eligible for completion NFT.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">4</span>
              </div>
              <div>
                <p className="font-medium">Receive Completion NFT</p>
                <p className="text-sm text-gray-600">
                  After the event ends, you'll receive a completion NFT certificate in your wallet.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Helpful Links */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button variant="outline" className="h-auto py-4" asChild>
              <a href={`/events/${event.id}`}>
                <div className="text-center">
                  <Calendar className="w-6 h-6 mx-auto mb-2" />
                  <div>View Event Details</div>
                </div>
              </a>
            </Button>
            
            <Button variant="outline" className="h-auto py-4" asChild>
              <a href="/events">
                <div className="text-center">
                  <Clock className="w-6 h-6 mx-auto mb-2" />
                  <div>View My Events</div>
                </div>
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};