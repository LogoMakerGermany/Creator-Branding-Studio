import sharp from 'sharp';
import type { BrandDNA, AssetType } from '@cbs/shared';
import { getTargetSize } from '../engines/smartFormat.js';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 255,
    g: parseInt(h.slice(2, 4), 16) || 45,
    b: parseInt(h.slice(4, 6), 16) || 149,
  };
}

export async function generateMockAsset(
  dna: BrandDNA,
  assetType: AssetType,
  platform?: string,
  label?: string,
): Promise<Buffer> {
  const { width, height } = getTargetSize(assetType, platform);
  const c1 = hexToRgb(dna.primaryColors[0] || '#FF2D95');
  const c2 = hexToRgb(dna.accentColors[0] || '#00F5FF');
  const text = label || assetType.replace(/_/g, ' ').toUpperCase();

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(${c1.r},${c1.g},${c1.b});stop-opacity:0.9"/>
          <stop offset="100%" style="stop-color:rgb(${c2.r},${c2.g},${c2.b});stop-opacity:0.9"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      ${assetType === 'facecam' ? `
        <rect width="100%" height="100%" fill="none"/>
        <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="24" fill="none" stroke="url(#g)" stroke-width="6" filter="url(#glow)"/>
        <rect x="${width * 0.15}" y="${height * 0.15}" width="${width * 0.7}" height="${height * 0.7}" rx="16" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-dasharray="8 4"/>
      ` : `
        <rect width="100%" height="100%" fill="none"/>
        <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="20" fill="url(#g)" opacity="0.85" filter="url(#glow)"/>
      `}
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="${Math.max(14, Math.min(width, height) / 12)}" font-weight="bold">${text}</text>
      <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="Arial,sans-serif" font-size="12">TESTMODUS · TRANSPARENT</text>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
