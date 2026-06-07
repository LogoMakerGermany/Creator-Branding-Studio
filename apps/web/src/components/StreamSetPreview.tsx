import type { StreamSetPlatform } from '@cbs/shared';
import { STREAM_SET_PLATFORMS, STREAM_SET_PLATFORM_LABELS } from '@cbs/shared';
import { GlassCard } from './GlassCard';

export interface StreamSetPreviewData {
  platform: string;
  label: string;
  totalCoins: number;
  assets: {
    slot: string;
    label: string;
    assetType: string;
    exportName: string;
    dimensions: string;
    transparent: boolean;
    coinCost: number;
  }[];
}

interface StreamSetPreviewProps {
  preview: StreamSetPreviewData;
}

export function StreamSetPreviewPanel({ preview }: StreamSetPreviewProps) {
  return (
    <GlassCard glow="purple" className="mt-6">
      <h3 className="font-display text-lg font-semibold text-white">Live-Vorschau · {preview.label}</h3>
      <p className="mt-1 text-sm text-white/50">{preview.assets.length} Assets · {preview.totalCoins} Coins gesamt</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {preview.assets.map(asset => (
          <div
            key={asset.slot}
            className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-white">{asset.label}</span>
              <span className="shrink-0 text-neon-pink">{asset.coinCost}c</span>
            </div>
            <p className="mt-1 text-xs text-white/40">{asset.dimensions}</p>
            <p className="mt-1 truncate text-xs text-neon-cyan">{asset.exportName}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-white/30">
              {asset.transparent ? 'Transparent' : 'Mit Hintergrund'}
            </p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

interface PlatformButtonPickerProps {
  value: StreamSetPlatform;
  onChange: (v: StreamSetPlatform) => void;
  platforms?: StreamSetPlatform[];
}

const PLATFORM_ICONS: Record<StreamSetPlatform, string> = {
  tiktok: '♪',
  twitch: '◉',
  youtube: '▶',
  kick: 'K',
  discord: '💬',
};

export function PlatformButtonPicker({
  value,
  onChange,
  platforms = STREAM_SET_PLATFORMS,
}: PlatformButtonPickerProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-white/60">Plattform wählen</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {platforms.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-4 text-sm font-medium transition-all ${
              value === p
                ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan glow-cyan scale-[1.02]'
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:bg-white/10'
            }`}
          >
            <span className="text-2xl">{PLATFORM_ICONS[p]}</span>
            {STREAM_SET_PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OptionGrid({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-white/60">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-xl border px-3 py-2 text-sm transition-all ${
              value === opt
                ? 'border-neon-pink bg-neon-pink/15 text-neon-pink'
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
