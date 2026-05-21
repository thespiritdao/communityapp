'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type Preset = {
  key: 'simple' | 'strict' | 'unanimous';
  label: string;
  bps: number;
  description: string;
};

const PRESETS: Preset[] = [
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

function isPreset(bps: number) {
  return PRESETS.some((p) => p.bps === bps);
}

export function TreasuryThresholdPicker({ value, onChange, disabled }: Props) {
  const [customOpen, setCustomOpen] = React.useState(() => !isPreset(value));

  const percentLabel = (value / 100).toFixed(2);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Approval threshold</Label>
      <p className="text-xs text-gray-600 -mt-1">
        How much of the leader group must approve a treasury action before it
        executes. Can be changed later by a vote at or above the current
        threshold.
      </p>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const selected = !customOpen && value === preset.bps;
          return (
            <Button
              key={preset.key}
              type="button"
              variant={selected ? 'default' : 'outline'}
              size="sm"
              disabled={disabled}
              onClick={() => {
                setCustomOpen(false);
                onChange(preset.bps);
              }}
              className="flex flex-col items-start h-auto py-2 px-3"
            >
              <span className="font-medium">
                {preset.label} · {(preset.bps / 100).toFixed(preset.bps % 100 === 0 ? 0 : 2)}%
              </span>
              <span className={`text-xs ${selected ? 'text-primary-foreground/80' : 'text-gray-500'}`}>
                {preset.description}
              </span>
            </Button>
          );
        })}
        <Button
          type="button"
          variant={customOpen ? 'default' : 'outline'}
          size="sm"
          disabled={disabled}
          onClick={() => setCustomOpen((open) => !open)}
          className="flex flex-col items-start h-auto py-2 px-3"
        >
          <span className="font-medium">Custom</span>
          <span className={`text-xs ${customOpen ? 'text-primary-foreground/80' : 'text-gray-500'}`}>
            Pick any value 51–100%
          </span>
        </Button>
      </div>

      {customOpen && (
        <div className="space-y-2 p-3 border rounded-md bg-[#F5F4ED]">
          <div className="flex items-center justify-between">
            <Label htmlFor="custom-threshold" className="text-sm">
              Custom threshold
            </Label>
            <span className="text-sm font-semibold text-[#1F453A]">
              {percentLabel}%
            </span>
          </div>
          <input
            id="custom-threshold"
            type="range"
            min={5001}
            max={10000}
            step={100}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[#2F5D50]"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>50.01%</span>
            <span>100%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TreasuryThresholdPicker;
