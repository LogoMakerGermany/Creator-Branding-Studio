/** Output format presets for Video Studio clips & shorts. */

export type VideoFormatId =
  | 'youtube'
  | 'tiktok'
  | 'shorts'
  | 'trailer'
  | 'ad'
  | 'instagram'
  | 'custom';

export interface VideoFormatPreset {
  id: VideoFormatId;
  label: string;
  description: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  width: number;
  height: number;
  /** Suggested max clip length in seconds */
  maxDurationSec: number;
  vertical: boolean;
}

export const VIDEO_FORMAT_PRESETS: Record<VideoFormatId, VideoFormatPreset> = {
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    description: 'Landscape 16:9 — Videos & Trailer',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    maxDurationSec: 120,
    vertical: false,
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Vertical 9:16 — Shorts & Clips',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    maxDurationSec: 60,
    vertical: true,
  },
  shorts: {
    id: 'shorts',
    label: 'YouTube Shorts',
    description: 'Vertical 9:16 — Shorts',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    maxDurationSec: 60,
    vertical: true,
  },
  trailer: {
    id: 'trailer',
    label: 'Trailer',
    description: 'Cinematic 16:9 — Promo / Trailer',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    maxDurationSec: 90,
    vertical: false,
  },
  ad: {
    id: 'ad',
    label: 'Werbevideo',
    description: 'Square 1:1 — Ads & Feed',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    maxDurationSec: 30,
    vertical: false,
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram Reels',
    description: 'Vertical 9:16 — Reels',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    maxDurationSec: 90,
    vertical: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    description: 'Original aspect — no forced crop',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    maxDurationSec: 300,
    vertical: false,
  },
};

export const VIDEO_FORMAT_LIST = Object.values(VIDEO_FORMAT_PRESETS);

export function getVideoFormatPreset(id: string | undefined): VideoFormatPreset {
  if (id && id in VIDEO_FORMAT_PRESETS) {
    return VIDEO_FORMAT_PRESETS[id as VideoFormatId];
  }
  return VIDEO_FORMAT_PRESETS.shorts;
}

export function ffmpegScaleFilter(preset: VideoFormatPreset): string | undefined {
  if (preset.id === 'custom') return undefined;
  const { width, height } = preset;
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}
