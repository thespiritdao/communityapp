'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExecPodReviewPanel } from '@/features/pods/components/ExecPodReviewPanel';
import { getClientHatId } from '@/lib/hatRegistryClient';
import { supabase } from '@/utils/supabaseClient';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export default function PodReviewPage() {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (!address) return;

    const checkAuth = async () => {
      try {
        const execHatId = getClientHatId('EXECUTIVE_POD_LEADER');
        if (!execHatId || !process.env.NEXT_PUBLIC_HATS_CONTRACT) {
          setAuthorized(false);
          return;
        }

        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
        });

        const balance = await publicClient.readContract({
          address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
          abi: [
            {
              name: 'balanceOf',
              type: 'function',
              inputs: [
                { name: 'wearer', type: 'address' },
                { name: 'hatId', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'balanceOf',
          args: [address as `0x${string}`, BigInt(execHatId)],
        });

        setAuthorized((balance as bigint) > 0n);
      } catch {
        setAuthorized(false);
      }
    };

    checkAuth();
  }, [address]);

  if (!address || authorized === null) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Checking access...
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h2 className="font-semibold text-lg mb-2">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This page is only accessible to Executive Pod Leaders.
        </p>
        <Button variant="outline" onClick={() => router.push('/pods')}>
          Back to Pods
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl bottom-nav-spacing">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/pods')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Pods
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-green-700" />
            Pod Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and approve pending pod proposals
          </p>
        </div>
      </div>

      <ExecPodReviewPanel />
    </div>
  );
}
