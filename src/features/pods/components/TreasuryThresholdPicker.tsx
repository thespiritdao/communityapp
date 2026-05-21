'use client';

import * as React from 'react';
import {
  ThresholdPicker,
  type ThresholdPreset,
} from './ThresholdPicker';

const PRESETS: ThresholdPreset[] = [
  {
    key: 'simple',
    label: 'Simple',
    bps: 5001,
    description: '50%+1 — fastest to pass',
  },
  {
    key: 'strict',
    label: 'Strict',
    bps: 6667,
    description: '66% supermajority',
  },
  {
    key: 'unanimous',
    label: 'Unanimous',
    bps: 10000,
    description: '100% — every leader must approve',
  },
];

interface Props {
  value: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
}

/**
 * Treasury-flavoured wrapper around the generic ThresholdPicker. Preserves
 * the API used by the V3 treasury deploy flow (PR 2) so call sites do not
 * need to change.
 */
export function TreasuryThresholdPicker({
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <ThresholdPicker
      label="Approval threshold"
      helperText="How much of the leader group must approve a treasury action before it executes. Can be changed later by a vote at or above the current threshold."
      value={value}
      onChange={onChange}
      presets={PRESETS}
      min={5001}
      max={10000}
      step={100}
      disabled={disabled}
      customChipDescription="Pick any value 51–100%"
    />
  );
}

export default TreasuryThresholdPicker;
