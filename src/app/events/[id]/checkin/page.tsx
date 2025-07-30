'use client';

import React from 'react';
import { AttendeeCheckIn } from '@/features/events/components/AttendeeCheckIn';
import { useEvent } from '@/features/events/hooks/useEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface CheckInPageProps {
  params: {
    id: string;
  };
}

export default function CheckInPage({ params }: CheckInPageProps) {
  const { event, loading, error } = useEvent(params.id);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <Card>
              <CardContent className="p-8">
                <div className="h-32 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-4">Event Not Found</h2>
              <p className="text-gray-600 mb-4">
                The event you're looking for doesn't exist or is no longer available.
              </p>
              <Button asChild>
                <Link href="/events">View All Events</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Event Check-In</h1>
          <p className="text-gray-600">
            Use your QR code to check in to the event
          </p>
        </div>
        
        <AttendeeCheckIn event={event} />
      </div>
    </div>
  );
}