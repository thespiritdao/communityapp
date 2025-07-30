'use client';

import React from 'react';
import { EventCreationForm } from '@/features/events/components/EventCreationForm';

export default function CreateEventPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Event</h1>
          <p className="text-gray-600">
            Set up a new event for your community with token gating, agenda management, and fund distribution.
          </p>
        </div>
        
        <EventCreationForm />
      </div>
    </div>
  );
}