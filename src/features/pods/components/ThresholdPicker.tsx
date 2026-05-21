'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export interface ThresholdPreset {
  key: string;
  label: string;
  bps: number;
  description: string;
}

export interface ThresholdPickerProps {
  /** Section label rendered above the chips (e.g. "Approval threshold"). */
  label: string;
  /** Optional explainer text rendered just under the label. */
  helperText?: string;
  /** Current value in basis points (0–10000). */
  value: number;
  /** Called with the new basis-points value when the user picks a preset or drags the slider. */
  onChange: (bps: number) => void;
  /** Ordered list of preset chips. */
  presets: ThresholdPreset[];
  /** Inclusive min for the Custom slider (in bps). */
  min: number;
  /** Inclusive max for the Custom slider (in bps). */
  max: number;
  /** Slider step in bps. Defaults to 100 (1%). */
  step?: number;
  /** Disable all controls. */
  disabled?: boolean;
  /** Optional label rendered on the Custom chip's second line, e.g. "Pick any value 51–100%". */
  customChipDescription?: string;
}

function formatPercent(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
}

/**
 * Generic basis-points threshold picker: preset chips + collapsible custom
 * slider. Used by both treasury and governance configuration UIs.
 */
export function ThresholdPicker({
  label,
  helperText,
  value,
  onChange,
  presets,
  min,
  max,
  step = 100,
  disabled,
  customChipDescription,
}: ThresholdPickerProps) {
  const isPreset = React.useCallback(
    (bps: number) => presets.some((p) => p.bps === bps),
    [presets],
  );
  const [customOpen, setCustomOpen] = React.useState(() => !isPreset(value));

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      {helperText && (
        <p className="text-xs text-gray-600 -mt-1">{helperText}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
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
                {/* Skip the redundant percent suffix when the label is
                    already itself a percent (e.g. "70%"). Named presets
                    like "Strict" still get the suffix appended. */}
                {/%\s*$/.test(preset.label)
                  ? preset.label
                  : `${preset.label} · ${formatPercent(preset.bps)}%`}
              </span>
              <span
                className={`text-xs ${
                  selected ? 'text-primary-foreground/80' : 'text-gray-500'
                }`}
              >
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
          <span
            className={`text-xs ${
              customOpen ? 'text-primary-foreground/80' : 'text-gray-500'
            }`}
          >
            {customChipDescription ??
              `Pick any value ${formatPercent(min)}–${formatPercent(max)}%`}
          </span>
        </Button>
      </div>

      {customOpen && (
        <div className="space-y-2 p-3 border rounded-md bg-[#F5F4ED]">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Custom value</Label>
            <span className="text-sm font-semibold text-[#1F453A]">
              {formatPercent(value)}%
            </span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[#2F5D50]"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatPercent(min)}%</span>
            <span>{formatPercent(max)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThresholdPicker;
