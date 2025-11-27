'use client';

import { useAuthContext } from '@/features/identity';
import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useConfig } from 'wagmi';
import { Card, CardContent, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar as CalendarIcon } from 'lucide-react';

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
import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import { base } from 'viem/chains';
import type { CreateEventForm } from '../types/event';
import { supabase } from '@/lib/supabase';
import { EventService } from '../lib/supabase';

// Use the same chain ID constant
const BASE_CHAIN_ID = 8453;

interface SimplifiedEventCreationFormProps {
  onSuccess?: (eventId: string) => void;
  onCancel?: () => void;
}

interface EventFormData {
  title: string;
  description: string;
  event_date: Date;
  event_end_date: Date;
  location: string;
  max_attendees: number | undefined;
  price_system: string;  // SYSTEM token amount
  price_self: string;    // SELF token amount
  price_token: 'free' | 'SYSTEM' | 'SELF' | 'both';
  organizing_pod_id: string;
  fund_recipient_pod_id: string;
  required_tokens: string[]; // Array of token IDs required for event access
}

export const SimplifiedEventCreationForm: React.FC<SimplifiedEventCreationFormProps> = ({
  onSuccess,
  onCancel
}) => {
  const router = useRouter();
  const { address } = useAccount();
  const config = useConfig();
  const { createEvent, loading: creating, error: createError } = useCreateEvent();
  const { pods, loading: podsLoading } = usePods();
  const { canManageEvents, managedPods, loading: accessLoading } = useEventManagementAccess();
  const { 
    getCreateEventCall, 
    getTransactionConfig,
    isConnected 
  } = useSimplifiedEventTransactions();

  // Form state with smart defaults for testing
  const [formData, setFormData] = useState<EventFormData>(() => {
    // More reasonable defaults: Start tomorrow, end 8 hours later for longer testing window
    const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000); // 8 hours after start
    
    return {
      title: '',
      description: '',
      event_date: startDate,
      event_end_date: endDate,
      location: '',
      max_attendees: undefined,
      price_system: '0',
      price_self: '0',
      price_token: 'free',
      organizing_pod_id: '',
      fund_recipient_pod_id: '',
      required_tokens: [] // Default to no required tokens
    };
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [eventId] = useState(() => `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [transactionCompleted, setTransactionCompleted] = useState(false);

  // Debug helper to check current time vs form data
  useEffect(() => {
    const interval = setInterval(() => {
  const { session, isAuthenticated, signIn } = useAuthContext();
      const now = new Date();
      const timeDiff = formData.event_date.getTime() - now.getTime();
      const endTimeDiff = formData.event_end_date.getTime() - now.getTime();
      
      console.log('⏰ Time check:', {
        now: now.toISOString(),
        startDate: formData.event_date.toISOString(),
        endDate: formData.event_end_date.toISOString(),
        minutesToStart: Math.round(timeDiff / 60000),
        minutesToEnd: Math.round(endTimeDiff / 60000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    }, 30000); // Log every 30 seconds

    return () => clearInterval(interval);
  }, [formData.event_date, formData.event_end_date]);

  // Check access permissions
  useEffect(() => {
    if (!accessLoading && !canManageEvents) {
      console.log('Redirecting - no event management access');
      // router.push('/events'); // Commented for debugging
    }
  }, [canManageEvents, accessLoading, router]);

  const handleInputChange = (field: keyof EventFormData, value: any) => {
    if (field === 'required_tokens') {
      console.log('🔍 Required tokens selection changed:', { field, value, currentFormData: formData.required_tokens });
    }
    
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-adjust end date if start date changes
      if (field === 'event_date' && value instanceof Date) {
        // Keep the same duration but adjust end date
        const currentDuration = prev.event_end_date.getTime() - prev.event_date.getTime();
        updated.event_end_date = new Date(value.getTime() + currentDuration);
      }
      
      return updated;
    });
  };

  // Memoized validation
  const validation = useMemo(() => {
    const errors: string[] = [];
    
    if (!formData.title) errors.push('Title Required');
    if (!formData.location) errors.push('Location Required');
    if (!formData.description) errors.push('Description Required');
    if (!address) errors.push('Wallet not connected');
    
    // Date validation
    if (formData.event_end_date <= formData.event_date) {
      errors.push('End date must be after start date');
    }
    
    // Pricing validation
    if (formData.price_token === 'SYSTEM' && (!formData.price_system || Number.parseFloat(formData.price_system) <= 0)) {
      errors.push('SYSTEM token price must be greater than 0');
    }
    if (formData.price_token === 'SELF' && (!formData.price_self || Number.parseFloat(formData.price_self) <= 0)) {
      errors.push('SELF token price must be greater than 0');
    }
    if (formData.price_token === 'both') {
      if ((!formData.price_system || Number.parseFloat(formData.price_system) <= 0) || 
          (!formData.price_self || Number.parseFloat(formData.price_self) <= 0)) {
        errors.push('Both SYSTEM and SELF token prices must be greater than 0');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }, [formData, address]);

  // Memoized transaction parameters
  const transactionParams = useMemo(() => {
    if (!validation.isValid || !address) return null;
    
    const fundRecipientPodId = formData.fund_recipient_pod_id || formData.organizing_pod_id;
    let fundRecipient = address;

    if (fundRecipientPodId) {
      const fundRecipientPod = pods.find(pod => pod.id === fundRecipientPodId);
      if (fundRecipientPod && fundRecipientPod.treasury_contract_address) {
        // Use pod treasury address if available
        fundRecipient = fundRecipientPod.treasury_contract_address;
        console.log('💰 Event funds will go to pod treasury:', {
          podName: fundRecipientPod.name,
          podId: fundRecipientPodId,
          treasuryAddress: fundRecipient
        });
      } else if (fundRecipientPod) {
        // Fallback to user address if treasury not deployed yet
        console.warn('⚠️ Pod treasury not deployed yet, using creator address as fallback:', {
          podName: fundRecipientPod.name,
          podId: fundRecipientPodId,
          fallbackAddress: address
        });
        fundRecipient = address;
      }
    }

    let priceSystemAmount = '0';
    let priceSelfAmount = '0';

    if (formData.price_token === 'SYSTEM') {
      priceSystemAmount = formData.price_system;
    } else if (formData.price_token === 'SELF') {
      priceSelfAmount = formData.price_self;
    } else if (formData.price_token === 'both') {
      priceSystemAmount = formData.price_system;
      priceSelfAmount = formData.price_self;
    }

    return {
      eventId,
      title: formData.title,
      eventDate: formData.event_date,
      fundRecipient,
      priceSystem: priceSystemAmount,
      priceSelf: priceSelfAmount,
      maxAttendees: formData.max_attendees || 0
    };
  }, [validation.isValid, address, formData, pods, eventId]);

  // Memoized transaction calls
  const transactionCalls = useMemo(() => {
    if (!transactionParams) return null;
    return getCreateEventCall(transactionParams);
  }, [transactionParams, getCreateEventCall]);

  // Transaction success handler
  const handleTransactionSuccess = useCallback(async (response: any) => {
    console.log('✅ Event creation successful:', response);
    setIsTransactionPending(false);
    setTransactionCompleted(true);

    try {
      // Ensure user is authenticated with Supabase before storing event data
      // Using centralized auth session
      
      if (!isAuthenticated || !session?.user?.id) {
        console.log('🔐 No Supabase session, attempting authentication...');
        
        // Get nonce and sign message for authentication
        const nonceRes = await fetch('/api/auth/nonce');
        if (!nonceRes.ok) {
          throw new Error('Failed to get nonce');
        }
        const { nonce } = await nonceRes.json();

        // Import signMessage dynamically
        const { signMessage } = await import('wagmi/actions');
        const signature = await signMessage(config, { message: nonce });

        // Verify and get Supabase token
        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, signature }),
        });

        if (!verifyRes.ok) {
          throw new Error('Authentication failed');
        }

        const { supabaseToken } = await verifyRes.json();
        
        if (supabaseToken) {
          const { error } = await supabase.auth.setSession({
            access_token: supabaseToken,
            refresh_token: '',
          });
          
          if (error) {
            throw new Error('Failed to set session');
          }
          
          console.log('✅ Successfully authenticated with Supabase');
        }
      }
      // Determine price amounts based on token selection
      let dbPriceAmount = '0';
      let dbPriceSelfAmount = '0';
      let dbPriceToken: 'free' | 'SELF' | 'SYSTEM' | 'dual' = 'free';

      if (formData.price_token === 'SYSTEM') {
        dbPriceAmount = formData.price_system;
        dbPriceToken = 'SYSTEM';
      } else if (formData.price_token === 'SELF') {
        dbPriceAmount = formData.price_self;
        dbPriceSelfAmount = formData.price_self;
        dbPriceToken = 'SELF';
      } else if (formData.price_token === 'both') {
        dbPriceAmount = formData.price_system;
        dbPriceSelfAmount = formData.price_self;
        dbPriceToken = 'dual';
      }

      // Build event payload for Supabase
      // Get required tokens from form selection (using contract addresses)
      console.log('🔍 Debug token selection:', {
        selectedTokenIds: formData.required_tokens,
        availablePods: pods.map(p => ({ id: p.id, name: p.name, contract_address: p.contract_address }))
      });
      
      const requiredTokens = formData.required_tokens.length > 0 
        ? formData.required_tokens.map(tokenId => {
            const token = pods.find(pod => pod.id === tokenId);
            console.log('🔍 Mapping token:', { tokenId, found: token, contract_address: token?.contract_address });
            // Use pod ID if contract_address is not available, otherwise use contract_address
            return token?.contract_address || tokenId;
          }).filter(Boolean) as string[]
        : [];
        
      console.log('🔍 Final required tokens for database:', requiredTokens);

      // Generate default event image if none provided
      const defaultEventImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.title)}&size=400&background=bfe7c6&color=000`;
      
      // Generate event metadata
      const eventMetadata = {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        created_by: address,
        creation_date: new Date().toISOString(),
        event_type: 'community_event',
        blockchain_event_id: eventId
      };

      const eventData: CreateEventForm = {
        title: formData.title,
        description: formData.description,
        event_date: formData.event_date, // Keep as Date, service will convert
        event_end_date: formData.event_end_date, // Add end date
        location: formData.location,
        max_attendees: formData.max_attendees,
        blockchain_event_id: eventId, // Store the blockchain event ID
        price_amount: dbPriceAmount,
        price_self_amount: dbPriceSelfAmount,
        price_token: dbPriceToken,
        required_tokens: requiredTokens,
        organizing_pod_id: formData.organizing_pod_id || undefined,
        fund_recipient_pod_id: formData.fund_recipient_pod_id || formData.organizing_pod_id || undefined,
        fund_recipient_type: 'pod',
        manager_address: address, // Set creator as default manager
        event_image_url: defaultEventImage, // Generate default image
        event_metadata: JSON.stringify(eventMetadata), // Store metadata as JSON
        registration_contract_address: process.env.NEXT_PUBLIC_EVENT_MANAGER, // Contract address
        completion_contract_address: process.env.NEXT_PUBLIC_EVENT_MANAGER, // Same contract handles both
        agendas: [],
      };

      console.log('📋 Storing event in database (after successful blockchain creation):', {
        eventId,
        blockchain_event_id: eventId,
        startDate: formData.event_date.toISOString(),
        endDate: formData.event_end_date.toISOString(),
        localStartDate: formData.event_date.toString(),
        localEndDate: formData.event_end_date.toString(),
        timezoneOffset: formData.event_date.getTimezoneOffset(),
        title: eventData.title,
        status: 'Event created on-chain, now storing metadata in database'
      });
      console.log('📋 Full event data:', eventData);
      const event = await createEvent(eventData);

      if (event) {
        // Publish the event after successful creation and blockchain transaction
        console.log('📋 Publishing event after successful blockchain creation...');
        try {
          await EventService.publishEvent(event.id);
          console.log('✅ Event published successfully');
        } catch (publishError) {
          console.error('❌ Failed to publish event:', publishError);
          // Continue anyway since the event was created successfully
        }

        if (onSuccess) {
          onSuccess(event.id);
        } else {
          router.push(`/events/manage/${event.id}`);
        }
      }
    } catch (error) {
      console.error('Failed to store event data:', error);
    }
  }, [formData, address, createEvent, onSuccess, router, pods]);

  // Transaction error handler
  const handleTransactionError = useCallback((error: any) => {
    console.error('❌ Event creation failed:', error);
    setIsTransactionPending(false);
  }, []);


  // Show loading state while checking access
  if (accessLoading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Checking Access...</h2>
          <div className="w-8 h-8 rounded-full animate-spin mx-auto" style={{ border: '4px solid #2F5D50', borderTopColor: 'transparent' }}></div>
        </CardContent>
      </Card>
    );
  }

  if (!canManageEvents) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You need event management permissions to create events.
          </p>
          <Button onClick={() => router.push('/events')}>
            View Events
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto">
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
                required={true}
              />
            </div>
            
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="Enter location or meeting URL"
              />
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
              required={true}
            />
          </div>

          {/* Date Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Event Date *</Label>
              <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
                <DialogTrigger asChild={true}>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.event_date.toLocaleDateString()} {formData.event_date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select Event Start Date & Time</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Calendar
                      mode="single"
                      selected={formData.event_date}
                      onSelect={(date) => {
                        if (date) {
                          // Preserve the time when changing date
                          const newStartDate = new Date(date);
                          newStartDate.setHours(formData.event_date.getHours());
                          newStartDate.setMinutes(formData.event_date.getMinutes());
                          handleInputChange('event_date', newStartDate);
                        }
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus={true}
                    />
                    <div className="flex space-x-2">
                      <Input
                        type="time"
                        value={formData.event_date.toTimeString().slice(0, 5)}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':');
                          const newStartDate = new Date(formData.event_date);
                          newStartDate.setHours(Number.parseInt(hours), Number.parseInt(minutes));
                          handleInputChange('event_date', newStartDate);
                        }}
                      />
                      <Button onClick={() => setShowDatePicker(false)}>Done</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div>
              <Label>Event End Date & Time *</Label>
              <Dialog open={showEndDatePicker} onOpenChange={setShowEndDatePicker}>
                <DialogTrigger asChild={true}>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.event_end_date.toLocaleDateString()} {formData.event_end_date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select Event End Date & Time</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Calendar
                      mode="single"
                      selected={formData.event_end_date}
                      onSelect={(date) => {
                        if (date) {
                          // Preserve the time when changing date
                          const newEndDate = new Date(date);
                          newEndDate.setHours(formData.event_end_date.getHours());
                          newEndDate.setMinutes(formData.event_end_date.getMinutes());
                          handleInputChange('event_end_date', newEndDate);
                        }
                      }}
                      disabled={(date) => date < formData.event_date}
                      initialFocus={true}
                    />
                    <div className="flex space-x-2">
                      <Input
                        type="time"
                        value={formData.event_end_date.toTimeString().slice(0, 5)}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':');
                          const newEndDate = new Date(formData.event_end_date);
                          newEndDate.setHours(Number.parseInt(hours), Number.parseInt(minutes));
                          handleInputChange('event_end_date', newEndDate);
                        }}
                      />
                      <Button onClick={() => setShowEndDatePicker(false)}>Done</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Additional Settings */}
          <div>
            <Label htmlFor="max_attendees">Max Attendees (Optional)</Label>
            <Input
              id="max_attendees"
              type="number"
              value={formData.max_attendees || ''}
              onChange={(e) => {
                const value = e.target.value.trim();
                if (value === '') {
                  handleInputChange('max_attendees', undefined);
                } else {
                  const parsed = Number.parseInt(value, 10);
                  handleInputChange('max_attendees', isNaN(parsed) ? undefined : Math.max(0, parsed));
                }
              }}
              placeholder="Leave empty for unlimited"
              className="max-w-xs"
            />
          </div>

          {/* Pricing */}
          <div>
            <Label>Event Pricing</Label>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="pricing_free"
                  name="pricing"
                  checked={formData.price_token === 'free'}
                  onChange={() => {
                    handleInputChange('price_token', 'free');
                    handleInputChange('price_system', '0');
                    handleInputChange('price_self', '0');
                  }}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="pricing_free">Free Event</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="pricing_system"
                  name="pricing"
                  checked={formData.price_token === 'SYSTEM'}
                  onChange={() => handleInputChange('price_token', 'SYSTEM')}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="pricing_system">SYSTEM Token Payment</Label>
              </div>

              {formData.price_token === 'SYSTEM' && (
                <div className="ml-6">
                  <Label htmlFor="price_system">Price in SYSTEM tokens</Label>
                  <Input
                    id="price_system"
                    type="number"
                    step="1"
                    value={formData.price_system}
                    onChange={(e) => handleInputChange('price_system', e.target.value)}
                    placeholder="10"
                    className="max-w-xs"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="pricing_self"
                  name="pricing"
                  checked={formData.price_token === 'SELF'}
                  onChange={() => handleInputChange('price_token', 'SELF')}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="pricing_self">SELF Token Payment</Label>
              </div>

              {formData.price_token === 'SELF' && (
                <div className="ml-6">
                  <Label htmlFor="price_self">Price in SELF tokens</Label>
                  <Input
                    id="price_self"
                    type="number"
                    step="1"
                    value={formData.price_self}
                    onChange={(e) => handleInputChange('price_self', e.target.value)}
                    placeholder="5"
                    className="max-w-xs"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="pricing_both"
                  name="pricing"
                  checked={formData.price_token === 'both'}
                  onChange={() => handleInputChange('price_token', 'both')}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="pricing_both">Both SYSTEM & SELF Tokens</Label>
              </div>

              {formData.price_token === 'both' && (
                <div className="ml-6 space-y-3">
                  <div>
                    <Label htmlFor="price_system_both">SYSTEM tokens required</Label>
                    <Input
                      id="price_system_both"
                      type="number"
                      step="1"
                      value={formData.price_system}
                      onChange={(e) => handleInputChange('price_system', e.target.value)}
                      placeholder="10"
                      className="max-w-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price_self_both">SELF tokens required</Label>
                    <Input
                      id="price_self_both"
                      type="number"
                      step="1"
                      value={formData.price_self}
                      onChange={(e) => handleInputChange('price_self', e.target.value)}
                      placeholder="5"
                      className="max-w-xs"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#2F5D50' } as React.CSSProperties}
              >
                <option value="">Select organizing pod</option>
                {managedPods.map((pod) => (
                  <option key={pod.id} value={pod.id}>
                    {pod.name}
                  </option>
                ))}
              </select>
              {managedPods.length === 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  ⚠️ You don't have event creation permission in any pods. Contact a pod manager to request access.
                </p>
              )}
              {managedPods.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  You can create events in {managedPods.length} pod{managedPods.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="fund_recipient">Fund Recipient</Label>
              <select
                id="fund_recipient"
                value={formData.fund_recipient_pod_id}
                onChange={(e) => handleInputChange('fund_recipient_pod_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#2F5D50' } as React.CSSProperties}
              >
                <option value="">Same as organizing pod</option>
                {/* Only show pods where user has credentials AND treasury is DEPLOYED (not pending) */}
                {managedPods
                  .filter(pod =>
                    pod.treasury_contract_address &&
                    pod.treasury_contract_address !== 'pending' &&
                    pod.treasury_contract_address !== '0x0000000000000000000000000000000000000000'
                  )
                  .map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.name}
                    </option>
                  ))}
              </select>

              {/* Treasury Status Information */}
              {(formData.fund_recipient_pod_id || formData.organizing_pod_id) && (() => {
                const selectedPodId = formData.fund_recipient_pod_id || formData.organizing_pod_id;
                const selectedPod = managedPods.find(pod => pod.id === selectedPodId);

                if (selectedPod &&
                    selectedPod.treasury_contract_address &&
                    selectedPod.treasury_contract_address !== 'pending' &&
                    selectedPod.treasury_contract_address !== '0x0000000000000000000000000000000000000000') {
                  return (
                    <div className="mt-2 p-3 rounded-lg text-sm" style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
                      <div style={{ color: '#3F7A5A' }}>
                        <p className="font-medium">✅ Treasury Contract Active</p>
                        <p className="text-xs mt-1">Event registration fees will go directly to the pod treasury at:</p>
                        <p className="font-mono text-xs mt-1 break-all">{selectedPod.treasury_contract_address}</p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Show helper text if no treasuries available */}
              {managedPods.filter(pod =>
                pod.treasury_contract_address &&
                pod.treasury_contract_address !== 'pending' &&
                pod.treasury_contract_address !== '0x0000000000000000000000000000000000000000'
              ).length === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No pod treasuries available. Deploy a treasury to receive event funds.
                </p>
              )}
            </div>
          </div>

          {/* Required Token */}
          <div>
            <Label htmlFor="required_token">Required Token</Label>
            <select
              id="required_token"
              value={formData.required_tokens[0] || ''}
              onChange={(e) => {
                const tokenId = e.target.value;
                handleInputChange('required_tokens', tokenId ? [tokenId] : []);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#2F5D50' } as React.CSSProperties}
            >
              <option value="">No token requirement</option>
              {pods.filter(pod => pod.is_active).map((token) => (
                <option key={token.id} value={token.id}>
                  {token.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Select a token that attendees must hold to register for this event
            </p>
          </div>

          {/* Error Display */}
          {createError && (
            <div className="p-4 border rounded-lg" style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}>
              <p style={{ color: '#8B3A3A' }}>{createError}</p>
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
            
            {/* Fund Recipient Debug Info */}
            {validation.isValid && formData.price_token !== 'free' && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
                <h4 className="font-medium mb-2" style={{ color: '#2F5D50' }}>💰 Payment Flow Preview</h4>
                <div className="text-sm space-y-2" style={{ color: '#3F7A5A' }}>
                  {(() => {
                    const fundRecipientPodId = formData.fund_recipient_pod_id || formData.organizing_pod_id;
                    const fundRecipientPod = fundRecipientPodId ? pods.find(pod => pod.id === fundRecipientPodId) : null;
                    
                    if (fundRecipientPod?.treasury_contract_address) {
                      return (
                        <>
                          <p><span className="font-medium">Event pricing:</span> {
                            formData.price_token === 'SYSTEM' ? `${formData.price_system} SYSTEM tokens` :
                            formData.price_token === 'SELF' ? `${formData.price_self} SELF tokens` :
                            formData.price_token === 'both' ? `${formData.price_system} SYSTEM + ${formData.price_self} SELF tokens` :
                            'Free'
                          }</p>
                          <p><span className="font-medium">Funds destination:</span> {fundRecipientPod.name} Treasury</p>
                          <p className="font-mono text-xs break-all">Contract: {fundRecipientPod.treasury_contract_address}</p>
                          <p style={{ color: '#3F7A5A' }}>✅ Payments will go directly to pod treasury</p>
                        </>
                      );
                    } else if (fundRecipientPod) {
                      return (
                        <>
                          <p><span className="font-medium">Event pricing:</span> {
                            formData.price_token === 'SYSTEM' ? `${formData.price_system} SYSTEM tokens` :
                            formData.price_token === 'SELF' ? `${formData.price_self} SELF tokens` :
                            formData.price_token === 'both' ? `${formData.price_system} SYSTEM + ${formData.price_self} SELF tokens` :
                            'Free'
                          }</p>
                          <p><span className="font-medium">Funds destination:</span> Your Wallet (fallback)</p>
                          <p className="font-mono text-xs break-all">Address: {address}</p>
                          <p style={{ color: '#C6933F' }}>⚠️ Pod treasury not deployed - using fallback</p>
                        </>
                      );
                    } else {
                      return <p><span className="font-medium">Funds destination:</span> Your Wallet</p>;
                    }
                  })()}
                </div>
              </div>
            )}

            {/* Clean Transaction Component */}
            {validation.isValid ? isConnected ? transactionCompleted ? (
              <Button disabled={true}>
                Event Created Successfully
              </Button>
            ) : transactionCalls ? (
              <Transaction
                key={eventId} // Force re-mount with stable eventId
                chainId={base.id}
                calls={transactionCalls}
                isSponsored={true}
                onStatus={(status) => {
                  console.log('📋 Event Creation Status:', status.statusName, status);
                  if (status.statusName === 'buildingTransaction') {
                    setIsTransactionPending(true);
                    console.log('🚀 Building transaction for event:', {
                      eventId,
                      blockchainEventId: eventId,
                      title: formData.title,
                      contractAddress: process.env.NEXT_PUBLIC_EVENT_MANAGER
                    });
                  }
                  if (status.statusName === 'success') {
                    console.log('✅ Event creation transaction successful! Event should now exist on-chain:', {
                      eventId,
                      transactionHash: status.transactionReceipts?.[0]?.transactionHash,
                      note: 'Users should now be able to register for this event'
                    });
                  }
                  if (status.statusName === 'error') {
                    console.error('❌ Event creation transaction failed:', {
                      eventId,
                      error: status.error,
                      reason: 'Event will not exist on blockchain - registrations will fail'
                    });
                  }
                }}
                onSuccess={handleTransactionSuccess}
                onError={handleTransactionError}
              >
                <TransactionButton
                  text={isTransactionPending ? 'Creating Event...' : 'Create Event'}
                  disabled={isTransactionPending || transactionCompleted}
                  className="disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: isTransactionPending || transactionCompleted ? undefined : '#2F5D50',
                    color: '#FFFFFF'
                  }}
                />
                <TransactionSponsor />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            ) : (
              <Button disabled={true}>
                Preparing Transaction...
              </Button>
            ) : (
              <Button disabled={true}>
                Connect Wallet to Create Event
              </Button>
            ) : (
              <Button disabled={true}>
                {validation.errors[0]}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};