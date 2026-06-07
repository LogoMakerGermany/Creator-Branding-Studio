import multer from 'multer';
import { mkdirSync } from 'fs';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config.js';

mkdirSync(env.uploadsDir, { recursive: true });

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Nur PNG, JPEG, WebP und SVG erlaubt'));
  },
});

export async function validateUploadBuffer(buffer: Buffer): Promise<boolean> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type) return buffer.toString('utf8', 0, 100).includes('<svg');
  return ['image/png', 'image/jpeg', 'image/webp'].includes(type.mime);
}
