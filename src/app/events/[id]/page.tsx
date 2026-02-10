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
    <div className="min-h-screen p-4 pb-24" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
      <div className="max-w-7xl mx-auto">
        <EventDetailView eventId={resolvedParams.id} />
      </div>
    </div>
  );
}
