import sharp from 'sharp';
import type { AssetType, Platform } from '@cbs/shared';
import { PLATFORM_FORMATS, getStreamSetAssetSpec, getBrandingAssetSpec } from '@cbs/shared';

const DEFAULT_SIZES: Partial<Record<AssetType, { width: number; height: number }>> = {
  logo: { width: 1024, height: 1024 },
  banner: { width: 1920, height: 480 },
  facecam: { width: 640, height: 360 },
  overlay: { width: 1920, height: 1080 },
  panel: { width: 320, height: 100 },
  wallpaper: { width: 1920, height: 1080 },
  thumbnail: { width: 1280, height: 720 },
  sticker: { width: 512, height: 512 },
  alert: { width: 800, height: 400 },
  offline: { width: 1920, height: 1080 },
  starting_soon: { width: 1920, height: 1080 },
  brb: { width: 1920, height: 1080 },
  ending: { width: 1920, height: 1080 },
  social: { width: 1080, height: 1080 },
  merchandise: { width: 1024, height: 1024 },
};

export function getTargetSize(
  assetType: AssetType,
  platform?: string,
  exportSlot?: string,
  override?: { width: number; height: number },
): { width: number; height: number } {
  if (override) return override;

  if (platform && exportSlot) {
    const spec = getStreamSetAssetSpec(platform, exportSlot) || getBrandingAssetSpec(platform, exportSlot);
    if (spec) return { width: spec.width, height: spec.height };
  }

  if (platform && platform in PLATFORM_FORMATS) {
    const formats = PLATFORM_FORMATS[platform as Platform];
    const key = assetType === 'banner' ? 'banner'
      : assetType === 'offline' ? 'offline'
      : assetType === 'panel' ? 'panel'
      : assetType === 'facecam' ? 'facecam'
      : assetType === 'overlay' ? 'overlay'
      : assetType === 'thumbnail' ? 'thumbnail'
      : assetType === 'logo' ? 'icon'
      : null;
    if (key && formats[key]) return formats[key];
  }

  return DEFAULT_SIZES[assetType] || { width: 1024, height: 1024 };
}

export async function applySmartFormat(
  buffer: Buffer,
  assetType: AssetType,
  platform?: string,
  exportSlot?: string,
  override?: { width: number; height: number },
): Promise<Buffer> {
  const { width, height } = getTargetSize(assetType, platform, exportSlot, override);
  return sharp(buffer)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}
