'use client';

import { useAuthContext } from '@/features/identity';
import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useEvmAddress, useCurrentUser, useSignEvmMessage } from '@coinbase/cdp-hooks';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { useRouter } from 'next/navigation';
import { EventTokenDisplay } from './EventTokenDisplay';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Wallet,
  AlertCircle,
  CheckCircle,
  Ticket,
} from 'lucide-react';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';

import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import { useEventAccess } from '../hooks/useEventTokenGating';
import { useRegistrationStatus } from '../hooks/useRegistrationStatus';
import { TokenApprovalFlow } from './TokenApprovalFlow';
import { supabase } from '@/lib/supabase';
import { useReadContract, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import {
  buildEventSelfBurn,
  extractReceiptId,
} from '../services/eventSelfPayment';
import type { Event } from '../types/event';

// Import the contract ABI and address
import EventManagerABI from '@/abis/EventManager.json';
import { cdpAuthHeaders } from '@/features/identity/lib/cdpSession';
import { ensureAuthHeaders } from '@/lib/authHeaders';
const EVENT_MANAGER_CONTRACT = CONTRACT_ADDRESSES.EVENT_MANAGER;

const BASE_CHAIN_ID = 8453;

interface OnChainEvent {
  title: string;
  organizer: string;
  status: number;
  currentAttendees: bigint;
  maxAttendees: bigint;
}

interface EventRegistrationModalProps {
  event: Event;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentRegistrationCount?: number; // Pass current count for accurate available spots
}

export const EventRegistrationModal: React.FC<EventRegistrationModalProps> = ({
  event,
  isOpen,
  onClose,
  onSuccess,
  currentRegistrationCount = 0,
}) => {
  // Device wallet — signs the /api/auth/verify nonce and is the wallet the
  // registration is authenticated + written under (event_registrations.user_address
  // is RLS-bound to the authenticated wallet). Left on the device wallet; aligning
  // the registration write + verify JWT + RLS to canonical is a Phase B/C concern.
  const { evmAddress: address } = useEvmAddress();
  // Canonical identity — used only for notification actor attribution.
  const userWallet = useUserWallet();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const publicClient = usePublicClient();
  const { signEvmMessage } = useSignEvmMessage();
  const router = useRouter();
  const { toast } = useToast();
  const authContext = useAuthContext();
  const { isConnected } = useSimplifiedEventTransactions();
  const {
    canRegister,
    canView,
    loading: accessLoading,
  } = useEventAccess(event);
  const {
    isRegistered,
    registrationStatus: regStatus,
    loading: regLoading,
  } = useRegistrationStatus(event.id);

  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<
    'idle' | 'checking' | 'eligible' | 'ineligible' | 'approving' | 'ready'
  >('idle');
  const [hasAccess, setHasAccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showApprovalFlow, setShowApprovalFlow] = useState(false);
  const [systemTokenAmount, setSystemTokenAmount] = useState('0');
  const [selfTokenAmount, setSelfTokenAmount] = useState('0');

  // Track if registration has been processed to prevent duplicate calls
  const registrationProcessedRef = useRef(false);

  // Check if event exists on-chain using the blockchain event ID
  const blockchainEventId = event.blockchain_event_id;
  const {
    data: onChainEventData,
    error: contractError,
    isLoading: contractLoading,
  } = useReadContract({
    address: EVENT_MANAGER_CONTRACT,
    abi: EventManagerABI,
    functionName: 'getEvent',
    args: [blockchainEventId],
    query: {
      enabled: !!blockchainEventId && isOpen,
      retry: false,
    },
  });

  const onChainEvent = onChainEventData as OnChainEvent | undefined;

  // Reset registration processed flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      registrationProcessedRef.current = false;
    }
  }, [isOpen]);

  // Check eligibility when modal opens
  useEffect(() => {
    const checkEligibility = async () => {
      if (!address || !isOpen) return;

      setRegistrationStatus('checking');
      setErrorMessage('');

      try {
        // Use shared registration status hook
        if (isRegistered) {
          setRegistrationStatus('ineligible');
          setErrorMessage(
            `You are already registered for this event (Status: ${regStatus})`,
          );
          return;
        }

        // Check token requirements using the hook
        setHasAccess(canRegister);

        if (!canRegister && event.required_tokens.length > 0) {
          setRegistrationStatus('ineligible');
          setErrorMessage(
            `You need the following tokens to register: ${event.required_tokens.join(', ')}`,
          );
          return;
        }

        // Set token amounts from event pricing
        // Parse the price_amount to determine SYSTEM vs SELF token amounts
        const priceAmount = Number.parseFloat(event.price_amount || '0');

        if (event.price_token === 'SYSTEM') {
          setSystemTokenAmount(priceAmount.toString());
          setSelfTokenAmount('0');
        } else if (event.price_token === 'SELF') {
          setSystemTokenAmount('0');
          setSelfTokenAmount(priceAmount.toString());
        } else if (event.price_token === 'dual') {
          // For "dual" token events, split equally or use separate fields if available
          setSystemTokenAmount((priceAmount / 2).toString());
          setSelfTokenAmount((priceAmount / 2).toString());
        } else {
          // Free event
          setSystemTokenAmount('0');
          setSelfTokenAmount('0');
        }

        // Check capacity using current registration count
        if (
          event.max_attendees &&
          currentRegistrationCount >= event.max_attendees
        ) {
          setRegistrationStatus('ineligible');
          setErrorMessage('This event is at full capacity');
          return;
        }

        // Check if event has already started
        const eventDate = new Date(event.event_date);
        if (eventDate <= new Date()) {
          setRegistrationStatus('ineligible');
          setErrorMessage('Registration is closed - event has already started');
          return;
        }

        // Use blockchain_event_id for on-chain operations
        const blockchainEventId = event.blockchain_event_id;

        console.log('🔍 Event Registration Debugging:', {
          eventId: event.id,
          blockchain_event_id: event.blockchain_event_id,
          finalEventId: blockchainEventId,
          status: event.status,
          title: event.title,
          note: 'Using blockchain_event_id if available, otherwise database id as fallback',
        });

        // Log blockchain verification results
        if (!contractLoading) {
          if (contractError) {
            console.info('ℹ️ Event is not on the EventManager contract; free events register database-only:', {
              eventId: blockchainEventId,
              error: contractError.message,
              note: 'Expected for the seeded recurring community calls. Paid events do need an on-chain record.',
            });
          } else if (onChainEvent) {
            console.log('✅ Event found on blockchain:', {
              eventId: blockchainEventId,
              onChainTitle: onChainEvent.title,
              organizer: onChainEvent.organizer,
              status: onChainEvent.status,
              currentAttendees: onChainEvent.currentAttendees.toString(),
              maxAttendees: onChainEvent.maxAttendees.toString(),
            });
          }
        }

        // DB status is the source of truth — always allow registration if the event
        // is published and upcoming. Blockchain status is informational only.
        setRegistrationStatus('eligible');
        console.log('✅ Registration status set to ELIGIBLE - ready to register');
      } catch (error) {
        console.error('Error checking eligibility:', error);
        setRegistrationStatus('ineligible');
        setErrorMessage('Error checking registration eligibility');
      }
    };

    checkEligibility();
  }, [
    address,
    event,
    isOpen,
    canRegister,
    isRegistered,
    regStatus,
  ]);

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    };
  };

  const getEventPrice = () => {
    if (
      event.price_token === 'free' ||
      Number.parseFloat(event.price_amount) === 0
    ) {
      return { amount: '0', display: 'Free', isFree: true };
    }
    return {
      amount: event.price_amount,
      display: `${event.price_amount} ETH`,
      isFree: false,
    };
  };

  // CDP-based registration handler (matches pattern from SimplifiedEventCreationForm)
  const handleCdpRegistration = async () => {
    setIsRegistering(true);

    try {
      // If event exists on-chain, use blockchain registration
      if (event.blockchain_event_id && onChainEvent) {
        if (!currentUser?.evmSmartAccounts?.[0]) {
          toast({
            title: 'Error',
            description: 'Smart Account not found. Please connect your wallet.',
            variant: 'destructive',
          });
          setIsRegistering(false);
          return;
        }

        console.log('🚀 Starting CDP on-chain event registration:', {
          eventId: event.blockchain_event_id,
          eventTitle: event.title,
          contractAddress: EVENT_MANAGER_CONTRACT,
        });

        const smartAccount = currentUser.evmSmartAccounts[0];

        // $SELF events (V2): burn $SELF via SelfPaymentV2.payWithSelf FIRST, read
        // the SelfReceipt id, then register with it. $SELF is soulbound so it
        // cannot be transferred into EventManager — only burned by its holder.
        let selfReceiptId = 0n;
        const priceSelfHours = Number.parseFloat(
          (event as any).price_self_amount || '0',
        );
        if (priceSelfHours > 0) {
          if (!address) throw new Error('No wallet address for $SELF payment');
          const podId =
            (event as any).fund_recipient_pod_id ||
            (event as any).organizing_pod_id ||
            '';
          const burn = await buildEventSelfBurn({
            walletAddress: address,
            podId,
            eventId: event.blockchain_event_id,
            priceSelfHours,
          });
          if (!burn) {
            throw new Error(
              'Insufficient $SELF for this event, or $SELF not configured',
            );
          }
          const burnRes = await sendUserOperation({
            evmSmartAccount: smartAccount,
            network: 'base',
            calls: [
              {
                to: burn.call.address,
                value: 0n,
                data: encodeFunctionData({
                  abi: burn.call.abi,
                  functionName: burn.call.functionName,
                  args: burn.call.args,
                }),
              },
            ],
            useCdpPaymaster: true,
          });
          const burnHash = (burnRes as any)?.userOperationHash;
          if (!burnHash || !publicClient) {
            throw new Error('Could not confirm $SELF burn');
          }
          const burnReceipt = await publicClient.waitForTransactionReceipt({
            hash: burnHash as `0x${string}`,
          });
          const receiptId = extractReceiptId(burnReceipt.logs);
          if (!receiptId) throw new Error('Could not read $SELF payment receipt');
          selfReceiptId = receiptId;
        }

        const callData = encodeFunctionData({
          abi: EventManagerABI,
          functionName: 'registerForEvent',
          args: [event.blockchain_event_id, selfReceiptId],
        });

        const result = await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: 'base',
          calls: [{
            to: EVENT_MANAGER_CONTRACT as `0x${string}`,
            value: 0n,
            data: callData,
          }],
          useCdpPaymaster: true,
        });

        console.log('✅ On-chain registration transaction submitted:', result);
        await handleRegistrationSuccess(result);
      } else {
        // Event not on-chain — DB-only registration (free events, test events, etc.)
        console.log('📝 DB-only registration (event not on-chain):', event.id);
        await handleRegistrationSuccess(null);
      }

      toast({
        title: 'Registration successful!',
        description: `You're registered for ${event.title}`,
        variant: 'success',
      });
    } catch (error: any) {
      console.error('❌ On-chain registration failed, falling back to DB-only:', error);

      // On-chain call failed for any reason (event started, gas error, contract issue).
      // Fall back to DB-only registration — the DB record is the source of truth
      // for check-in, QR codes, and event management.
      registrationProcessedRef.current = false; // reset so handleRegistrationSuccess can run
      try {
        await handleRegistrationSuccess(null);
        toast({
          title: 'Registration successful!',
          description: `You're registered for ${event.title}`,
          variant: 'success',
        });
      } catch (dbErr: any) {
        console.error('❌ DB-only fallback also failed:', dbErr);
        setIsRegistering(false);
        const errMsg = dbErr?.message || 'Registration failed';
        setErrorMessage(errMsg);
        toast({
          title: 'Registration failed',
          description: errMsg,
          variant: 'destructive',
        });
      }
    }
  };

  const handleRegistrationSuccess = async (response: any) => {
    // Prevent duplicate processing if called multiple times (common with OnchainKit re-renders)
    if (registrationProcessedRef.current) {
      console.log('⏭️ Registration already processed, skipping duplicate call');
      return;
    }

    registrationProcessedRef.current = true;
    console.log('✅ Registration successful:', response);
    setIsRegistering(false);

    try {
      // Ensure user is authenticated with Supabase before storing registration
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

      // The server records the registration once EventManager confirms it;
      // payment fields are no longer writable from the browser.
      const txHash = response?.transactionReceipts?.[0]?.transactionHash ?? null;
      console.log('💾 Recording registration for', address, txHash);

      const registerRes = await fetch(`/api/events/${event.id}/register`, {
        method: 'POST',
        headers: { ...(await cdpAuthHeaders()), ...(await ensureAuthHeaders()) },
        body: JSON.stringify({ address: address!.toLowerCase(), txHash }),
      });
      const upsertError = registerRes.ok
        ? null
        : new Error((await registerRes.json().catch(() => null))?.error ?? `HTTP ${registerRes.status}`);

      if (upsertError) {
        console.error('Error storing registration:', upsertError);
        // Still consider success since blockchain transaction worked
      } else {
        console.log('✅ Registration stored successfully in database');

        // Notify event organizer + confirm registration to attendee (non-blocking)
        setTimeout(async () => {
          try {
            const { unifiedNotificationService } = await import(
              '@/services/unifiedNotificationService'
            );

            // Notify organizer of new registration. Attribute to the canonical
            // identity so the organizer sees the registrant's stable namecard.
            const registrantIdentity = userWallet ?? address;
            if (event.creator_address && registrantIdentity && event.creator_address.toLowerCase() !== registrantIdentity.toLowerCase()) {
              await unifiedNotificationService.createNotification({
                recipient_address: event.creator_address,
                sender_address: registrantIdentity,
                notification_type: 'event_registration',
                title: 'New Event Registration',
                message: `Someone has registered for your event "${event.title}".`,
                context_type: 'events',
                context_id: event.id,
                context_url: `/events/${event.id}`,
                priority: 'medium',
              });
            }

            // Confirm registration to attendee (deliver to canonical identity so
            // it appears in their notifications regardless of device).
            if (registrantIdentity) {
              await unifiedNotificationService.createNotification({
                recipient_address: registrantIdentity,
                sender_address: event.creator_address || 'system',
                notification_type: 'event_registration',
                title: 'Event Registration Confirmed',
                message: `You have successfully registered for "${event.title}".`,
                context_type: 'events',
                context_id: event.id,
                context_url: `/events/${event.id}`,
                priority: 'medium',
              });
            }
          } catch (notificationError) {
            console.log(
              'Failed to send registration notification - continuing with registration',
            );
          }
        }, 1000);
      }

      // TODO: Add to user's calendar

      onSuccess();

      // Redirect to main events page after successful registration
      setTimeout(() => {
        router.push('/events/');
      }, 1000); // Small delay to allow success message to be seen
    } catch (error) {
      console.error('Error handling registration success:', error);
      onSuccess(); // Still call success since blockchain transaction worked

      // Still redirect even if there were database/notification errors since blockchain transaction worked
      setTimeout(() => {
        router.push('/events/');
      }, 1000);
    }
  };

  const { date, time } = formatEventDate(event.event_date);
  const price = getEventPrice();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl w-full p-6"
        style={{ maxWidth: '42rem', width: '90vw' }}
      >
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center space-x-2">
              <Ticket className="w-5 h-5" />
              <span>Register for Event</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">{event.title}</h3>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2" />
                <span>{date}</span>
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-2" />
                <span>{time}</span>
              </div>
              {event.location && (
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span className="line-clamp-1">{event.location}</span>
                </div>
              )}
              <div className="mt-2">
                <button
                  onClick={() => {
                    // Create Google Calendar URL
                    const startDate = new Date(event.event_date);
                    const endDate = new Date(
                      startDate.getTime() + 2 * 60 * 60 * 1000,
                    ); // Default 2 hours
                    const formatDate = (date: Date) =>
                      date.toISOString().replace(/[-:]/g, '').split('.')[0] +
                      'Z';

                    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${formatDate(startDate)}/${formatDate(endDate)}&details=${encodeURIComponent(event.description || '')}&location=${encodeURIComponent(event.location || '')}`;
                    window.open(googleCalendarUrl, '_blank');
                  }}
                  className="text-sm underline"
                  style={{ color: '#2F5D50' }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = '#1F453A')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = '#2F5D50')
                  }
                >
                  Add to Google Calendar
                </button>
              </div>
            </div>
          </div>

          {/* Registration Price */}
          <div
            className="flex justify-between items-center p-3 rounded-lg"
            style={{ backgroundColor: '#E8F1EE' }}
          >
            <span className="font-medium">Registration Fee:</span>
            <Badge
              variant={price.isFree ? 'secondary' : 'default'}
              className="text-sm"
            >
              <Wallet className="w-3 h-3 mr-1" />
              {price.display}
            </Badge>
          </div>

          {/* Capacity Info */}
          {event.max_attendees && (
            <div className="flex justify-between items-center p-3 border rounded-lg">
              <span className="text-sm font-medium">Available Spots:</span>
              <div className="flex items-center text-sm">
                <Users className="w-4 h-4 mr-1" />
                {Math.max(0, event.max_attendees - currentRegistrationCount)}
              </div>
            </div>
          )}

          {/* Event Description */}
          {event.description && (
            <div className="p-3 border rounded-lg">
              <h4 className="text-sm font-medium mb-2">Description</h4>
              <p className="text-sm text-gray-600">
                {event.description.length > 500
                  ? `${event.description.substring(0, 500)}...`
                  : event.description}
              </p>
            </div>
          )}

          {/* Access Requirements */}
          {event.required_tokens.length > 0 && (
            <div className="p-3 border rounded-lg">
              <div className="flex items-center mb-2">
                <AlertCircle className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Token Requirements:</span>
              </div>
              <EventTokenDisplay
                tokenIds={event.required_tokens}
                showImages={true}
                compact={true}
                className="flex flex-wrap gap-2"
              />
            </div>
          )}

          {/* Status Messages */}
          {registrationStatus === 'checking' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Checking registration eligibility...
              </AlertDescription>
            </Alert>
          )}

          {registrationStatus === 'ineligible' && !isRegistered && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {isRegistered && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                You are already registered for this event!
              </AlertDescription>
            </Alert>
          )}

          {/* Token Approval Flow */}
          {showApprovalFlow && (
            <div className="mt-6">
              <TokenApprovalFlow
                systemTokenAmount={systemTokenAmount}
                selfTokenAmount={selfTokenAmount}
                onApprovalComplete={() => {
                  setShowApprovalFlow(false);
                  setRegistrationStatus('ready');
                }}
                onCancel={() => {
                  setShowApprovalFlow(false);
                  onClose();
                }}
              />
            </div>
          )}

          {/* Action Buttons */}
          {!showApprovalFlow && (
            <div className="flex justify-end space-x-3 pt-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>

              {isConnected &&
              (registrationStatus === 'eligible' ||
                registrationStatus === 'ready') ? (
                (() => {
                  // Check if we need approvals first
                  const needsTokens =
                    Number.parseFloat(systemTokenAmount) > 0 ||
                    Number.parseFloat(selfTokenAmount) > 0;

                  if (needsTokens && registrationStatus === 'eligible') {
                    return (
                      <Button
                        onClick={() => setShowApprovalFlow(true)}
                        className="hover:opacity-90"
                        style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                      >
                        Approve Tokens & Register
                      </Button>
                    );
                  }

                  // Ready to register (approvals complete or free event)
                  // Use CDP sendUserOperation instead of OnchainKit Transaction
                  return (
                    <Button
                      onClick={handleCdpRegistration}
                      disabled={isRegistering || !event.blockchain_event_id}
                      className="hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                    >
                      {isRegistering
                        ? 'Registering...'
                        : `Register${needsTokens ? ` (${systemTokenAmount} SYSTEM + ${selfTokenAmount} SELF)` : ''}`}
                    </Button>
                  );
                })()
              ) : (
                <Button disabled={true}>
                  {isConnected
                    ? registrationStatus === 'checking'
                      ? 'Checking...'
                      : registrationStatus === 'ineligible'
                        ? 'Cannot Register'
                        : 'Register'
                    : 'Connect Wallet'}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
