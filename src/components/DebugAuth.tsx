'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuthContext } from '@/features/identity';
import { useEvmAddress } from '@coinbase/cdp-hooks';

/**
 * Debug Component - Shows Supabase Auth State
 * Add this to any page to see auth debugging info
 */
export default function DebugAuth() {
  const { session } = useAuthContext();
  const { evmAddress } = useEvmAddress();
  const [profileData, setProfileData] = useState<any>(null);
  const [podData, setPodData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      if (!session?.user) {
        console.log('❌ No Supabase session');
        setLoading(false);
        return;
      }

      console.log('✅ Supabase Session:', {
        userId: session.user.id,
        email: session.user.email,
      });

      // Check user_profiles
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, wallet_address, email')
        .eq('user_id', session.user.id)
        .single();

      console.log('user_profiles lookup:', { profile, profileError });
      setProfileData({ profile, profileError });

      // Check pod permissions
      const podId = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('id, name, pod_leads, created_by_address')
        .eq('id', podId)
        .single();

      console.log('Pod lookup:', { pod, podError });

      if (pod && profile) {
        const inPodLeads = pod.pod_leads?.some(
          (lead: string) =>
            lead.toLowerCase() === profile.wallet_address?.toLowerCase()
        );
        const isCreator =
          pod.created_by_address?.toLowerCase() ===
          profile.wallet_address?.toLowerCase();

        console.log('Permission check:', { inPodLeads, isCreator });
        setPodData({ pod, inPodLeads, isCreator });
      }

      setLoading(false);
    }

    checkAuth();
  }, [session]);

  if (loading) return <div className="p-4 bg-yellow-100">Loading auth debug...</div>;

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-white border-2 border-red-500 rounded shadow-lg max-w-md text-xs z-50">
      <h3 className="font-bold text-red-600 mb-2">🔍 AUTH DEBUG</h3>

      <div className="space-y-2">
        <div>
          <strong>Supabase Auth:</strong>
          {session?.user ? (
            <div className="ml-2">
              <div>✅ User ID: {session.user.id}</div>
              <div>Email: {session.user.email}</div>
            </div>
          ) : (
            <div>❌ No session</div>
          )}
        </div>

        <div>
          <strong>CDP Wallet:</strong>
          <div className="ml-2">{evmAddress || '❌ Not connected'}</div>
        </div>

        <div>
          <strong>user_profiles:</strong>
          {profileData?.profileError ? (
            <div className="ml-2 text-red-600">
              ❌ Error: {profileData.profileError.message}
              {profileData.profileError.code === 'PGRST116' && (
                <div className="mt-1 text-xs">
                  NO PROFILE EXISTS for this auth.uid()!
                </div>
              )}
            </div>
          ) : (
            <div className="ml-2">
              <div>✅ Found profile</div>
              <div>
                Wallet:{' '}
                {profileData?.profile?.wallet_address || '❌ NULL'}
              </div>
            </div>
          )}
        </div>

        {podData && (
          <div>
            <strong>Pod Permissions:</strong>
            <div className="ml-2">
              <div>
                In pod_leads: {podData.inPodLeads ? '✅' : '❌'}
              </div>
              <div>
                Is creator: {podData.isCreator ? '✅' : '❌'}
              </div>
              <div className="mt-1 font-bold">
                RLS should:{' '}
                {podData.inPodLeads || podData.isCreator ? (
                  <span className="text-green-600">PASS ✅</span>
                ) : (
                  <span className="text-red-600">FAIL ❌</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Check browser console for detailed logs
      </div>
    </div>
  );
}
