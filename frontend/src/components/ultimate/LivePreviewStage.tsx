import type { ReactNode } from 'react';
import type { UltimatePlatformId } from '@ucbs/shared';

export type LivePreviewAsset = {
  key: string;
  label: string;
  imageUrl?: string;
};

type LivePreviewStageProps = {
  platforms: UltimatePlatformId[];
  logoUrl?: string;
  bannerUrl?: string;
  profileUrl?: string;
  assets?: LivePreviewAsset[];
  activePlatform?: UltimatePlatformId;
  onPlatformChange?: (p: UltimatePlatformId) => void;
};

const PLATFORM_LABELS: Record<UltimatePlatformId, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  discord: 'Discord',
  kick: 'Kick',
};

function MockFrame({
  title,
  children,
  accent = 'purple',
}: {
  title: string;
  children: ReactNode;
  accent?: 'purple' | 'cyan' | 'green';
}) {
  const border =
    accent === 'cyan'
      ? 'border-[var(--ucbs-accent-cyan)]/40'
      : accent === 'green'
        ? 'border-[var(--ucbs-accent-green)]/40'
        : 'border-[var(--ucbs-accent-purple)]/40';
  return (
    <div className={`rounded-xl border ${border} bg-zinc-950/80 p-3`}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

export function LivePreviewStage({
  platforms,
  logoUrl,
  bannerUrl,
  profileUrl,
  assets = [],
  activePlatform: controlledPlatform,
  onPlatformChange,
}: LivePreviewStageProps) {
  const platform = controlledPlatform ?? platforms[0] ?? 'twitch';
  const banner = bannerUrl ?? assets.find((a) => a.key.includes('banner'))?.imageUrl;
  const avatar = profileUrl ?? logoUrl ?? assets.find((a) => a.key === 'profile-pic' || a.key === 'logo')?.imageUrl;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPlatformChange?.(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              platform === p
                ? 'bg-[var(--ucbs-accent-cyan)]/20 text-[var(--ucbs-accent-cyan)]'
                : 'text-zinc-500 hover:bg-white/5'
            }`}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {platform === 'twitch' && (
        <MockFrame title="Twitch Kanal" accent="purple">
          <div className="relative aspect-[5/2] overflow-hidden rounded-lg bg-zinc-900">
            {banner ? (
              <img src={banner} alt="Banner" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">Banner-Vorschau</div>
            )}
            <div className="absolute bottom-2 left-2 flex items-end gap-2">
              <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-[var(--ucbs-accent-purple)] bg-zinc-800">
                {avatar ? <img src={avatar} alt="Avatar" className="h-full w-full object-cover" /> : null}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Stream-Overlay-Layout (simuliert)</p>
        </MockFrame>
      )}

      {platform === 'youtube' && (
        <MockFrame title="YouTube Kanal" accent="cyan">
          <div className="aspect-video overflow-hidden rounded-lg bg-zinc-900">
            {banner ? (
              <img src={banner} alt="YT Banner" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">2560×1440 Safe Area</div>
            )}
          </div>
        </MockFrame>
      )}

      {platform === 'discord' && (
        <MockFrame title="Discord Server" accent="green">
          <div className="aspect-[16/9] overflow-hidden rounded-lg bg-zinc-900">
            {banner ? (
              <img src={banner} alt="Discord" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">Server-Banner</div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-zinc-800">
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <span className="text-xs text-zinc-400">Server-Icon</span>
          </div>
        </MockFrame>
      )}

      {(platform === 'tiktok' || platform === 'kick') && (
        <MockFrame title={PLATFORM_LABELS[platform]} accent="cyan">
          <div className="mx-auto aspect-[9/16] max-w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-[10px] text-zinc-600">
                Profil-Vorschau
              </div>
            )}
          </div>
        </MockFrame>
      )}
    </div>
  );
}
