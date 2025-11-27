// Hook to check pod module permissions app-wide
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';

interface PodModules {
  chat_enabled: boolean;
  forum_enabled: boolean;
  treasury_enabled: boolean;
  events_enabled: boolean;
  bounties_enabled: boolean;
  marketplace_enabled: boolean;
}

interface UsePodModulesReturn {
  modules: Record<string, PodModules>;
  loading: boolean;
  error: string | null;
  isModuleEnabled: (podId: string, module: keyof PodModules) => boolean;
  refreshModules: () => Promise<void>;
}

export const usePodModules = (): UsePodModulesReturn => {
  const [modules, setModules] = useState<Record<string, PodModules>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAllModules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('pod_modules').select(`
          pod_id,
          chat_enabled,
          forum_enabled,
          treasury_enabled,
          events_enabled,
          bounties_enabled,
          marketplace_enabled
        `);

      if (error) throw error;

      // Convert array to lookup map
      const moduleMap: Record<string, PodModules> = {};
      (data || []).forEach((item) => {
        moduleMap[item.pod_id] = {
          chat_enabled: item.chat_enabled,
          forum_enabled: item.forum_enabled,
          treasury_enabled: item.treasury_enabled,
          events_enabled: item.events_enabled,
          bounties_enabled: item.bounties_enabled,
          marketplace_enabled: item.marketplace_enabled,
        };
      });

      console.log('usePodModules: Loaded module data:', {
        rawData: data,
        moduleMap: moduleMap,
      });

      setModules(moduleMap);
      setError(null);
    } catch (err) {
      console.error('Error loading pod modules:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load pod modules',
      );
    } finally {
      setLoading(false);
    }
  };

  const isModuleEnabled = (
    podId: string,
    module: keyof PodModules,
  ): boolean => {
    const enabled = modules[podId]?.[module] ?? false;
    console.log('usePodModules: isModuleEnabled check:', {
      podId,
      module,
      enabled,
      moduleData: modules[podId],
      allModules: Object.keys(modules),
    });
    return enabled;
  };

  const refreshModules = async () => {
    await loadAllModules();
  };

  useEffect(() => {
    loadAllModules();

    // Subscribe to changes in pod_modules
    const subscription = supabase
      .channel('pod_modules_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pod_modules' },
        (payload) => {
          console.log('usePodModules: Database change detected:', payload);
          loadAllModules();
        },
      )
      .subscribe();

    console.log('usePodModules: Subscription created:', subscription);

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    modules,
    loading,
    error,
    isModuleEnabled,
    refreshModules,
  };
};
