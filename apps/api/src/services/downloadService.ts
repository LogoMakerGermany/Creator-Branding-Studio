import { createWriteStream, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';

export async function createZipDownload(projectId: string, res: import('express').Response): Promise<void> {
  const db = await getDb();
  const jobs = (await db.listJobs(projectId)).filter(j => j.status === 'done' && j.filePath && existsSync(j.filePath));

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${projectId}-assets.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  for (const job of jobs) {
    if (job.filePath && job.fileName) {
      archive.file(job.filePath, { name: job.fileName });
    }
  }

  await archive.finalize();
}

export async function createStickerZip(projectId: string, res: import('express').Response): Promise<void> {
  const db = await getDb();
  const jobs = (await db.listJobs(projectId)).filter(
    j => j.status === 'done' && j.assetType === 'sticker' && j.filePath && existsSync(j.filePath),
  );

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${projectId}-stickers.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  for (const job of jobs) {
    if (job.filePath && job.fileName) {
      archive.file(job.filePath, { name: job.fileName });
    }
  }

  await archive.finalize();
}

export async function createObsExport(projectId: string, res: import('express').Response): Promise<void> {
  const db = await getDb();
  const jobs = (await db.listJobs(projectId)).filter(j => j.status === 'done' && j.filePath);

  const scene = {
    name: `CBS_${projectId}`,
    sources: jobs.map(j => ({
      name: j.fileName,
      type: j.fileName?.endsWith('.mp4') ? 'ffmpeg_source' : 'image_source',
      file: j.fileName,
    })),
    note: 'OBS Export Stub – Quellen manuell verknüpfen oder später automatisch importieren.',
  };

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${projectId}-obs-export.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  archive.append(JSON.stringify(scene, null, 2), { name: 'scene.json' });
  archive.append('# Creator Branding Studio OBS Export\n\nAssets im Ordner assets/ ablegen und in OBS importieren.\n', { name: 'README.txt' });

  for (const job of jobs) {
    if (job.filePath && job.fileName && existsSync(job.filePath)) {
      archive.file(job.filePath, { name: `assets/${job.fileName}` });
    }
  }

  await archive.finalize();
}

export function getAssetFile(projectId: string, fileName: string): Buffer | null {
  const path = join(env.assetsDir, projectId, fileName);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}
