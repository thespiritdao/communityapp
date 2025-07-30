'use client';

import React from 'react';
import { EventEditForm } from '@/features/events/components/EventEditForm';

interface EditEventPageProps {
  params: {
    id: string;
  };
}

export default function EditEventPage({ params }: EditEventPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <EventEditForm eventId={params.id} />
      </div>
    </div>
  );
}