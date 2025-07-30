'use client';

import React from 'react';
import { EventCheckInSystem } from '@/features/events/components/EventCheckInSystem';
import { useEvent } from '@/features/events/hooks/useEvents';
import { useEventAccess } from '@/features/events/hooks/useEventTokenGating';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ManageCheckInPageProps {
  params: {
    id: string;
  };
}

export default function ManageCheckInPage({ params }: ManageCheckInPageProps) {
  const router = useRouter();
  const { event, loading: eventLoading, error: eventError } = useEvent(params.id);
  const { canManage, loading: accessLoading } = useEventAccess(event);

  if (eventLoading || accessLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center space-x-4 mb-6">
              <div className="h-10 w-20 bg-gray-200 rounded"></div>
              <div className="h-8 w-48 bg-gray-200 rounded"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="h-8 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-4">Event Not Found</h2>
              <p className="text-gray-600 mb-4">
                The event you're looking for doesn't exist or is no longer available.
              </p>
              <Button onClick={() => router.back()}>
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
              <p className="text-gray-600 mb-4">
                You don't have permission to manage check-in for this event.
              </p>
              <div className="flex justify-center space-x-4">
                <Button variant="outline" onClick={() => router.back()}>
                  Go Back
                </Button>
                <Button asChild>
                  <Link href={`/events/${event.id}`}>View Event</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center space-x-4 mb-6">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Event Check-In Management</h1>
            <p className="text-gray-600">{event.title}</p>
          </div>
        </div>
        
        <EventCheckInSystem event={event} />
      </div>
    </div>
  );
}