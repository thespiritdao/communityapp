'use client';

// DAO-wide governance settings card.
//
// Lives inside the Governance module config panel on the Executive Pod's
// manage page (see PodModulesManager). Exec leaders only. Lets them
// propose changes to the deployed DAOGovernor's tunable parameters
// (voting delay, voting period, quorum %). The proposal goes through
// the standard on-chain Governor flow — vote, queue, execute — and the
// setters themselves are gated by the contract's onlyGovernance modifier,
// so the only way these values change is via a passing DAO proposal.
//
// Mirrors GovernanceSettingsCard's shape and state-machine but
// reads current values from chain (not Supabase) and writes via
// proposeWithMetadata (not Supabase UPDATE).

import * as React from 'react';
import { createPublicClient, encodeFunctionData, http } from 'viem';
import { base } from 'viem/chains';
import { useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Landmark,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Rocket,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  ThresholdPicker,
  type ThresholdPreset,
} from '@/features/pods/components/ThresholdPicker';
import { ProposalThreadSelector } from './ProposalThreadSelector';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/hooks/useSendUserOperationWithAttribution';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';
import {
  BASE_SECONDS_PER_BLOCK,
  QUORUM_MAX_PERCENT,
  QUORUM_MIN_PERCENT,
  VOTING_DELAY_MAX_HOURS,
  VOTING_DELAY_MIN_HOURS,
  VOTING_PERIOD_MAX_HOURS,
  VOTING_PERIOD_MIN_HOURS,
  blocksToHours,
  buildDaoParamProposal,
  hoursToBlocks,
} from '@/features/governance/services/daoGovernorParamProposal';
import { insertProposalMetadata } from '@/features/governance/services/proposalMetadataService';

const GOV = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

const VOTING_DELAY_CHIPS = [1, 6, 24, 48];
const VOTING_PERIOD_CHIPS = [24, 72, 168, 336];

// ThresholdPicker speaks basis points (× 100). We want percent units.
// Multiply percent → bps at the boundary, divide back when reading.
const PERCENT_TO_BPS = 100;
const QUORUM_PRESETS: ThresholdPreset[] = [
  { key: 'q-4', label: '4%', bps: 4 * PERCENT_TO_BPS, description: 'Light participation bar' },
  { key: 'q-7', label: '7%', bps: 7 * PERCENT_TO_BPS, description: 'Moderate participation' },
  { key: 'q-10', label: '10%', bps: 10 * PERCENT_TO_BPS, description: 'Standard quorum' },
  { key: 'q-15', label: '15%', bps: 15 * PERCENT_TO_BPS, description: 'Higher engagement bar' },
];

interface Props {
  /** When false, the card renders a disabled stub. */
  canPropose: boolean;
}

interface OnChainSnapshot {
  votingDelayBlocks: number;
  votingPeriodBlocks: number;
  quorumPercent: number;
  quorumDenominator: number;
}

interface FormState {
  votingDelayHours: number;
  votingPeriodHours: number;
  quorumPercent: number;
}

function snapshotToForm(s: OnChainSnapshot): FormState {
  return {
    votingDelayHours: Math.round(blocksToHours(s.votingDelayBlocks)),
    votingPeriodHours: Math.round(blocksToHours(s.votingPeriodBlocks)),
    quorumPercent: s.quorumPercent,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function DAOGovernanceSettingsCard({ canPropose }: Props) {
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();
  const { evmAddress: address } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();

  const [expanded, setExpanded] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [denominatorWarning, setDenominatorWarning] = React.useState(false);

  const [snapshot, setSnapshot] = React.useState<OnChainSnapshot | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [title, setTitle] = React.useState('');
  const [rationale, setRationale] = React.useState('');
  const [forumThreadId, setForumThreadId] = React.useState('');

  // Read current values from chain on mount. `toast` deliberately omitted
  // from deps to avoid the render-loop bug that bit GovernanceSettingsCard
  // earlier this week (toast identity isn't stable across renders).
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.NEXT_PUBLIC_RPC_URL!),
        });
        const [vd, vp, qn, qd] = await Promise.all([
          publicClient.readContract({
            address: GOV,
            abi: DAOGovernorABIJson,
            functionName: 'votingDelay',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: GOV,
            abi: DAOGovernorABIJson,
            functionName: 'votingPeriod',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: GOV,
            abi: DAOGovernorABIJson,
            functionName: 'quorumNumerator',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: GOV,
            abi: DAOGovernorABIJson,
            functionName: 'quorumDenominator',
          }) as Promise<bigint>,
        ]);

        if (cancelled) return;

        const denom = Number(qd);
        if (denom !== 100) {
          // Defensive: our percent→arg conversion assumes denominator=100.
          // Don't render the controls; show an admin warning instead.
          setDenominatorWarning(true);
          setLoading(false);
          return;
        }

        const snap: OnChainSnapshot = {
          votingDelayBlocks: Number(vd),
          votingPeriodBlocks: Number(vp),
          quorumPercent: Number(qn), // because denom=100
          quorumDenominator: denom,
        };
        setSnapshot(snap);
        setForm(snapshotToForm(snap));
      } catch (e) {
        if (cancelled) return;
        console.error('DAOGovernanceSettingsCard: chain read failed', e);
        toast({
          title: 'Could not load DAO governance settings',
          description:
            'Try refreshing the page. If it persists, the Governor RPC may be unreachable.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetToCurrent() {
    if (snapshot) setForm(snapshotToForm(snapshot));
  }

  const isDirty = React.useMemo(() => {
    if (!snapshot || !form) return false;
    const snapForm = snapshotToForm(snapshot);
    return (
      snapForm.votingDelayHours !== form.votingDelayHours ||
      snapForm.votingPeriodHours !== form.votingPeriodHours ||
      snapForm.quorumPercent !== form.quorumPercent
    );
  }, [snapshot, form]);

  const canSubmit =
    canPropose &&
    !!form &&
    !!snapshot &&
    isDirty &&
    title.trim().length > 0 &&
    rationale.trim().length > 0 &&
    !submitting;

  async function handlePropose() {
    if (!form || !snapshot) return;
    const smartAccount = currentUser?.evmSmartAccounts?.[0];
    if (!smartAccount) {
      toast({
        title: 'Wallet not ready',
        description: 'Connect your CDP wallet before proposing.',
        variant: 'destructive',
      });
      return;
    }

    // Only include knobs the user actually changed.
    const snapForm = snapshotToForm(snapshot);
    const changes: {
      votingDelayBlocks?: number;
      votingPeriodBlocks?: number;
      quorumPercent?: number;
    } = {};
    if (form.votingDelayHours !== snapForm.votingDelayHours) {
      changes.votingDelayBlocks = hoursToBlocks(form.votingDelayHours);
    }
    if (form.votingPeriodHours !== snapForm.votingPeriodHours) {
      changes.votingPeriodBlocks = hoursToBlocks(form.votingPeriodHours);
    }
    if (form.quorumPercent !== snapForm.quorumPercent) {
      changes.quorumPercent = form.quorumPercent;
    }

    setSubmitting(true);
    try {
      const built = buildDaoParamProposal(
        GOV,
        changes,
        title.trim(),
        rationale.trim(),
        forumThreadId || undefined,
      );

      const outerCallData = encodeFunctionData({
        abi: DAOGovernorABIJson,
        functionName: 'proposeWithMetadata',
        args: [
          built.targets,
          built.values,
          built.calldatas,
          built.description,
          built.title,
          built.forumThreadId,
        ],
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount as `0x${string}`,
        network: 'base',
        calls: [{ to: GOV, value: 0n, data: outerCallData }],
        useCdpPaymaster: true,
      } as any);

      const txHash =
        (result as any)?.transactionHash ||
        (result as any)?.userOperationHash ||
        '';
      const tempProposalId = txHash ? `temp_${txHash.slice(2, 10)}` : null;

      if (tempProposalId && txHash && address) {
        await insertProposalMetadata({
          tempProposalId,
          title: built.title,
          description: built.description,
          proposerAddress: address,
          forumThreadId: built.forumThreadId || null,
          tokenId: 'dao-wide',
          transactionHash: txHash,
        }).catch((e) =>
          console.error('insertProposalMetadata failed (non-fatal)', e),
        );
      }

      toast({
        title: 'Proposal submitted',
        description:
          'Exec Pod members can now vote on this governance change in /governance.',
      });

      setTitle('');
      setRationale('');
      setForumThreadId('');
      resetToCurrent();
    } catch (e: any) {
      console.error('DAOGovernanceSettingsCard: propose failed', e);
      toast({
        title: 'Could not submit proposal',
        description:
          e?.shortMessage || e?.message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="bg-[#F5F4ED] border-[#D1C4A9]">
      <CardHeader
        className="pb-3 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <CardTitle className="flex items-center justify-between gap-2 text-base text-[#1F453A]">
          <span className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            DAO-wide Governance
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-700">
            Propose changes to the DAO Governor's voting parameters. Every
            change here becomes a DAO proposal voted on by all Advocate
            members — Exec Pod leaders draft it, the membership ratifies it.
            Changes only take effect after the proposal passes and is
            executed; they apply to future proposals, not those already in
            flight.
          </p>

          {loading && (
            <p className="text-sm text-gray-500">
              Loading current values from chain…
            </p>
          )}

          {denominatorWarning && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-[#FAF4EC] border border-[#E8D7B8] text-sm text-[#8B5E3C]">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                The deployed Governor's quorum denominator is not 100. This
                card assumes percent-based quorum arguments; controls disabled
                until the denominator is verified.
              </span>
            </div>
          )}

          {!loading && !denominatorWarning && snapshot && form && (
            <>
              <div className="text-xs text-gray-600 p-3 rounded-md bg-white border border-[#E8E4DC]">
                <div className="font-semibold text-[#1F453A] mb-1">
                  Current on-chain values
                </div>
                <div>
                  Voting delay: {blocksToHours(snapshot.votingDelayBlocks).toFixed(1)}h
                  ({snapshot.votingDelayBlocks} blocks)
                </div>
                <div>
                  Voting period: {blocksToHours(snapshot.votingPeriodBlocks).toFixed(1)}h
                  ({snapshot.votingPeriodBlocks} blocks)
                </div>
                <div>
                  Quorum: {snapshot.quorumPercent}% (of total voting power)
                </div>
                <div className="mt-1 text-gray-500">
                  Base block time: ~{BASE_SECONDS_PER_BLOCK}s
                </div>
              </div>

              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-gray-600">
                  Change any combination of the three knobs; only the changed
                  ones will be included in your proposal.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitting || !isDirty}
                  onClick={resetToCurrent}
                  className="text-xs flex-shrink-0"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset to current
                </Button>
              </div>

              <HoursPicker
                label="Voting delay"
                helperText="How long between proposal creation and the start of voting."
                value={form.votingDelayHours}
                onChange={(h) => setForm({ ...form, votingDelayHours: h })}
                min={VOTING_DELAY_MIN_HOURS}
                max={VOTING_DELAY_MAX_HOURS}
                chips={VOTING_DELAY_CHIPS}
                disabled={submitting}
              />

              <HoursPicker
                label="Voting period"
                helperText="How long voting stays open for a proposal."
                value={form.votingPeriodHours}
                onChange={(h) => setForm({ ...form, votingPeriodHours: h })}
                min={VOTING_PERIOD_MIN_HOURS}
                max={VOTING_PERIOD_MAX_HOURS}
                chips={VOTING_PERIOD_CHIPS}
                disabled={submitting}
              />

              <ThresholdPicker
                label="Quorum"
                helperText="What share of total voting power must participate for a proposal to count."
                value={form.quorumPercent * PERCENT_TO_BPS}
                onChange={(bps) =>
                  setForm({
                    ...form,
                    quorumPercent: clamp(
                      Math.round(bps / PERCENT_TO_BPS),
                      QUORUM_MIN_PERCENT,
                      QUORUM_MAX_PERCENT,
                    ),
                  })
                }
                presets={QUORUM_PRESETS}
                min={QUORUM_MIN_PERCENT * PERCENT_TO_BPS}
                max={QUORUM_MAX_PERCENT * PERCENT_TO_BPS}
                step={PERCENT_TO_BPS}
                disabled={submitting}
                customChipDescription={`Any value ${QUORUM_MIN_PERCENT}–${QUORUM_MAX_PERCENT}%`}
              />

              <div className="space-y-2 pt-4 border-t border-[#D1C4A9]">
                <Label htmlFor="dao-prop-title" className="text-sm font-medium">
                  Proposal title <span className="text-[#8B3A3A]">*</span>
                </Label>
                <Input
                  id="dao-prop-title"
                  value={title}
                  disabled={submitting}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Raise DAO quorum to 7%"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="dao-prop-rationale"
                  className="text-sm font-medium"
                >
                  Rationale <span className="text-[#8B3A3A]">*</span>
                </Label>
                <Textarea
                  id="dao-prop-rationale"
                  value={rationale}
                  disabled={submitting}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why is this change needed?"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Forum thread (recommended)
                </Label>
                <ProposalThreadSelector
                  onThreadSelect={(threadId: string) =>
                    setForumThreadId(threadId || '')
                  }
                />
              </div>

              {!canPropose && (
                <div className="flex items-start gap-2 text-sm text-[#8B5E3C]">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Only Executive Pod members with governanceParticipation can
                    submit DAO governance proposals.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-[#D1C4A9]">
                <Button
                  type="button"
                  onClick={handlePropose}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2"
                >
                  <Rocket className="h-4 w-4" />
                  {submitting ? 'Submitting…' : 'Propose change'}
                </Button>
                <p className="text-xs text-gray-600">
                  Proposal goes to standard DAO-wide voting. Changes take
                  effect only after execution.
                </p>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface HoursPickerProps {
  label: string;
  helperText: string;
  value: number;
  onChange: (h: number) => void;
  min: number;
  max: number;
  chips: number[];
  disabled?: boolean;
}

function HoursPicker({
  label,
  helperText,
  value,
  onChange,
  min,
  max,
  chips,
  disabled,
}: HoursPickerProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-gray-600 -mt-1">{helperText}</p>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((h) => {
          const selected = value === h;
          return (
            <Button
              key={h}
              type="button"
              variant={selected ? 'default' : 'outline'}
              size="sm"
              disabled={disabled}
              onClick={() => onChange(h)}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </Button>
          );
        })}
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) {
              onChange(clamp(next, min, max));
            }
          }}
          className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={`Custom ${label.toLowerCase()} in hours`}
        />
        <span className="text-xs text-gray-500">hours ({min}–{max})</span>
      </div>
    </div>
  );
}

export default DAOGovernanceSettingsCard;
