import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { supabase } from '@/lib/supabase';

export function useRegistrationStatus(eventId: string | null) {
  const { address } = useAccount();
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkRegistrationStatus = useCallback(async () => {
    if (!eventId || !address) {
      setIsRegistered(false);
      setRegistrationStatus(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: existingRegistration, error: regError } = await supabase
        .from('event_registrations')
        .select('id, registration_status, registered_at')
        .eq('event_id', eventId)
        .eq('user_address', address.toLowerCase())
        .in('registration_status', ['registered', 'checked_in', 'completed'])
        .maybeSingle();

      if (regError && regError.code !== 'PGRST116') {
        throw regError;
      }

      if (existingRegistration) {
        setIsRegistered(true);
        setRegistrationStatus(existingRegistration.registration_status);
      } else {
        setIsRegistered(false);
        setRegistrationStatus(null);
      }
    } catch (err) {
      console.error('Error checking registration status:', err);
      setError(err instanceof Error ? err.message : 'Failed to check registration status');
      setIsRegistered(false);
      setRegistrationStatus(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, address]);

  useEffect(() => {
    checkRegistrationStatus();
  }, [checkRegistrationStatus]);

  return {
    isRegistered,
    registrationStatus,
    loading,
    error,
    refetch: checkRegistrationStatus
  };
}