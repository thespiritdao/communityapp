'use client';
import { use } from 'react';
import { EventEditForm } from '@/features/events/components/EventEditForm';

interface EditEventPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditEventPage({ params }: EditEventPageProps) {
  const resolvedParams = use(params);

  return (
    <div className="min-h-screen p-4" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
      <div className="max-w-7xl mx-auto">
        <EventEditForm eventId={resolvedParams.id} />
      </div>
    </div>
  );
}
