'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Vote, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  ThresholdPicker,
  type ThresholdPreset,
} from './ThresholdPicker';
import {
  PLATFORM_DEFAULTS,
  VOTING_HOURS_CEIL,
  VOTING_HOURS_FLOOR,
  getPodGovernanceConfig,
  updatePodGovernanceConfig,
  type PodGovernanceConfig,
} from '@/features/pods/services/podGovernanceConfigService';

const QUORUM_PRESETS: ThresholdPreset[] = [
  { key: 'q-25', label: '25%', bps: 2500, description: 'Light participation bar' },
  { key: 'q-33', label: '33%', bps: 3300, description: 'Standard quorum' },
  { key: 'q-50', label: '50%', bps: 5000, description: 'Majority must show up' },
  { key: 'q-66', label: '66%', bps: 6600, description: 'Supermajority participation' },
];

const APPROVAL_PRESETS: ThresholdPreset[] = [
  {
    key: 'a-simple',
    label: 'Simple',
    bps: 5001,
    description: '50%+1 — fastest to pass',
  },
  {
    key: 'a-strict',
    label: 'Strict',
    bps: 6600,
    description: '66% supermajority',
  },
  {
    key: 'a-strong',
    label: 'Strong',
    bps: 7500,
    description: '75% — high consensus',
  },
  {
    key: 'a-unanimous',
    label: 'Unanimous',
    bps: 10000,
    description: '100% — every vote must align',
  },
];

const VOTING_HOUR_CHIPS = [
  { label: '24h', value: 24 },
  { label: '72h', value: 72 },
  { label: '7d', value: 168 },
  { label: '14d', value: 336 },
  { label: '30d', value: 720 },
];

interface Props {
  podId: string;
}

interface TierFormState {
  quorum_bps: number;
  approval_bps: number;
  voting_hours: number;
  voter_base: 'leaders' | 'all_members';
}

function tierSection(
  config: PodGovernanceConfig,
  tier: 'operational' | 'treasury',
): TierFormState {
  const src = config[tier];
  return {
    quorum_bps: src.quorum_bps,
    approval_bps: src.approval_bps,
    voting_hours: src.voting_hours,
    voter_base: src.voter_base,
  };
}

export function GovernanceSettingsCard({ podId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const [opState, setOpState] = React.useState<TierFormState | null>(null);
  const [treasuryState, setTreasuryState] = React.useState<TierFormState | null>(
    null,
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getPodGovernanceConfig(podId);
      setOpState(tierSection(cfg, 'operational'));
      setTreasuryState(tierSection(cfg, 'treasury'));
    } catch (error) {
      console.error('Failed to load governance config', error);
      toast({
        title: 'Could not load governance settings',
        description: 'Try refreshing the page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [podId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!opState || !treasuryState) return;
    setSaving(true);
    try {
      await updatePodGovernanceConfig(podId, 'POD_OPERATIONAL', opState);
      await updatePodGovernanceConfig(podId, 'POD_TREASURY_BINDING', treasuryState);
      toast({
        title: 'Governance settings saved',
        description: 'New thresholds apply to proposals created from now on.',
      });
    } catch (error) {
      console.error('Save failed', error);
      toast({
        title: 'Save failed',
        description:
          error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleResetOperational() {
    setOpState({ ...PLATFORM_DEFAULTS.POD_OPERATIONAL });
  }
  function handleResetTreasury() {
    setTreasuryState({ ...PLATFORM_DEFAULTS.POD_TREASURY_BINDING });
  }

  return (
    <Card className="bg-[#F5F4ED] border-[#D1C4A9]">
      <CardHeader
        className="pb-3 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <CardTitle className="flex items-center justify-between gap-2 text-base text-[#1F453A]">
          <span className="flex items-center gap-2">
            <Vote className="h-4 w-4" />
            Governance settings
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
            Configure how this pod's proposals reach decisions. Quorum sets how
            many eligible voters must participate; approval sets the share of
            votes cast that must be Yes; voting period sets how long the vote
            stays open.
          </p>

          {loading && (
            <p className="text-sm text-gray-500">Loading current settings…</p>
          )}

          {!loading && opState && (
            <TierBlock
              title="Operational proposals"
              subtitle="Routine pod coordination. Voter base: pod leaders only."
              state={opState}
              onChange={setOpState}
              onReset={handleResetOperational}
              defaultState={PLATFORM_DEFAULTS.POD_OPERATIONAL}
              disabled={saving}
            />
          )}

          {!loading && treasuryState && (
            <TierBlock
              title="Treasury proposals"
              subtitle="Anything that moves pod funds. Voter base: all active pod members."
              state={treasuryState}
              onChange={setTreasuryState}
              onReset={handleResetTreasury}
              defaultState={PLATFORM_DEFAULTS.POD_TREASURY_BINDING}
              disabled={saving}
            />
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-[#D1C4A9]">
            <Button type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <p className="text-xs text-gray-600">
              Changes apply to proposals created after saving. In-flight
              proposals keep the rules they were created under.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface TierBlockProps {
  title: string;
  subtitle: string;
  state: TierFormState;
  onChange: (next: TierFormState) => void;
  onReset: () => void;
  defaultState: TierFormState;
  disabled: boolean;
}

function TierBlock({
  title,
  subtitle,
  state,
  onChange,
  onReset,
  defaultState,
  disabled,
}: TierBlockProps) {
  const isDefault =
    state.quorum_bps === defaultState.quorum_bps &&
    state.approval_bps === defaultState.approval_bps &&
    state.voting_hours === defaultState.voting_hours &&
    state.voter_base === defaultState.voter_base;

  return (
    <div className="space-y-4 p-4 bg-white rounded-md border border-[#E8E4DC]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#1F453A]">{title}</h4>
          <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || isDefault}
          onClick={onReset}
          className="text-xs"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset to default
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Who votes?</Label>
        <p className="text-xs text-gray-600 -mt-1">
          Members must also have the governanceParticipation permission on
          their role to vote. This setting narrows the audience; permissions
          gate individuals.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={state.voter_base === 'all_members' ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ ...state, voter_base: 'all_members' })}
          >
            All pod members
          </Button>
          <Button
            type="button"
            variant={state.voter_base === 'leaders' ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ ...state, voter_base: 'leaders' })}
          >
            Pod leaders only
          </Button>
        </div>
      </div>

      <ThresholdPicker
        label="Quorum"
        helperText="What share of eligible voters must participate for the result to count."
        value={state.quorum_bps}
        onChange={(bps) => onChange({ ...state, quorum_bps: bps })}
        presets={QUORUM_PRESETS}
        min={2000}
        max={10000}
        step={100}
        disabled={disabled}
        customChipDescription="Pick any value 20–100%"
      />

      <ThresholdPicker
        label="Approval"
        helperText="Of votes cast (excluding abstentions), what share must be Yes for the proposal to pass."
        value={state.approval_bps}
        onChange={(bps) => onChange({ ...state, approval_bps: bps })}
        presets={APPROVAL_PRESETS}
        min={5001}
        max={10000}
        step={100}
        disabled={disabled}
        customChipDescription="Pick any value 51–100%"
      />

      <div className="space-y-2">
        <Label className="text-sm font-medium">Voting period</Label>
        <p className="text-xs text-gray-600 -mt-1">
          How long proposals stay open for votes (between {VOTING_HOURS_FLOOR}h
          and {VOTING_HOURS_CEIL}h).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {VOTING_HOUR_CHIPS.map((chip) => {
            const selected = state.voting_hours === chip.value;
            return (
              <Button
                key={chip.value}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onChange({ ...state, voting_hours: chip.value })
                }
              >
                {chip.label}
              </Button>
            );
          })}
          <input
            type="number"
            min={VOTING_HOURS_FLOOR}
            max={VOTING_HOURS_CEIL}
            value={state.voting_hours}
            disabled={disabled}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) {
                onChange({
                  ...state,
                  voting_hours: Math.max(
                    VOTING_HOURS_FLOOR,
                    Math.min(VOTING_HOURS_CEIL, next),
                  ),
                });
              }
            }}
            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Custom voting period in hours"
          />
          <span className="text-xs text-gray-500">hours</span>
        </div>
      </div>
    </div>
  );
}

export default GovernanceSettingsCard;
