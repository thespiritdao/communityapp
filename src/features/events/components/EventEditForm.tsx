'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  Clock, 
  Save,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';

import { useEvent, useEventAgendas } from '../hooks/useEvents';
import { usePods, useEventAccess } from '../hooks/useEventTokenGating';
import { EventService } from '../lib/supabase';
import { Event, CreateAgendaForm, Pod } from '../types/event';

interface EventEditFormProps {
  eventId: string;
}

export const EventEditForm: React.FC<EventEditFormProps> = ({ eventId }) => {
  const router = useRouter();
  const { event, loading: eventLoading, error: eventError } = useEvent(eventId);
  const { agendas, createAgenda, updateAgenda, deleteAgenda } = useEventAgendas(eventId);
  const { pods } = usePods();
  const { canManage } = useEventAccess(event);

  const [formData, setFormData] = useState<Partial<Event>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [currentAgenda, setCurrentAgenda] = useState<CreateAgendaForm>({
    title: '',
    description: '',
    agenda_date: new Date(),
    start_time: '09:00',
    end_time: '10:00',
    sort_order: 0
  });
  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data when event loads
  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        description: event.description,
        event_date: event.event_date,
        event_end_date: event.event_end_date,
        location: event.location,
        max_attendees: event.max_attendees,
        price_amount: event.price_amount,
        price_token: event.price_token,
        required_tokens: event.required_tokens,
        organizing_pod_id: event.organizing_pod_id,
        fund_recipient_pod_id: event.fund_recipient_pod_id,
        fund_recipient_type: event.fund_recipient_type,
        event_image_url: event.event_image_url
      });
    }
  }, [event]);

  if (eventLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-32 bg-gray-200 rounded w-full"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Event Not Found</h2>
          <p className="text-gray-600 mb-4">
            The event you're trying to edit doesn't exist or you don't have permission to edit it.
          </p>
          <Button onClick={() => router.back()}>
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canManage) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You don't have permission to edit this event.
          </p>
          <Button onClick={() => router.back()}>
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleInputChange = (field: keyof Event, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTokenToggle = (tokenId: string) => {
    setFormData(prev => ({
      ...prev,
      required_tokens: prev.required_tokens?.includes(tokenId)
        ? prev.required_tokens.filter(id => id !== tokenId)
        : [...(prev.required_tokens || []), tokenId]
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      await EventService.updateEvent(eventId, formData);
      
      // Show success message and redirect
      router.push(`/events/manage`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const addAgenda = async () => {
    const success = await createAgenda(currentAgenda);
    if (success) {
      setCurrentAgenda({
        title: '',
        description: '',
        agenda_date: new Date(),
        start_time: '09:00',
        end_time: '10:00',
        sort_order: agendas.length
      });
      setShowAgendaForm(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit Event</h1>
            <p className="text-gray-600">{event.title}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => router.push(`/events/${eventId}`)}>
            View Event
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Edit Form */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details">Event Details</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Event Title</Label>
                  <Input
                    id="title"
                    value={formData.title || ''}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter event title"
                  />
                </div>
                
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location || ''}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="Enter event location"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe your event"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Event Date</Label>
                  <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.event_date ? new Date(formData.event_date).toLocaleDateString() : 'Select date'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Select Event Date</DialogTitle>
                      </DialogHeader>
                      <Calendar
                        mode="single"
                        selected={formData.event_date ? new Date(formData.event_date) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            handleInputChange('event_date', date.toISOString());
                            setShowDatePicker(false);
                          }
                        }}
                        initialFocus
                      />
                    </DialogContent>
                  </Dialog>
                </div>

                <div>
                  <Label>End Date (Optional)</Label>
                  <Dialog open={showEndDatePicker} onOpenChange={setShowEndDatePicker}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.event_end_date ? new Date(formData.event_end_date).toLocaleDateString() : 'Select end date'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Select End Date</DialogTitle>
                      </DialogHeader>
                      <Calendar
                        mode="single"
                        selected={formData.event_end_date ? new Date(formData.event_end_date) : undefined}
                        onSelect={(date) => {
                          handleInputChange('event_end_date', date?.toISOString());
                          setShowEndDatePicker(false);
                        }}
                        initialFocus
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div>
                <Label htmlFor="event_image">Event Image URL</Label>
                <Input
                  id="event_image"
                  value={formData.event_image_url || ''}
                  onChange={(e) => handleInputChange('event_image_url', e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing & Capacity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="max_attendees">Max Attendees</Label>
                  <Input
                    id="max_attendees"
                    type="number"
                    value={formData.max_attendees || ''}
                    onChange={(e) => handleInputChange('max_attendees', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Unlimited"
                  />
                </div>

                <div>
                  <Label htmlFor="price_token">Price Token</Label>
                  <select
                    id="price_token"
                    value={formData.price_token || 'free'}
                    onChange={(e) => handleInputChange('price_token', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="free">Free</option>
                    <option value="SELF">$SELF</option>
                    <option value="SYSTEM">$SYSTEM</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="price_amount">Price Amount</Label>
                  <Input
                    id="price_amount"
                    type="number"
                    step="0.01"
                    value={formData.price_amount || '0'}
                    onChange={(e) => handleInputChange('price_amount', e.target.value)}
                    placeholder="0"
                    disabled={formData.price_token === 'free'}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Event Agenda</CardTitle>
                <Dialog open={showAgendaForm} onOpenChange={setShowAgendaForm}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Agenda Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Agenda Item</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="agenda_title">Title</Label>
                        <Input
                          id="agenda_title"
                          value={currentAgenda.title}
                          onChange={(e) => setCurrentAgenda(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Agenda item title"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="agenda_description">Description</Label>
                        <Textarea
                          id="agenda_description"
                          value={currentAgenda.description}
                          onChange={(e) => setCurrentAgenda(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Agenda item description"
                          rows={3}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="start_time">Start Time</Label>
                          <Input
                            id="start_time"
                            type="time"
                            value={currentAgenda.start_time}
                            onChange={(e) => setCurrentAgenda(prev => ({ ...prev, start_time: e.target.value }))}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="end_time">End Time</Label>
                          <Input
                            id="end_time"
                            type="time"
                            value={currentAgenda.end_time}
                            onChange={(e) => setCurrentAgenda(prev => ({ ...prev, end_time: e.target.value }))}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowAgendaForm(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={addAgenda}
                          disabled={!currentAgenda.title}
                        >
                          Add Item
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {agendas.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500 mb-4">No agenda items yet</p>
                  <Button onClick={() => setShowAgendaForm(true)}>
                    Add First Agenda Item
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {agendas.map((agenda) => (
                    <div key={agenda.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{agenda.title}</div>
                        <div className="text-sm text-gray-600">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {agenda.start_time} - {agenda.end_time}
                        </div>
                        {agenda.description && (
                          <div className="text-sm text-gray-500 mt-1">{agenda.description}</div>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteAgenda(agenda.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pod Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="organizing_pod">Organizing Pod</Label>
                  <select
                    id="organizing_pod"
                    value={formData.organizing_pod_id || ''}
                    onChange={(e) => handleInputChange('organizing_pod_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select organizing pod</option>
                    {pods.map((pod) => (
                      <option key={pod.id} value={pod.id}>
                        {pod.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="fund_recipient">Fund Recipient</Label>
                  <select
                    id="fund_recipient"
                    value={formData.fund_recipient_pod_id || ''}
                    onChange={(e) => handleInputChange('fund_recipient_pod_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select fund recipient</option>
                    {pods.map((pod) => (
                      <option key={pod.id} value={pod.id}>
                        {pod.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Gating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label>Required Tokens</Label>
                {pods.map((pod) => (
                  <div key={pod.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`token-${pod.id}`}
                      checked={formData.required_tokens?.includes(pod.id) || false}
                      onChange={() => handleTokenToggle(pod.id)}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor={`token-${pod.id}`}>{pod.name}</Label>
                  </div>
                ))}
                {formData.required_tokens && formData.required_tokens.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData.required_tokens.map((tokenId) => {
                      const pod = pods.find(p => p.id === tokenId);
                      return pod ? (
                        <Badge key={tokenId} variant="secondary">
                          {pod.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};