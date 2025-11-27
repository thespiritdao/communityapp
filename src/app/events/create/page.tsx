'use client';
import { SimplifiedEventCreationForm } from '@/features/events/components/SimplifiedEventCreationForm';

export default function CreateEventPage() {
  return (
    <div className="min-h-screen pt-2 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Event</h1>
          <p className="text-gray-600">
            Set up a new event for your community with role gating and fund distribution.
          </p>
        </div>
        
        <SimplifiedEventCreationForm />
      </div>
    </div>
  );
}