'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Users, DollarSign, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { EventWithStats } from '../types/event';
import { useEventRegistration } from '../hooks/useEvents';
import { useEventAccess, useTokenRequirements } from '../hooks/useEventTokenGating';
import { EventService } from '../lib/supabase';

interface EventRegistrationModalProps {
  event: EventWithStats;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EventRegistrationModal: React.FC<EventRegistrationModalProps> = ({
  event,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { address } = useAccount();
  const { canRegister, canView, loading: accessLoading } = useEventAccess(event);
  const { hasRequiredTokens, userTokenBalances, loading: tokenLoading } = useTokenRequirements(event.required_tokens || []);
  const { registerForEvent, loading: registering, error } = useEventRegistration(event.id);
  
  const [step, setStep] = useState<'review' | 'payment' | 'success'>('review');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isEventFull = event.max_attendees ? event.registration_count >= event.max_attendees : false;
  const isPaid = event.price_token !== 'free' && parseFloat(event.price_amount) > 0;
  const isUpcoming = new Date(event.event_date) > new Date();

  const handleRegister = async () => {
    if (!address || !canRegister) return;

    try {
      if (isPaid) {
        setStep('payment');
        setPaymentProcessing(true);
        
        // TODO: Implement payment processing with smart contracts
        // This should integrate with EventEscrow contract
        // For now, simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const success = await registerForEvent(event.price_amount, event.price_token);
        if (success) {
          setStep('success');
          if (onSuccess) onSuccess();
        }
      } else {
        const success = await registerForEvent('0', 'free');
        if (success) {
          setStep('success');
          if (onSuccess) onSuccess();
        }
      }
    } catch (err) {
      console.error('Registration failed:', err);
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleClose = () => {
    setStep('review');
    setPaymentProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  const renderReviewStep = () => (
    <div className="space-y-6">
      {/* Event Details */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">{event.title}</h3>
          
          <div className="space-y-3">
            <div className="flex items-center text-gray-700">
              <Calendar className="w-5 h-5 mr-3 text-blue-500" />
              <span>{formatDate(event.event_date)}</span>
            </div>

            {event.location && (
              <div className="flex items-center text-gray-700">
                <MapPin className="w-5 h-5 mr-3 text-green-500" />
                <span>{event.location}</span>
              </div>
            )}

            <div className="flex items-center text-gray-700">
              <Users className="w-5 h-5 mr-3 text-purple-500" />
              <span>
                {event.registration_count} registered
                {event.max_attendees && ` of ${event.max_attendees} maximum`}
              </span>
            </div>

            {isPaid && (
              <div className="flex items-center text-gray-700">
                <DollarSign className="w-5 h-5 mr-3 text-yellow-500" />
                <span className="font-semibold">
                  {event.price_amount} {event.price_token}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Token Requirements Check */}
      {event.required_tokens && event.required_tokens.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h4 className="font-semibold mb-3 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
              Token Requirements
            </h4>
            <div className="space-y-2">
              {event.required_tokens.map((tokenId) => (
                <div key={tokenId} className="flex items-center justify-between">
                  <span className="text-gray-700">{tokenId}</span>
                  <Badge 
                    variant={hasRequiredTokens ? "default" : "destructive"}
                  >
                    {hasRequiredTokens ? "✓ Owned" : "✗ Required"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Registration Status Checks */}
      <div className="space-y-3">
        {!isUpcoming && (
          <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
            <span className="text-red-700">This event has already started or ended.</span>
          </div>
        )}

        {isEventFull && (
          <div className="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
            <span className="text-yellow-700">This event is at full capacity.</span>
          </div>
        )}

        {!hasRequiredTokens && event.required_tokens && event.required_tokens.length > 0 && (
          <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
            <span className="text-red-700">You don't have the required tokens to register for this event.</span>
          </div>
        )}

        {!address && (
          <div className="flex items-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 mr-2 text-blue-500" />
            <span className="text-blue-700">Please connect your wallet to register.</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button 
          onClick={handleRegister}
          disabled={!canRegister || !address || !isUpcoming || isEventFull || registering}
        >
          {registering ? 'Registering...' : isPaid ? `Pay ${event.price_amount} ${event.price_token}` : 'Register for Free'}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}
    </div>
  );

  const renderPaymentStep = () => (
    <div className="space-y-6 text-center">
      <div className="p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <h3 className="text-lg font-semibold mb-2">Processing Payment</h3>
        <p className="text-gray-600">
          Please confirm the transaction in your wallet to complete registration.
        </p>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="font-semibold">Payment Details:</p>
          <p>{event.price_amount} {event.price_token}</p>
          <p className="text-sm text-gray-600 mt-1">for {event.title}</p>
        </div>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center">
      <div className="p-8">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Registration Successful!</h3>
        <p className="text-gray-600 mb-6">
          You've successfully registered for {event.title}.
        </p>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-700 font-medium">What's Next?</p>
          <ul className="text-green-600 text-sm mt-2 space-y-1">
            <li>• You'll receive a registration NFT in your wallet</li>
            <li>• Check your notifications for event updates</li>
            <li>• Mark your calendar for {formatDate(event.event_date)}</li>
            {event.location && <li>• Event location: {event.location}</li>}
          </ul>
        </div>

        <div className="flex justify-center space-x-3">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button asChild>
            <a href={`/events/${event.id}`}>
              View Event Details
            </a>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'review' && 'Register for Event'}
            {step === 'payment' && 'Processing Payment'}
            {step === 'success' && 'Registration Complete'}
          </DialogTitle>
          <DialogDescription>
            {step === 'review' && 'Review the event details and complete your registration.'}
            {step === 'payment' && 'Your payment is being processed.'}
            {step === 'success' && 'You have successfully registered for this event.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          {step === 'review' && renderReviewStep()}
          {step === 'payment' && renderPaymentStep()}
          {step === 'success' && renderSuccessStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
};