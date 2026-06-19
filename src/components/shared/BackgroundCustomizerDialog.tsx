'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { BACKGROUNDS, type BackgroundId, type Control } from '@/lib/background/schemas';
import { baselineProps } from '@/lib/background/props';
import { useThemeColors } from './useThemeColors';
import { BackgroundRenderer } from './BackgroundRenderer';

interface Props {
  style: BackgroundId;
  open: boolean;
  onClose: () => void;
}

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  return [
    parseInt(f.slice(0, 2), 16) / 255,
    parseInt(f.slice(2, 4), 16) / 255,
    parseInt(f.slice(4, 6), 16) / 255,
  ];
};
const rgb01ToHex = (arr: number[]): string =>
  '#' +
  arr
    .map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'))
    .join('');

/** Value equality used to decide whether an override actually differs from the
 *  theme baseline (colors case-insensitive, numbers within tolerance, arrays
 *  element-wise) — so setting a control back to its theme value clears it. */
const eqValue = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => eqValue(x, b[i]));
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
};

/**
 * In-app customizer for the active animated background. Colors follow the
 * theme by default; any control the user changes here is saved as an override
 * in `preferences-store` (and "Follow theme" clears them).
 */
export function BackgroundCustomizerDialog({ style, open, onClose }: Props) {
  const def = BACKGROUNDS[style];
  const colors = useThemeColors();
  const savedConfig = usePreferencesStore((s) => s.backgroundConfig[style]);
  const setBackgroundConfig = usePreferencesStore((s) => s.setBackgroundConfig);
  const resetBackgroundConfig = usePreferencesStore((s) => s.resetBackgroundConfig);

  // What the controls show with no override = schema defaults + theme tint.
  const baseline = useMemo(() => baselineProps(style, colors), [style, colors]);

  // Draft override set (only keys the user changed). Re-seeded from the saved
  // config each time the dialog opens for this style.
  const [overrides, setOverrides] = useState<Record<string, unknown>>(savedConfig ?? {});
  useEffect(() => {
    if (open) setOverrides(savedConfig ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, style]);

  // The preview reads a DEBOUNCED copy of the draft: dragging a slider must not
  // re-init the WebGL context on every input event (that churn can exhaust the
  // GPU context cap and evict the global background). Controls stay responsive;
  // the preview catches up ~180ms after the drag settles.
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, unknown>>(savedConfig ?? {});
  useEffect(() => {
    const t = setTimeout(() => setPreviewOverrides(overrides), 180);
    return () => clearTimeout(t);
  }, [overrides]);

  if (!def) return null;

  const valueOf = (key: string): unknown => (key in overrides ? overrides[key] : baseline[key]);
  // Setting a control back to its theme value DROPS the override so it resumes
  // following the theme, instead of pinning a redundant literal that silently
  // opts the prop out of future re-tints.
  const setVal = (key: string, v: unknown) =>
    setOverrides((o) => {
      const next = { ...o };
      if (eqValue(v, baseline[key])) delete next[key];
      else next[key] = v;
      return next;
    });
  const clearVal = (key: string) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });

  const dirty = Object.keys(overrides).length > 0;

  const followTheme = () => setOverrides({});
  const save = () => {
    // Replace (not merge) so a "Follow theme" reset actually clears overrides.
    resetBackgroundConfig(style);
    if (Object.keys(overrides).length > 0) setBackgroundConfig(style, overrides);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize {def.title}</DialogTitle>
          <DialogDescription>
            Colors follow your theme automatically — change any control to override it.
          </DialogDescription>
        </DialogHeader>

        {/* Live preview */}
        <div className="relative h-44 w-full overflow-hidden rounded-lg border border-border bg-black">
          <BackgroundRenderer style={style} config={previewOverrides} interactive fixed={false} />
        </div>

        {/* Controls */}
        <div className="max-h-[42dvh] space-y-3 overflow-y-auto pr-1">
          {def.controls.map((c) => (
            <ControlRow
              key={c.key}
              control={c}
              value={valueOf(c.key)}
              overridden={c.key in overrides}
              onChange={(v) => setVal(c.key, v)}
              onReset={() => clearVal(c.key)}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={followTheme} disabled={!dirty}>
            Follow theme
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ControlRow({
  control,
  value,
  overridden,
  onChange,
  onReset,
}: {
  control: Control;
  value: unknown;
  overridden: boolean;
  onChange: (v: unknown) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{control.label}</span>
        <div className="flex items-center gap-2">
          {control.type === 'range' && (
            <span className="font-mono text-xs text-muted-foreground">{String(value)}</span>
          )}
          {overridden && (
            <button
              type="button"
              onClick={onReset}
              className="text-[10px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              title="Reset this control to follow the theme"
            >
              ↺ theme
            </button>
          )}
        </div>
      </div>
      <ControlInput control={control} value={value} onChange={onChange} />
    </div>
  );
}

function ControlInput({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (control.type) {
    case 'range':
      return (
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={Number(value)}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer touch-manipulation accent-primary"
        />
      );

    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-28 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
          />
        </div>
      );

    case 'vec3color': {
      const arr = (Array.isArray(value) ? value : control.default) as number[];
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={rgb01ToHex(arr)}
            onChange={(e) => onChange(hexToRgb01(e.target.value))}
            className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
          <span className="font-mono text-xs text-muted-foreground">
            [{arr.map((n) => n.toFixed(2)).join(', ')}]
          </span>
        </div>
      );
    }

    case 'toggle':
      return (
        <Switch
          checked={!!value}
          onCheckedChange={(v) => onChange(!!v)}
          className="touch-manipulation"
        />
      );

    case 'select':
      return (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {control.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case 'multiSelect': {
      const arr = (Array.isArray(value) ? value : control.default) as string[];
      return (
        <div className="flex flex-wrap gap-1.5">
          {control.options.map((o) => {
            const on = arr.includes(o);
            return (
              <Button
                key={o}
                type="button"
                size="xs"
                variant={on ? 'default' : 'outline'}
                onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
              >
                {o}
              </Button>
            );
          })}
        </div>
      );
    }

    case 'colorArray': {
      const arr = (Array.isArray(value) ? value : control.default) as string[];
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {arr.map((col, i) => (
            <span key={i} className="flex items-center">
              <input
                type="color"
                value={col}
                onChange={(e) => onChange(arr.map((v, j) => (j === i ? e.target.value : v)))}
                className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
              />
              <button
                type="button"
                onClick={() => onChange(arr.filter((_, j) => j !== i))}
                aria-label="Remove color"
                className="px-1 text-muted-foreground hover:text-destructive"
              >
                −
              </button>
            </span>
          ))}
          {(!control.max || arr.length < control.max) && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onChange([...arr, '#ffffff'])}
            >
              + color
            </Button>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
