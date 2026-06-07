import sharp from 'sharp';

const WHITE_THRESHOLD = 240;
const BLACK_THRESHOLD = 15;

export async function enforceTransparency(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
}

export async function processAsset(buffer: Buffer): Promise<Buffer> {
  const withAlpha = await sharp(buffer).ensureAlpha().png().toBuffer();
  return enforceTransparency(withAlpha);
}
