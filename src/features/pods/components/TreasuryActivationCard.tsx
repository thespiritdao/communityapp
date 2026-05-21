'use client';

import * as React from 'react';
import { decodeEventLog, encodeFunctionData } from 'viem';
import { useCurrentUser, useWaitForUserOperation } from '@coinbase/cdp-hooks';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Copy, ExternalLink, Rocket, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSendUserOperationWithAttribution } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { publicClient } from '@/config/wagmi.client';
import { supabase } from '@/utils/supabaseClient';
import PodTreasuryDeployerV3Abi from '@/abis/PodTreasuryDeployerV3.json';
import PodTreasuryFactoryV3Abi from '@/abis/PodTreasuryFactoryV3.json';
import PodTreasuryV3Abi from '@/abis/PodTreasuryV3.json';
import { getV3TreasuryAddress } from '@/features/pods/utils/treasuryAddressUtils';

const DEPLOYER_ADDR = process.env
  .NEXT_PUBLIC_POD_TREASURY_DEPLOYER_V3 as `0x${string}` | undefined;
const FACTORY_ADDR = process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY_V3 as `0x${string}` | undefined;
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as
  | `0x${string}`
  | undefined;
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as
  | `0x${string}`
  | undefined;

interface Pod {
  id: string;
  name?: string;
  management_hat_id?: string | null;
  treasury_threshold_bps?: number | null;
  treasury_contract_address?: string | null;
}

interface Props {
  pod: Pod;
  isLeader: boolean;
  treasuryAddress: string | null;
  onDeployed: (treasuryAddress: string) => void;
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function decodeRevertReason(error: unknown): string {
  const message =
    (error as any)?.shortMessage ||
    (error as any)?.cause?.shortMessage ||
    (error as any)?.message ||
    'Unknown error';
  if (message.includes('Caller must hold management hat')) {
    return 'You must hold the pod management hat to deploy this treasury.';
  }
  if (message.includes('Hat not in canonical tree')) {
    return 'This pod hat is not in the SpiritDAO tree — contact admin.';
  }
  if (message.includes('Treasury already exists')) {
    return 'A treasury for this pod already exists on-chain.';
  }
  if (message.toLowerCase().includes('user rejected')) {
    return 'Treasury deploy cancelled.';
  }
  return message;
}

export function TreasuryActivationCard({
  pod,
  isLeader,
  treasuryAddress,
  onDeployed,
}: Props) {
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperationWithAttribution();

  const [deploying, setDeploying] = React.useState(false);
  const [userOpHash, setUserOpHash] = React.useState<`0x${string}` | null>(
    null,
  );

  const smartAccount = currentUser?.evmSmartAccounts?.[0] as
    | `0x${string}`
    | undefined;

  const { data: userOpData, status: waitStatus } = useWaitForUserOperation({
    userOperationHash: userOpHash ?? undefined,
    evmSmartAccount: smartAccount,
    network: 'base',
    enabled: !!userOpHash,
  });

  // Live-read threshold and supported tokens for status display
  const [liveThresholdBps, setLiveThresholdBps] = React.useState<number | null>(
    null,
  );
  const [supportedTokenCount, setSupportedTokenCount] = React.useState<
    number | null
  >(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!treasuryAddress) return;
      try {
        const [bps, tokens] = await Promise.all([
          publicClient.readContract({
            address: treasuryAddress as `0x${string}`,
            abi: PodTreasuryV3Abi,
            functionName: 'thresholdBps',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: treasuryAddress as `0x${string}`,
            abi: PodTreasuryV3Abi,
            functionName: 'getSupportedTokens',
          }) as Promise<`0x${string}`[]>,
        ]);
        if (cancelled) return;
        setLiveThresholdBps(Number(bps));
        setSupportedTokenCount(tokens.length);
      } catch (error) {
        console.error('Treasury live-read failed:', error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [treasuryAddress]);

  // When the userOp resolves with a transactionHash, parse the TreasuryDeployed
  // event from the receipt and persist the new treasury address.
  React.useEffect(() => {
    const txHash = userOpData?.transactionHash;
    if (!txHash || !FACTORY_ADDR) return;
    let cancelled = false;

    async function resolveDeploy() {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
        });

        let resolvedTreasury: `0x${string}` | null = null;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== FACTORY_ADDR!.toLowerCase())
            continue;
          try {
            const decoded = decodeEventLog({
              abi: PodTreasuryFactoryV3Abi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'TreasuryDeployed') {
              resolvedTreasury = (decoded.args as any)
                .treasuryAddress as `0x${string}`;
              break;
            }
          } catch {
            /* not our event */
          }
        }

        // Fallback: query factory if the log iteration missed the event.
        if (!resolvedTreasury) {
          resolvedTreasury = (await getV3TreasuryAddress(pod.id)) as
            | `0x${string}`
            | null;
        }

        if (!resolvedTreasury) {
          throw new Error('Treasury address not found in receipt or factory');
        }

        // Normalize to lowercase so the paymaster's case-sensitive .eq lookups
        // (and any future indexed queries) match consistently.
        const normalizedTreasury =
          resolvedTreasury.toLowerCase() as `0x${string}`;

        await supabase
          .from('pods')
          .update({ treasury_contract_address: normalizedTreasury })
          .eq('id', pod.id);

        if (cancelled) return;
        toast({
          title: 'Treasury deployed',
          description: `Treasury contract is live at ${shortAddress(normalizedTreasury)}.`,
        });
        setDeploying(false);
        setUserOpHash(null);
        onDeployed(normalizedTreasury);
      } catch (error) {
        console.error('Deploy receipt parse failed:', error);
        if (cancelled) return;
        toast({
          title: 'Deploy submitted but sync failed',
          description:
            'The transaction may have succeeded — refresh to confirm.',
          variant: 'destructive',
        });
        setDeploying(false);
        setUserOpHash(null);
      }
    }

    resolveDeploy();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userOpData?.transactionHash]);

  async function handleDeploy() {
    if (!DEPLOYER_ADDR || !FACTORY_ADDR) {
      toast({
        title: 'Configuration error',
        description: 'V3 treasury contracts are not configured.',
        variant: 'destructive',
      });
      return;
    }
    if (!SYSTEM_TOKEN || !SELF_TOKEN) {
      toast({
        title: 'Configuration error',
        description: 'Token addresses are not configured.',
        variant: 'destructive',
      });
      return;
    }
    if (!smartAccount) {
      toast({
        title: 'Wallet not ready',
        description: 'Connect your CDP wallet before deploying.',
        variant: 'destructive',
      });
      return;
    }
    if (!pod.management_hat_id) {
      toast({
        title: 'Pod not ready',
        description: 'This pod has no management hat assigned.',
        variant: 'destructive',
      });
      return;
    }
    if (!pod.treasury_threshold_bps) {
      toast({
        title: 'Threshold missing',
        description: 'This pod was created without a V3 threshold.',
        variant: 'destructive',
      });
      return;
    }

    setDeploying(true);
    try {
      const data = encodeFunctionData({
        abi: PodTreasuryDeployerV3Abi,
        functionName: 'deployTreasury',
        args: [
          pod.id,
          BigInt(pod.management_hat_id),
          [SYSTEM_TOKEN, SELF_TOKEN],
          BigInt(pod.treasury_threshold_bps),
        ],
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{ to: DEPLOYER_ADDR, data, value: 0n }],
        useCdpPaymaster: true,
      });

      setUserOpHash(result.userOperationHash);
    } catch (error) {
      console.error('Treasury deploy failed:', error);
      const message = decodeRevertReason(error);

      // Self-heal: if the contract reverted because the treasury already
      // exists, query the factory and write the address to the DB.
      if (message.includes('treasury for this pod already exists')) {
        try {
          const existing = await getV3TreasuryAddress(pod.id);
          if (existing) {
            const normalized = existing.toLowerCase() as `0x${string}`;
            await supabase
              .from('pods')
              .update({ treasury_contract_address: normalized })
              .eq('id', pod.id);
            toast({
              title: 'Treasury already deployed',
              description: 'Synced existing treasury address to this pod.',
            });
            onDeployed(normalized);
            setDeploying(false);
            return;
          }
        } catch {
          /* fall through to generic error */
        }
      }

      toast({
        title: 'Treasury deploy failed',
        description: message,
        variant: 'destructive',
      });
      setDeploying(false);
    }
  }

  function handleCopy(addr: string) {
    navigator.clipboard
      .writeText(addr)
      .then(() => toast({ title: 'Address copied' }))
      .catch(() => {
        /* clipboard denied — silent */
      });
  }

  const waiting =
    deploying ||
    waitStatus === 'pending' ||
    (!!userOpHash && !userOpData?.transactionHash);

  if (treasuryAddress) {
    // Post-deploy status mode
    const thresholdLabel =
      liveThresholdBps != null
        ? `${(liveThresholdBps / 100).toFixed(liveThresholdBps % 100 === 0 ? 0 : 2)}%`
        : null;
    return (
      <Card className="bg-[#E8F1EE] border-[#B8D9CA]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-[#1F453A]">
            <Coins className="h-4 w-4" />
            Treasury deployed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
              {shortAddress(treasuryAddress)}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleCopy(treasuryAddress)}
              aria-label="Copy address"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <a
              href={`https://basescan.org/address/${treasuryAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[#2F5D50] hover:underline"
            >
              Basescan
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {thresholdLabel && (
              <Badge variant="outline" className="bg-white">
                Threshold: {thresholdLabel}
              </Badge>
            )}
            {supportedTokenCount != null && (
              <Badge variant="outline" className="bg-white">
                {supportedTokenCount} token
                {supportedTokenCount === 1 ? '' : 's'} supported
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pre-deploy activation mode
  const configuredThresholdPct =
    pod.treasury_threshold_bps != null
      ? (pod.treasury_threshold_bps / 100).toFixed(
          pod.treasury_threshold_bps % 100 === 0 ? 0 : 2,
        )
      : null;

  return (
    <Card className="bg-[#F5F4ED] border-[#D1C4A9]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-[#1F453A]">
          <Coins className="h-4 w-4" />
          Treasury awaiting activation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-700">
          This pod was set up with a{' '}
          {configuredThresholdPct ? (
            <strong>{configuredThresholdPct}% approval threshold</strong>
          ) : (
            'configured threshold'
          )}
          . Deploy the on-chain treasury to enable donations and multi-sig
          spending.
        </p>
        {!isLeader && (
          <div className="flex items-start gap-2 text-sm text-[#8B5E3C]">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Only a pod leader can deploy this treasury.</span>
          </div>
        )}
        <Button
          type="button"
          onClick={handleDeploy}
          disabled={!isLeader || waiting}
          className="inline-flex items-center gap-2"
        >
          <Rocket className="h-4 w-4" />
          {waiting ? 'Deploying…' : 'Deploy Treasury'}
        </Button>
        {waiting && (
          <p className="text-xs text-gray-600">
            Submitting gas-sponsored user operation. This usually takes 30–60
            seconds.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default TreasuryActivationCard;
