'use client';

import React from 'react';
import { EventDetailView } from '@/features/events/components/EventDetailView';

interface EventPageProps {
  params: {
    id: string;
  };
}

export default function EventPage({ params }: EventPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <EventDetailView eventId={params.id} />
      </div>
    </div>
  );
}