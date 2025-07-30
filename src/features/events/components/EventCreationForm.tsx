'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Calendar as CalendarIcon, Clock, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Transaction components for sponsored transactions
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from "@coinbase/onchainkit/transaction";

import { useCreateEvent } from '../hooks/useEvents';
import { usePods, useEventManagementAccess } from '../hooks/useEventTokenGating';
import { useEventTransactions } from '../hooks/useEventTransactions';
import { CreateEventForm, CreateAgendaForm, Pod } from '../types/event';

// Use the same chain ID constant as Cart.tsx
const BASE_CHAIN_ID = 8453;

interface EventCreationFormProps {
  onSuccess?: (eventId: string) => void;
  onCancel?: () => void;
}

export const EventCreationForm: React.FC<EventCreationFormProps> = ({
  onSuccess,
  onCancel
}) => {
  const router = useRouter();
  const { address } = useAccount();
  const { createEvent, loading: creating, error: createError } = useCreateEvent();
  const { pods, loading: podsLoading } = usePods();
  const { canManageEvents, managedPods, loading: accessLoading } = useEventManagementAccess();
  const { 
    getCreateEventSystemCall, 
    getCreateFreeEventCall, 
    getTransactionConfig,
    isConnected 
  } = useEventTransactions();

  // Form state
  const [formData, setFormData] = useState<CreateEventForm>({
    title: '',
    description: '',
    event_date: new Date(),
    event_end_date: undefined,
    location: '',
    max_attendees: undefined,
    price_amount: '0',
    price_self_amount: '0',
    price_token: 'free',
    required_tokens: [],
    organizing_pod_id: '',
    fund_recipient_pod_id: '',
    fund_recipient_type: 'pod',
    event_image_url: '',
    agendas: []
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [locationMode, setLocationMode] = useState<'physical' | 'digital'>('physical');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [currentAgenda, setCurrentAgenda] = useState<CreateAgendaForm>({
    title: '',
    description: '',
    agenda_date: new Date(),
    start_time: '09:00',
    end_time: '10:00',
    sort_order: 0
  });

  // Transaction state
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [transactionCalls, setTransactionCalls] = useState<any[]>([]);

  // Check if user can manage events - only redirect after loading is complete
  useEffect(() => {
    console.log('Access check state change:', { accessLoading, canManageEvents, address });
    if (!accessLoading && !canManageEvents) {
      console.log('Redirecting user - no event management access:', { accessLoading, canManageEvents });
      // Temporarily comment out redirect to debug
      // router.push('/events');
    }
  }, [canManageEvents, accessLoading, router, address]);

  const handleInputChange = (field: keyof CreateEventForm, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTokenToggle = (tokenId: string) => {
    setFormData(prev => ({
      ...prev,
      required_tokens: prev.required_tokens.includes(tokenId)
        ? prev.required_tokens.filter(id => id !== tokenId)
        : [...prev.required_tokens, tokenId]
    }));
  };

  const addAgenda = () => {
    const newAgenda = {
      ...currentAgenda,
      sort_order: formData.agendas.length
    };
    
    setFormData(prev => ({
      ...prev,
      agendas: [...prev.agendas, newAgenda]
    }));
    
    setCurrentAgenda({
      title: '',
      description: '',
      agenda_date: new Date(),
      start_time: '09:00',
      end_time: '10:00',
      sort_order: 0
    });
    
    setShowAgendaForm(false);
  };

  const removeAgenda = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agendas: prev.agendas.filter((_, i) => i !== index)
    }));
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPG or PNG image');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('Image must be less than 5MB');
      return;
    }

    try {
      setUploadingImage(true);

      // Check Supabase auth state
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('Supabase auth state:', { user: user?.id, error: authError });

      if (!user) {
        console.error('User not authenticated in Supabase');
        alert('Please ensure you are signed in to upload images');
        return;
      }

      // Generate unique filename
      const fileExtension = file.name.split('.').pop();
      const fileName = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;

      console.log('Attempting to upload file:', { fileName, fileSize: file.size, fileType: file.type });

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('event-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        alert('Failed to upload image: ' + error.message);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-images')
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) {
        handleInputChange('event_image_url', urlData.publicUrl);
        setImageFile(file);
      }

    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async () => {
    if (formData.event_image_url && imageFile) {
      try {
        // Extract filename from URL to delete from storage
        const urlParts = formData.event_image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        
        await supabase.storage
          .from('event-images')
          .remove([fileName]);
      } catch (error) {
        console.error('Error removing image:', error);
      }
    }
    
    setImageFile(null);
    handleInputChange('event_image_url', '');
  };

  // Simple address suggestions using common venue types
  const getLocationSuggestions = (input: string) => {
    if (!input || input.length < 3 || locationMode !== 'physical') {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    // Basic suggestions - in production, you'd use Google Places API
    const commonVenues = [
      'Convention Center',
      'Community Center', 
      'Public Library',
      'University Campus',
      'Coffee Shop',
      'Restaurant',
      'Park',
      'Hotel Conference Room',
      'Coworking Space',
      'Event Hall'
    ];

    const suggestions = commonVenues
      .filter(venue => venue.toLowerCase().includes(input.toLowerCase()))
      .map(venue => `${input} ${venue}`)
      .slice(0, 5);

    setLocationSuggestions(suggestions);
    setShowLocationSuggestions(suggestions.length > 0);
  };

  const handleLocationInputChange = (value: string) => {
    handleInputChange('location', value);
    if (locationMode === 'physical') {
      getLocationSuggestions(value);
    }
  };

  const selectLocationSuggestion = (suggestion: string) => {
    handleInputChange('location', suggestion);
    setShowLocationSuggestions(false);
    setLocationSuggestions([]);
  };

  const prepareEventCreation = () => {
    if (!formData.title || !formData.description || !address) {
      return null;
    }

    // Generate unique event ID
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get fund recipient (default to organizing pod if not specified)
    const fundRecipientPodId = formData.fund_recipient_pod_id || formData.organizing_pod_id;
    if (!fundRecipientPodId) {
      console.error('No fund recipient pod specified');
      return null;
    }

    // Find the pod
    const fundRecipientPod = pods.find(pod => pod.id === fundRecipientPodId);
    if (!fundRecipientPod) {
      console.error('Fund recipient pod not found:', fundRecipientPodId);
      return null;
    }

    // Since pods don't have contract addresses, use the creator's address as fund recipient for now
    // TODO: In production, this should be replaced with the actual pod contract address or treasury address
    const fundRecipient = address; // Use creator's address as fallback
    
    // FIXED: Ensure event date is in the future to avoid "Event date must be in future" error
    const now = new Date();
    const eventDate = new Date(formData.event_date);
    
    // If the selected date is not in the future (within 5 minutes buffer), add time to make it future
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    let finalEventDate = eventDate;
    
    if (eventDate <= fiveMinutesFromNow) {
      // If event date is too close to now or in the past, schedule it for 5 minutes from now
      finalEventDate = fiveMinutesFromNow;
      console.warn('Event date was too close to current time, adjusted to:', finalEventDate);
    }
    
    console.log('Event creation params:', {
      eventId,
      fundRecipientPodId,
      fundRecipientPod: fundRecipientPod.name,
      fundRecipient,
      originalEventDate: eventDate,
      adjustedEventDate: finalEventDate,
      currentTime: now,
      formData: {
        organizing_pod_id: formData.organizing_pod_id,
        fund_recipient_pod_id: formData.fund_recipient_pod_id
      }
    });

    // Determine if this is a free event
    const isFreeEvent = formData.price_token === 'free' || 
                       (parseFloat(formData.price_amount) === 0 && 
                        parseFloat(formData.price_self_amount || '0') === 0);

    if (isFreeEvent) {
      console.log('Creating free event with params:', {
        eventId,
        title: formData.title,
        eventDate: finalEventDate,
        fundRecipient
      });
      
      return getCreateFreeEventCall(
        eventId,
        formData.title,
        finalEventDate,
        fundRecipient
      );
    } else {
      // Paid event - handle single token or dual token  
      let priceSystem = '0';
      let priceSelf = '0';

      if (formData.price_token === 'dual') {
        // Dual token payment - fix price parsing
        priceSystem = formData.price_amount?.toString() || '0';
        priceSelf = formData.price_self_amount?.toString() || '0';
      } else if (formData.price_token === 'SYSTEM') {
        priceSystem = formData.price_amount?.toString() || '0';
      } else if (formData.price_token === 'SELF') {
        priceSelf = formData.price_amount?.toString() || '0';
      }

      // CRITICAL FIX: Ensure proper decimal format (no leading dots)
      priceSystem = priceSystem.startsWith('.') ? '0' + priceSystem : priceSystem;
      priceSelf = priceSelf.startsWith('.') ? '0' + priceSelf : priceSelf;

      // Validate that at least one price is set for paid events
      if (parseFloat(priceSystem) === 0 && parseFloat(priceSelf) === 0) {
        console.error('Paid event must have at least one non-zero price');
        return null;
      }

      console.log('Creating paid event with params:', {
        eventId,
        title: formData.title,
        eventDate: finalEventDate,
        fundRecipient,
        priceSystem,
        priceSelf
      });

      return getCreateEventSystemCall({
        eventId,
        eventTitle: formData.title,
        eventDate: finalEventDate,
        fundRecipient,
        priceSystem,
        priceSelf
      });
    }
  };

  // Debug logging for render
  console.log('EventCreationForm render:', { accessLoading, canManageEvents, address });

  // Show loading state while checking access
  if (accessLoading) {
    console.log('Showing loading state');
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Checking Access...</h2>
          <p className="text-gray-600 mb-4">
            Verifying your event management permissions...
          </p>
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  if (!canManageEvents) {
    console.log('Showing access denied');
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You need event management permissions to create events.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Debug: accessLoading={accessLoading.toString()}, canManageEvents={canManageEvents.toString()}, address={address}
          </p>
          <Button onClick={() => router.push('/events')}>
            View Events
          </Button>
        </CardContent>
      </Card>
    );
  }

  console.log('Showing event creation form');

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Create New Event</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter event title"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="location">Location</Label>
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setLocationMode('physical')}
                    className={`px-3 py-1 text-sm rounded ${locationMode === 'physical' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                  >
                    Physical Location
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMode('digital')}
                    className={`px-3 py-1 text-sm rounded ${locationMode === 'digital' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                  >
                    Digital Meeting
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleLocationInputChange(e.target.value)}
                    onFocus={() => {
                      if (locationMode === 'physical' && formData.location) {
                        getLocationSuggestions(formData.location);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding suggestions to allow click
                      setTimeout(() => setShowLocationSuggestions(false), 200);
                    }}
                    placeholder={locationMode === 'physical' ? "Start typing address..." : "Enter meeting URL (Zoom, Teams, etc.)"}
                  />
                  
                  {showLocationSuggestions && locationSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1">
                      {locationSuggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          onClick={() => selectLocationSuggestion(suggestion)}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {locationMode === 'digital' && (
                  <p className="text-xs text-gray-500">
                    Examples: Zoom link, Teams meeting, Discord voice channel, etc.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe your event"
              rows={4}
              required
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Event Date *</Label>
              <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.event_date.toLocaleDateString()}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select Event Date</DialogTitle>
                  </DialogHeader>
                  <Calendar
                    mode="single"
                    selected={formData.event_date}
                    onSelect={(date) => {
                      if (date) {
                        handleInputChange('event_date', date);
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
                    {formData.event_end_date?.toLocaleDateString() || 'Select end date'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select End Date</DialogTitle>
                  </DialogHeader>
                  <Calendar
                    mode="single"
                    selected={formData.event_end_date}
                    onSelect={(date) => {
                      handleInputChange('event_end_date', date);
                      setShowEndDatePicker(false);
                    }}
                    initialFocus
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Capacity and Pricing */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="max_attendees">Max Attendees</Label>
              <Input
                id="max_attendees"
                type="number"
                value={formData.max_attendees || ''}
                onChange={(e) => handleInputChange('max_attendees', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Unlimited"
                className="max-w-xs"
              />
            </div>

            <div>
              <Label>Event Pricing</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="pricing_free"
                    name="pricing"
                    checked={formData.price_token === 'free'}
                    onChange={() => {
                      handleInputChange('price_token', 'free');
                      handleInputChange('price_amount', '0');
                      handleInputChange('price_self_amount', '0');
                    }}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="pricing_free">Free Event</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="pricing_single"
                    name="pricing"
                    checked={formData.price_token !== 'free' && formData.price_token !== 'dual'}
                    onChange={() => handleInputChange('price_token', 'SELF')}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="pricing_single">Single Token Payment</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="pricing_dual"
                    name="pricing"
                    checked={formData.price_token === 'dual'}
                    onChange={() => handleInputChange('price_token', 'dual')}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="pricing_dual">Dual Token Payment ($SELF + $SYSTEM)</Label>
                </div>
              </div>

              {formData.price_token !== 'free' && formData.price_token !== 'dual' && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label htmlFor="price_token_select">Token Type</Label>
                    <select
                      id="price_token_select"
                      value={formData.price_token}
                      onChange={(e) => handleInputChange('price_token', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="SELF">$SELF</option>
                      <option value="SYSTEM">$SYSTEM</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="price_amount">Amount</Label>
                    <Input
                      id="price_amount"
                      type="number"
                      step="0.01"
                      value={formData.price_amount}
                      onChange={(e) => handleInputChange('price_amount', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {formData.price_token === 'dual' && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label htmlFor="price_self_amount">$SELF Amount</Label>
                    <Input
                      id="price_self_amount"
                      type="number"
                      step="0.01"
                      value={formData.price_self_amount || '0'}
                      onChange={(e) => handleInputChange('price_self_amount', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price_system_amount">$SYSTEM Amount</Label>
                    <Input
                      id="price_system_amount"
                      type="number"
                      step="0.01"
                      value={formData.price_amount}
                      onChange={(e) => handleInputChange('price_amount', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pod Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="organizing_pod">Organizing Pod</Label>
              <select
                id="organizing_pod"
                value={formData.organizing_pod_id}
                onChange={(e) => handleInputChange('organizing_pod_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select organizing pod</option>
                {managedPods.map((pod) => (
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
                value={formData.fund_recipient_pod_id}
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

          {/* Token Gating */}
          <div>
            <Label>Required Tokens (Token Gating)</Label>
            <div className="mt-2 space-y-2">
              {pods.map((pod) => (
                <div key={pod.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`token-${pod.id}`}
                    checked={formData.required_tokens.includes(pod.id)}
                    onChange={() => handleTokenToggle(pod.id)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor={`token-${pod.id}`}>{pod.name}</Label>
                </div>
              ))}
            </div>
            {formData.required_tokens.length > 0 && (
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

          {/* Event Image */}
          <div>
            <Label>Event Image</Label>
            <div className="space-y-3">
              {!formData.event_image_url ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">Upload an image</p>
                    <p className="text-xs text-gray-500">
                      JPG, PNG up to 5MB
                    </p>
                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        className="hidden"
                        disabled={uploadingImage}
                        id="event-image-upload"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        disabled={uploadingImage}
                        className="cursor-pointer"
                        onClick={() => document.getElementById('event-image-upload')?.click()}
                      >
                        {uploadingImage ? 'Uploading...' : 'Choose File'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <img 
                          src={formData.event_image_url} 
                          alt="Event preview" 
                          className="w-16 h-16 object-cover rounded"
                        />
                        <div>
                          <p className="text-sm font-medium">Image uploaded</p>
                          <p className="text-xs text-gray-500">
                            {imageFile ? `${imageFile.name} (${(imageFile.size / 1024 / 1024).toFixed(2)}MB)` : 'Custom URL'}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Manual URL input option */}
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2">Or paste an image URL</p>
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={formData.event_image_url.startsWith('http') && !imageFile ? formData.event_image_url : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setImageFile(null);
                      handleInputChange('event_image_url', e.target.value);
                    }
                  }}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Agenda Management */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Label>Event Agenda</Label>
              <Dialog open={showAgendaForm} onOpenChange={setShowAgendaForm}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Agenda Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl w-full">
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
                        type="button"
                        variant="outline"
                        onClick={() => setShowAgendaForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
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

            {formData.agendas.length > 0 && (
              <div className="space-y-2">
                {formData.agendas.map((agenda, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
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
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeAgenda(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Display */}
          {createError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{createError}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel || (() => router.push('/events'))}
            >
              Cancel
            </Button>
            
            {/* Transaction Component for Event Creation */}
            {isConnected ? (
              (() => {
                const calls = prepareEventCreation() || [];
                
                // Add detailed transaction validation like in Cart.tsx
                console.group('🔍 Event Transaction Debug');
                console.log('📋 Raw Calls:', calls);
                console.log('📋 Calls Length:', calls.length);
                if (calls.length > 0) {
                  console.log('📋 Contract Address:', calls[0].address);
                  console.log('📋 Function Name:', calls[0].functionName);
                  console.log('📋 Arguments:', calls[0].args);
                  console.log('📋 ABI Available:', Boolean(calls[0].abi));
                  console.log('📋 ABI Length:', calls[0].abi?.length || 0);
                  
                  // Validate transaction data
                  const transactionData = {
                    address: address?.toLowerCase() as `0x${string}`,
                    chainId: BASE_CHAIN_ID,
                    calls: calls,
                    isSponsored: true
                  };
                  
                  // Validate each call
                  calls.forEach((call, index) => {
                    console.log(`📋 Call ${index} Validation:`, {
                      hasAddress: Boolean(call.address),
                      addressFormat: call.address?.startsWith('0x') && call.address?.length === 42,
                      hasABI: Boolean(call.abi),
                      hasFunctionName: Boolean(call.functionName),
                      hasArgs: Array.isArray(call.args),
                      argsLength: call.args?.length || 0,
                      argTypes: call.args?.map(arg => ({
                        value: arg,
                        type: typeof arg,
                        isBigInt: typeof arg === 'bigint'
                      }))
                    });
                  });
                }
                console.groupEnd();
                
                return (
                  <Transaction
                    address={address?.toLowerCase() as `0x${string}`}
                    chainId={BASE_CHAIN_ID}
                    calls={calls}
                    isSponsored={true}
                    onStatus={(status) => {
                      console.log('Event creation status:', status);
                      setIsTransactionPending(status.statusName === 'buildingTransaction');
                    }}
                    onSuccess={async (response) => {
                  console.group('✅ Event Creation Transaction Success');
                  console.log('📋 Full Transaction Response:', response);
                  
                  // Handle Account Abstraction (ERC-4337) transaction response
                  if (response?.userOpHash) {
                    console.log('📋 UserOperation Hash:', response.userOpHash);
                    console.log('📋 This is the AA transaction identifier');
                  }
                  
                  if (response?.transactionReceipts?.[0]) {
                    const receipt = response.transactionReceipts[0];
                    console.log('📋 Bundler Transaction Hash:', receipt.transactionHash);
                    console.log('📋 Block Number:', receipt.blockNumber);
                    console.log('📋 Status:', receipt.status);
                    console.log('📋 Gas Used:', receipt.gasUsed);
                    console.log('📋 To Address:', receipt.to);
                    console.log('📋 From Address:', receipt.from);
                    console.log('📋 Logs Count:', receipt.logs?.length);
                    
                    // Log the actual transaction hash that will appear on BaseScan
                    console.log('📋 BaseScan Transaction URL:', `https://basescan.org/tx/${receipt.transactionHash}`);
                  } else {
                    console.warn('⚠️ No transaction receipt found in response');
                    console.log('📋 Response structure:', Object.keys(response || {}));
                  }
                  console.groupEnd();
                  
                  setIsTransactionPending(false);
                  
                  // Store event data in Supabase after on-chain creation
                  try {
                    const event = await createEvent(formData);
                    if (event) {
                      if (onSuccess) {
                        onSuccess(event.id);
                      } else {
                        router.push(`/events/manage/${event.id}`);
                      }
                    }
                  } catch (error) {
                    console.error('Failed to store event data:', error);
                  }
                }}
                onError={(error) => {
                  console.group('❌ Event Creation Transaction Error');
                  console.error('📋 Error Details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                  });
                  console.error('📋 Error Type:', typeof error);
                  console.error('📋 Error Constructor:', error.constructor.name);
                  console.groupEnd();
                  
                  console.error('Event creation failed:', error);
                  setIsTransactionPending(false);
                }}
              >
                <TransactionButton
                  text={isTransactionPending ? 'Creating Event...' : 'Create Event'}
                  disabled={
                    isTransactionPending || 
                    !formData.title || 
                    !formData.description ||
                    !prepareEventCreation()
                  }
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
                />
                <TransactionSponsor />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            );
          })()
            ) : (
              <Button disabled>
                Connect Wallet to Create Event
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};