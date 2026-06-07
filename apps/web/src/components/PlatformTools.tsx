import { STREAM_PLATFORMS, STREAM_PLATFORM_LABELS, type StreamingPlatform } from '@cbs/shared';
import { getPlatformFormat, formatDimensionsLabel } from '@cbs/shared';
import type { AssetType } from '@cbs/shared';

interface StreamingPlatformPickerProps {
  value: string;
  onChange: (v: StreamingPlatform) => void;
  platforms?: StreamingPlatform[];
}

export function StreamingPlatformPicker({
  value,
  onChange,
  platforms = STREAM_PLATFORMS,
}: StreamingPlatformPickerProps) {
  return (
    <div>
      <p className="mb-2 text-sm text-white/60">Streaming-Plattform</p>
      <div className="flex flex-wrap gap-2">
        {platforms.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
              value === p
                ? 'border-neon-cyan bg-neon-cyan/20 text-neon-cyan glow-cyan'
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'
            }`}
          >
            {STREAM_PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FormatDimensionsBadge({ platform, assetType }: { platform: string; assetType: AssetType | string }) {
  if (!platform) return null;
  const format = getPlatformFormat(platform, assetType);
  if (!format) return <p className="text-xs text-white/40">Standardgröße wird angewendet</p>;
  return (
    <div className="rounded-lg border border-neon-purple/30 bg-neon-purple/10 px-3 py-2 text-xs text-neon-purple">
      Smart Format: {formatDimensionsLabel(format)}
    </div>
  );
}

export function MagicPromptInfo() {
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-white/40">
      Magic Prompt Engine aktiv – professionelle KI-Prompts werden automatisch aus deiner DNA erstellt.
    </div>
  );
}

export function TransparencyBadge({ highlight }: { highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-xs ${highlight ? 'border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan' : 'bg-white/5 text-white/40'}`}>
      {highlight
        ? 'Transparenz-System: Facecam-Rahmen mit transparentem Zentrum & Alpha-PNG'
        : 'Transparenz-System: PNG mit Alpha, keine weißen/schwarzen Hintergründe'}
    </div>
  );
}

export function CoinCostBadge(_props: { assetType: string; count?: number }) {
  return null;
}
