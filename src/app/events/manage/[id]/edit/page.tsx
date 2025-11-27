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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <EventEditForm eventId={resolvedParams.id} />
      </div>
    </div>
  );
}