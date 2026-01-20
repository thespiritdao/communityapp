'use client';

import { useAuthContext } from '@/features/identity';
import type React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress, useSendUserOperation, useCurrentUser, useSignEvmMessage } from '@coinbase/cdp-hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Loader2, RefreshCw } from 'lucide-react';

import { useCreateEvent } from '../hooks/useEvents';
import {
  usePods,
  useEventManagementAccess,
} from '../hooks/useEventTokenGating';
import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import { base } from 'viem/chains';
import type { CreateEventForm } from '../types/event';
import { supabase } from '@/lib/supabase';
import { EventService } from '../lib/supabase';
import { encodeFunctionData } from 'viem';

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
  price_system: string; // SYSTEM token amount
  price_self: string; // SELF token amount
  price_token: 'free' | 'SYSTEM' | 'SELF' | 'both';
  organizing_pod_id: string;
  fund_recipient_pod_id: string;
  required_tokens: string[]; // Array of token IDs required for event access
}

export const SimplifiedEventCreationForm: React.FC<
  SimplifiedEventCreationFormProps
> = ({ onSuccess, onCancel }) => {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const authContext = useAuthContext();
  const {
    createEvent,
    loading: creating,
    error: createError,
  } = useCreateEvent();
  const { pods, loading: podsLoading } = usePods();
  const {
    canManageEvents,
    managedPods,
    loading: accessLoading,
    recheckAccess, // ✅ Add refresh function
  } = useEventManagementAccess();
  const { getCreateEventCall, getTransactionConfig, isConnected } =
    useSimplifiedEventTransactions();

  // CDP hooks for gas-sponsored Smart Account transactions
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { signEvmMessage } = useSignEvmMessage();

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
      required_tokens: [], // Default to no required tokens
    };
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [eventId, setEventId] = useState(
    () => `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  const [transactionCompleted, setTransactionCompleted] = useState(false);
  const [dbError, setDbError] = useState<string>('');
  const handlerCalledRef = useRef(false);

  // Debug helper to check current time vs form data
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const timeDiff = formData.event_date.getTime() - now.getTime();
      const endTimeDiff = formData.event_end_date.getTime() - now.getTime();

      console.log('⏰ Time check:', {
        now: now.toISOString(),
        startDate: formData.event_date.toISOString(),
        endDate: formData.event_end_date.toISOString(),
        minutesToStart: Math.round(timeDiff / 60000),
        minutesToEnd: Math.round(endTimeDiff / 60000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
      console.log('🔍 Required tokens selection changed:', {
        field,
        value,
        currentFormData: formData.required_tokens,
      });
    }

    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Auto-adjust end date if start date changes
      if (field === 'event_date' && value instanceof Date) {
        // Keep the same duration but adjust end date
        const currentDuration =
          prev.event_end_date.getTime() - prev.event_date.getTime();
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
    if (!formData.organizing_pod_id) errors.push('Select an organizing pod');

    // Date validation
    if (formData.event_end_date <= formData.event_date) {
      errors.push('End date must be after start date');
    }

    // Pricing validation
    if (
      formData.price_token === 'SYSTEM' &&
      (!formData.price_system || Number.parseFloat(formData.price_system) <= 0)
    ) {
      errors.push('SYSTEM token price must be greater than 0');
    }
    if (
      formData.price_token === 'SELF' &&
      (!formData.price_self || Number.parseFloat(formData.price_self) <= 0)
    ) {
      errors.push('SELF token price must be greater than 0');
    }
    if (formData.price_token === 'both') {
      if (
        !formData.price_system ||
        Number.parseFloat(formData.price_system) <= 0 ||
        !formData.price_self ||
        Number.parseFloat(formData.price_self) <= 0
      ) {
        errors.push('Both SYSTEM and SELF token prices must be greater than 0');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [formData, address]);

  // Memoized transaction parameters
  const transactionParams = useMemo(() => {
    if (!validation.isValid || !address) {
      console.log('⚠️ Transaction params validation failed:', {
        isValid: validation.isValid,
        hasAddress: !!address,
        errors: validation.errors,
      });
      return null;
    }

    const fundRecipientPodId =
      formData.fund_recipient_pod_id || formData.organizing_pod_id;
    let fundRecipient = address;

    console.log('💰 Determining fund recipient:', {
      organizingPodId: formData.organizing_pod_id,
      fundRecipientPodId: fundRecipientPodId,
      totalPodsAvailable: pods.length,
      userAddress: address,
    });

    if (fundRecipientPodId) {
      const fundRecipientPod = pods.find(
        (pod) => pod.id === fundRecipientPodId,
      );

      console.log('💰 Found pod for fund recipient:', {
        podFound: !!fundRecipientPod,
        podName: fundRecipientPod?.name,
        hasTreasury: !!fundRecipientPod?.treasury_contract_address,
        treasuryValue: fundRecipientPod?.treasury_contract_address,
      });

      if (
        fundRecipientPod &&
        fundRecipientPod.treasury_contract_address &&
        fundRecipientPod.treasury_contract_address !== 'pending' &&
        fundRecipientPod.treasury_contract_address !== '0x0000000000000000000000000000000000000000'
      ) {
        // Use pod treasury address if available and deployed
        fundRecipient = fundRecipientPod.treasury_contract_address as `0x${string}`;
        console.log('✅ Event funds will go to pod treasury:', {
          podName: fundRecipientPod.name,
          podId: fundRecipientPodId,
          treasuryAddress: fundRecipient,
        });
      } else if (fundRecipientPod) {
        // Fallback to user address if treasury not deployed yet
        fundRecipient = address;
        console.warn(
          '⚠️ Pod has no treasury - using creator wallet as fallback:',
          {
            podName: fundRecipientPod.name,
            podId: fundRecipientPodId,
            treasuryStatus: fundRecipientPod.treasury_contract_address || 'not set',
            fallbackAddress: address,
            note: 'Event registration fees will go to creator wallet',
          },
        );
      } else {
        // Pod not found - use user address
        fundRecipient = address;
        console.warn(
          '⚠️ Pod not found in available pods - using creator wallet:',
          {
            podId: fundRecipientPodId,
            fallbackAddress: address,
          },
        );
      }
    } else {
      // No pod selected - use user address
      console.log('💰 No organizing pod selected, using creator wallet:', {
        userAddress: address,
      });
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

    const params = {
      eventId,
      title: formData.title,
      eventDate: formData.event_date,
      fundRecipient,
      priceSystem: priceSystemAmount,
      priceSelf: priceSelfAmount,
      maxAttendees: formData.max_attendees || 0,
    };

    console.log('✅ Transaction params generated successfully:', {
      eventId: params.eventId,
      title: params.title,
      fundRecipient: params.fundRecipient,
      priceSystem: params.priceSystem,
      priceSelf: params.priceSelf,
      maxAttendees: params.maxAttendees,
      note: 'These params will be used to create the blockchain transaction',
    });

    return params;
  }, [validation.isValid, address, formData, pods, eventId]);

  // Memoized transaction calls
  const transactionCalls = useMemo(() => {
    if (!transactionParams) {
      console.log('⚠️ Cannot generate transaction calls - no transaction params');
      return null;
    }

    try {
      const calls = getCreateEventCall(transactionParams);
      console.log('✅ Transaction calls generated successfully:', {
        callsCount: calls?.length,
        hasValidCalls: !!calls,
      });
      return calls;
    } catch (error) {
      console.error('❌ Failed to generate transaction calls:', error);
      return null;
    }
  }, [transactionParams, getCreateEventCall]);

  // Transaction success handler
  const handleTransactionSuccess = useCallback(
    async (response: any) => {
      // Prevent duplicate calls for the same transaction
      if (handlerCalledRef.current) {
        console.log(
          '⚠️ handleTransactionSuccess already called, skipping duplicate',
        );
        return;
      }
      handlerCalledRef.current = true;

      console.log('✅ Event creation successful:', response);
      setIsTransactionPending(false);
      // DON'T set transactionCompleted yet - wait for database insert to succeed

      try {
        // Ensure user is authenticated with Supabase before storing event data
        // Using centralized auth session

        if (!authContext.isAuthenticated || !authContext.session?.user?.id) {
          console.log('🔐 No Supabase session, attempting authentication...');

          // Get nonce and sign message for authentication
          const nonceRes = await fetch('/api/auth/nonce');
          if (!nonceRes.ok) {
            throw new Error('Failed to get nonce');
          }
          const { nonce } = await nonceRes.json();

          // Check if EVM account is available
          const evmAccount = currentUser?.evmAccounts?.[0];
          if (!evmAccount) {
            throw new Error('EVM account not available');
          }

          // Sign message with CDP
          const result = await signEvmMessage({
            evmAccount: evmAccount as `0x${string}`,
            message: nonce,
          });
          const signature = result.signature;

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
          availablePods: pods.map((p) => ({
            id: p.id,
            name: p.name,
            contract_address: p.contract_address,
          })),
        });

        const requiredTokens =
          formData.required_tokens.length > 0
            ? (formData.required_tokens
                .map((tokenId) => {
                  const token = pods.find((pod) => pod.id === tokenId);
                  console.log('🔍 Mapping token:', {
                    tokenId,
                    found: token,
                    contract_address: token?.contract_address,
                  });
                  // Use pod ID if contract_address is not available, otherwise use contract_address
                  return token?.contract_address || tokenId;
                })
                .filter(Boolean) as string[])
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
          blockchain_event_id: eventId,
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
          fund_recipient_pod_id:
            formData.fund_recipient_pod_id ||
            formData.organizing_pod_id ||
            undefined,
          fund_recipient_type: 'pod',
          manager_address: address || undefined, // Set creator as default manager
          event_image_url: defaultEventImage, // Generate default image
          event_metadata: JSON.stringify(eventMetadata), // Store metadata as JSON
          registration_contract_address: process.env.NEXT_PUBLIC_EVENT_MANAGER, // Contract address
          completion_contract_address: process.env.NEXT_PUBLIC_EVENT_MANAGER, // Same contract handles both
          agendas: [],
        };

        console.log(
          '📋 Storing event in database (after successful blockchain creation):',
          {
            eventId,
            blockchain_event_id: eventId,
            startDate: formData.event_date.toISOString(),
            endDate: formData.event_end_date.toISOString(),
            localStartDate: formData.event_date.toString(),
            localEndDate: formData.event_end_date.toString(),
            timezoneOffset: formData.event_date.getTimezoneOffset(),
            title: eventData.title,
            status: 'Event created on-chain, now storing metadata in database',
          },
        );
        console.log('📋 Full event data:', eventData);
        const event = await createEvent(eventData);

        if (event) {
          // Publish the event after successful creation and blockchain transaction
          console.log(
            '📋 Publishing event after successful blockchain creation...',
          );
          try {
            await EventService.publishEvent(event.id);
            console.log('✅ Event published successfully');
          } catch (publishError) {
            console.error('❌ Failed to publish event:', publishError);
            // Continue anyway since the event was created successfully
          }

          // NOW set transaction as completed - database insert succeeded
          setTransactionCompleted(true);
          console.log('✅ Event fully created - blockchain + database');

          // Redirect after a short delay to show success state
          setTimeout(() => {
            if (onSuccess) {
              onSuccess(event.id);
            } else {
              router.push('/events');
            }
          }, 1500);
        } else {
          // Database insert returned null/undefined - treat as failure
          throw new Error('Database insert failed - no event returned');
        }
      } catch (error) {
        console.error('❌ Failed to store event data:', error);
        handlerCalledRef.current = false; // Reset so user can retry
        setDbError(
          error instanceof Error
            ? error.message
            : 'Failed to save event to database. The blockchain transaction succeeded but event data was not stored.',
        );
        setIsTransactionPending(false);
      }
    },
    [formData, address, createEvent, onSuccess, router, pods, authContext],
  );

  // Transaction error handler
  const handleTransactionError = useCallback((error: any) => {
    console.error('❌ Event creation failed:', error);

    // Provide helpful error messages based on error type
    const errorMessage = error?.message || String(error);
    let userMessage = 'Transaction failed. Please try again.';

    if (errorMessage.includes('Service unavailable') || errorMessage.includes('503')) {
      userMessage = '⚠️ Coinbase service temporarily unavailable. The transaction will retry automatically.';
    } else if (errorMessage.includes('Internal server error') || errorMessage.includes('500')) {
      userMessage = `⚠️ Transaction failed after retries. This usually means the EventManager contract (0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9) is not whitelisted in your CDP Dashboard. Please check your CDP project's paymaster settings on Base mainnet (Chain ID 8453).`;
    } else if (errorMessage.includes('not whitelisted') || errorMessage.includes('not allowed')) {
      userMessage = `⚠️ Contract not whitelisted for gas sponsorship. Please add EventManager (0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9) to your CDP Dashboard paymaster whitelist.`;
    } else if (errorMessage.includes('Insufficient balance')) {
      userMessage = '⚠️ Gas sponsorship failed. Ensure EventManager contract is whitelisted in CDP Dashboard.';
    }

    setDbError(userMessage);
    setIsTransactionPending(false);
  }, []);

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleCreateEvent = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet line 202-214
    if (!address || !transactionCalls || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for event creation:', {
        hasAddress: !!address,
        hasCalls: !!transactionCalls,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      setDbError('Smart Wallet not properly configured');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN: line 216

    setIsTransactionPending(true); // EXACT FAUCET PATTERN: line 218 (setClaiming)

    try {
      console.log('🚀 Building Smart Account User Operation for event creation...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Target Contract:', transactionCalls[0].address);
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data (lines 227-231)
      const call = transactionCalls[0];
      const callData = encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
      });

      console.log('📝 Encoded call data:', callData);

      // EXACT FAUCET PATTERN: Send user operation (lines 236-245)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: call.address,
          value: 0n,                     // ← Zero ETH (bigint)
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Call success handler
      await handleTransactionSuccess(result);
    } catch (err: any) {
      console.error('❌ Event creation failed:', err);
      handleTransactionError(err);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN: line 266 (setClaiming)
    }
  }, [address, currentUser, transactionCalls, sendUserOperation, handleTransactionSuccess, handleTransactionError]);

  // Show loading state while checking access
  if (accessLoading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Checking Access...</h2>
          <div
            className="w-8 h-8 rounded-full animate-spin mx-auto"
            style={{
              border: '4px solid #2F5D50',
              borderTopColor: 'transparent',
            }}
          ></div>
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
          <Button onClick={() => router.push('/events')}>View Events</Button>
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
                    {formData.event_date.toLocaleDateString()}{' '}
                    {formData.event_date.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
                          newStartDate.setMinutes(
                            formData.event_date.getMinutes(),
                          );
                          handleInputChange('event_date', newStartDate);
                        }
                      }}
                      fromDate={new Date()}
                      initialFocus={true}
                    />
                    <div className="flex space-x-2">
                      <Input
                        type="time"
                        value={formData.event_date.toTimeString().slice(0, 5)}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':');
                          const newStartDate = new Date(formData.event_date);
                          newStartDate.setHours(
                            Number.parseInt(hours),
                            Number.parseInt(minutes),
                          );
                          handleInputChange('event_date', newStartDate);
                        }}
                      />
                      <Button onClick={() => setShowDatePicker(false)}>
                        Done
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div>
              <Label>Event End Date & Time *</Label>
              <Dialog
                open={showEndDatePicker}
                onOpenChange={setShowEndDatePicker}
              >
                <DialogTrigger asChild={true}>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.event_end_date.toLocaleDateString()}{' '}
                    {formData.event_end_date.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
                          newEndDate.setHours(
                            formData.event_end_date.getHours(),
                          );
                          newEndDate.setMinutes(
                            formData.event_end_date.getMinutes(),
                          );
                          handleInputChange('event_end_date', newEndDate);
                        }
                      }}
                      fromDate={formData.event_date}
                      initialFocus={true}
                    />
                    <div className="flex space-x-2">
                      <Input
                        type="time"
                        value={formData.event_end_date
                          .toTimeString()
                          .slice(0, 5)}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':');
                          const newEndDate = new Date(formData.event_end_date);
                          newEndDate.setHours(
                            Number.parseInt(hours),
                            Number.parseInt(minutes),
                          );
                          handleInputChange('event_end_date', newEndDate);
                        }}
                      />
                      <Button onClick={() => setShowEndDatePicker(false)}>
                        Done
                      </Button>
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
                  handleInputChange(
                    'max_attendees',
                    isNaN(parsed) ? undefined : Math.max(0, parsed),
                  );
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
                    onChange={(e) =>
                      handleInputChange('price_system', e.target.value)
                    }
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
                    onChange={(e) =>
                      handleInputChange('price_self', e.target.value)
                    }
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
                    <Label htmlFor="price_system_both">
                      SYSTEM tokens required
                    </Label>
                    <Input
                      id="price_system_both"
                      type="number"
                      step="1"
                      value={formData.price_system}
                      onChange={(e) =>
                        handleInputChange('price_system', e.target.value)
                      }
                      placeholder="10"
                      className="max-w-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price_self_both">
                      SELF tokens required
                    </Label>
                    <Input
                      id="price_self_both"
                      type="number"
                      step="1"
                      value={formData.price_self}
                      onChange={(e) =>
                        handleInputChange('price_self', e.target.value)
                      }
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
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="organizing_pod">Organizing Pod</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={recheckAccess}
                  disabled={accessLoading}
                  className="h-7 px-2 text-xs"
                  title="Refresh pod list"
                >
                  <RefreshCw className={`h-3 w-3 ${accessLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <select
                id="organizing_pod"
                value={formData.organizing_pod_id}
                onChange={(e) =>
                  handleInputChange('organizing_pod_id', e.target.value)
                }
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
              {managedPods.length === 0 && !accessLoading && (
                <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: '#FEF3C7', border: '1px solid #F59E0B' }}>
                  <p className="text-sm font-medium" style={{ color: '#92400E' }}>
                    ⚠️ No Pods Available for Event Creation
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#78350F' }}>
                    Each pod needs BOTH:
                  </p>
                  <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside" style={{ color: '#78350F' }}>
                    <li><strong>Events Module ON</strong> (pod-wide setting in Controls tab)</li>
                    <li><strong>Event Creation Permission</strong> (granted to your role)</li>
                  </ul>
                  <p className="text-xs mt-2" style={{ color: '#78350F' }}>
                    If you just enabled the module or were granted permissions, click the refresh button (🔄) above.
                  </p>
                  <details className="mt-2 text-xs" style={{ color: '#78350F' }}>
                    <summary className="cursor-pointer font-medium">Show debugging info</summary>
                    <div className="mt-1 space-y-1 font-mono text-[10px]">
                      <p>Open browser console (F12) and look for:</p>
                      <p className="pl-2">"[Events] Pod YourPodName: module=?, permission=?"</p>
                      <p className="pl-2 mt-1">This shows exactly why each pod is blocked.</p>
                    </div>
                  </details>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="fund_recipient">Fund Recipient</Label>
              <select
                id="fund_recipient"
                value={formData.fund_recipient_pod_id}
                onChange={(e) =>
                  handleInputChange('fund_recipient_pod_id', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#2F5D50' } as React.CSSProperties}
              >
                <option value="">Same as organizing pod</option>
                {/* Only show pods where user has credentials AND treasury is DEPLOYED (not pending) */}
                {managedPods
                  .filter(
                    (pod) =>
                      pod.treasury_contract_address &&
                      pod.treasury_contract_address !== 'pending' &&
                      pod.treasury_contract_address !==
                        '0x0000000000000000000000000000000000000000',
                  )
                  .map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.name}
                    </option>
                  ))}
              </select>

              {/* Treasury Status Information */}
              {(formData.fund_recipient_pod_id || formData.organizing_pod_id) &&
                (() => {
                  const selectedPodId =
                    formData.fund_recipient_pod_id ||
                    formData.organizing_pod_id;
                  const selectedPod = managedPods.find(
                    (pod) => pod.id === selectedPodId,
                  );

                  if (
                    selectedPod &&
                    selectedPod.treasury_contract_address &&
                    selectedPod.treasury_contract_address !== 'pending' &&
                    selectedPod.treasury_contract_address !==
                      '0x0000000000000000000000000000000000000000'
                  ) {
                    return (
                      <div
                        className="mt-2 p-3 rounded-lg text-sm"
                        style={{
                          backgroundColor: '#E8F1EE',
                          border: '1px solid #B8D9CA',
                        }}
                      >
                        <div style={{ color: '#3F7A5A' }}>
                          <p className="font-medium">
                            ✅ Treasury Contract Active
                          </p>
                          <p className="text-xs mt-1">
                            Event registration fees will go directly to the pod
                            treasury at:
                          </p>
                          <p className="font-mono text-xs mt-1 break-all">
                            {selectedPod.treasury_contract_address}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

              {/* Show helper text if no treasuries available */}
              {managedPods.filter(
                (pod) =>
                  pod.treasury_contract_address &&
                  pod.treasury_contract_address !== 'pending' &&
                  pod.treasury_contract_address !==
                    '0x0000000000000000000000000000000000000000',
              ).length === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No pod treasuries available. Deploy a treasury to receive
                  event funds.
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
              {managedPods.map((token) => (
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
          {(createError || dbError) && (
            <div
              className="p-4 border rounded-lg"
              style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
            >
              {createError && <p style={{ color: '#8B3A3A' }}>{createError}</p>}
              {dbError && <p style={{ color: '#8B3A3A' }}>{dbError}</p>}
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

            {/* OnchainKit Transaction with Callback Pattern */}
            {(() => {
              // Debug: Log which button is being rendered
              if (!validation.isValid) {
                console.log('🔴 Rendering DISABLED button - validation failed:', {
                  errors: validation.errors,
                  formData: {
                    title: formData.title,
                    location: formData.location,
                    description: formData.description,
                    organizing_pod_id: formData.organizing_pod_id,
                  },
                });
                return <Button disabled={true}>{validation.errors[0]}</Button>;
              }

              if (!address) {
                console.log('🔴 Rendering DISABLED button - no address');
                return <Button disabled={true}>Connect Wallet to Create Event</Button>;
              }

              if (transactionCompleted) {
                console.log('🟢 Rendering SUCCESS button - transaction completed');
                return <Button disabled={true}>Event Created Successfully ✓</Button>;
              }

              if (!transactionCalls) {
                console.log('🟡 Rendering DISABLED button - no transaction calls');
                return <Button disabled={true}>Preparing Transaction...</Button>;
              }

              // This is the clickable button!
              console.log('🟢 Rendering CLICKABLE button - all conditions met!', {
                hasParams: !!transactionParams,
                hasCalls: !!transactionCalls,
                hasAddress: !!address,
                hasCurrentUser: !!currentUser,
                hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
                isTransactionPending,
              });
              return (
                <Button
                  onClick={(e) => {
                    console.log('🖱️ BUTTON CLICK EVENT FIRED!', {
                      event: e.type,
                      target: e.currentTarget,
                      isDisabled: isTransactionPending,
                    });
                    handleCreateEvent();
                  }}
                  disabled={isTransactionPending}
                  className="disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors hover:opacity-90"
                >
                  {isTransactionPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                      Creating Event...
                    </>
                  ) : (
                    'Create Event'
                  )}
                </Button>
              );
            })()}
          </div>

          {/* Payment Flow Preview - Below Buttons */}
          {validation.isValid && formData.price_token !== 'free' && (
            <div
              className="p-4 rounded-lg mt-4"
              style={{
                backgroundColor: '#E8F1EE',
                border: '1px solid #B8D9CA',
              }}
            >
              <h4 className="font-medium mb-2" style={{ color: '#2F5D50' }}>
                💰 Payment Flow Preview
              </h4>
              <div className="text-sm space-y-2" style={{ color: '#3F7A5A' }}>
                {(() => {
                  const fundRecipientPodId =
                    formData.fund_recipient_pod_id ||
                    formData.organizing_pod_id;
                  const fundRecipientPod = fundRecipientPodId
                    ? pods.find((pod) => pod.id === fundRecipientPodId)
                    : null;

                  if (fundRecipientPod?.treasury_contract_address) {
                    return (
                      <>
                        <p>
                          <span className="font-medium">Event pricing:</span>{' '}
                          {formData.price_token === 'SYSTEM'
                            ? `${formData.price_system} SYSTEM tokens`
                            : formData.price_token === 'SELF'
                              ? `${formData.price_self} SELF tokens`
                              : formData.price_token === 'both'
                                ? `${formData.price_system} SYSTEM + ${formData.price_self} SELF tokens`
                                : 'Free'}
                        </p>
                        <p>
                          <span className="font-medium">
                            Funds destination:
                          </span>{' '}
                          {fundRecipientPod.name} Treasury
                        </p>
                        <p className="font-mono text-xs break-all">
                          Contract:{' '}
                          {fundRecipientPod.treasury_contract_address}
                        </p>
                        <p style={{ color: '#3F7A5A' }}>
                          ✅ Payments will go directly to pod treasury
                        </p>
                      </>
                    );
                  } else if (fundRecipientPod) {
                    return (
                      <>
                        <p>
                          <span className="font-medium">Event pricing:</span>{' '}
                          {formData.price_token === 'SYSTEM'
                            ? `${formData.price_system} SYSTEM tokens`
                            : formData.price_token === 'SELF'
                              ? `${formData.price_self} SELF tokens`
                              : formData.price_token === 'both'
                                ? `${formData.price_system} SYSTEM + ${formData.price_self} SELF tokens`
                                : 'Free'}
                        </p>
                        <p>
                          <span className="font-medium">
                            Funds destination:
                          </span>{' '}
                          Your Wallet (fallback)
                        </p>
                        <p className="font-mono text-xs break-all">
                          Address: {address}
                        </p>
                        <p style={{ color: '#C6933F' }}>
                          ⚠️ Pod treasury not deployed - using fallback
                        </p>
                      </>
                    );
                  } else {
                    return (
                      <p>
                        <span className="font-medium">
                          Funds destination:
                        </span>{' '}
                        Your Wallet
                      </p>
                    );
                  }
                })()}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
