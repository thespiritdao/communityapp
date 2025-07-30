import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';

export interface EventStats {
  upcomingEvents: number;
  totalParticipants: number;
  completedEvents: number;
  loading: boolean;
  error: string | null;
}

export function useEventStats(): EventStats {
  const [stats, setStats] = useState<EventStats>({
    upcomingEvents: 0,
    totalParticipants: 0,
    completedEvents: 0,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchEventStats = async () => {
      try {
        setStats(prev => ({ ...prev, loading: true, error: null }));

        const now = new Date().toISOString();

        // Get upcoming events count (published events with future dates)
        const { count: upcomingCount, error: upcomingError } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .gte('event_date', now);

        if (upcomingError) throw upcomingError;

        // Get completed events count
        const { count: completedCount, error: completedError } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed');

        if (completedError) throw completedError;

        // Get total participants (all valid registrations across all events)
        const { count: participantsCount, error: participantsError } = await supabase
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .in('registration_status', ['registered', 'checked_in', 'completed'])
          .neq('registration_status', 'cancelled');

        if (participantsError) throw participantsError;

        setStats({
          upcomingEvents: upcomingCount || 0,
          totalParticipants: participantsCount || 0,
          completedEvents: completedCount || 0,
          loading: false,
          error: null
        });

      } catch (error) {
        console.error('Error fetching event stats:', error);
        setStats(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load event statistics'
        }));
      }
    };

    fetchEventStats();

    // Set up real-time subscription for updates
    const eventsSubscription = supabase
      .channel('events-stats')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'events' }, 
        () => fetchEventStats()
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'event_registrations' }, 
        () => fetchEventStats()
      )
      .subscribe();

    return () => {
      eventsSubscription.unsubscribe();
    };
  }, []);

  return stats;
}