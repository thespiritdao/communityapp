'use client';
import { use } from 'react';
import { EventDetailView } from '@/features/events/components/EventDetailView';

interface EventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EventPage({ params }: EventPageProps) {
  const resolvedParams = use(params);
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-7xl mx-auto">
        <EventDetailView eventId={resolvedParams.id} />
      </div>
    </div>
  );
}
