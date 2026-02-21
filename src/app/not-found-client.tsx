'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { getExecutivePodManagers } from '@/features/pods/utils/podNotificationHelpers';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

/**
 * Client-side component that fires a system_alert notification to exec pod
 * leaders when a 404 is hit. Runs once on mount.
 */
export function NotFoundReporter() {
  const pathname = usePathname();

  useEffect(() => {
    const report = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const senderAddress = session?.user?.user_metadata?.wallet_address ?? 'anonymous';

        const executives = await getExecutivePodManagers();
        if (executives.length === 0) return;

        const url = typeof window !== 'undefined' ? window.location.href : pathname;

        await Promise.allSettled(
          executives.map((exec) =>
            unifiedNotificationService.createNotification({
              recipient_address: exec.wallet_address,
              sender_address: senderAddress,
              notification_type: 'system_alert',
              title: '404 Error Detected',
              message: `A user hit a 404 at: ${url}`,
              context_id: pathname,
              context_url: url,
              priority: 'high',
            }),
          ),
        );
      } catch {
        // Non-fatal — never block the 404 page render
      }
    };

    report();
  }, [pathname]);

  return null;
}
