import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import {
  buildBrandingAssetPlan,
  sanitizeBrandingZipName,
  type BrandDnaAnalysis,
} from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';

function buildBrandingReportHtml(projectName: string, dna: Awaited<ReturnType<typeof getDb>> extends infer _ ? import('@cbs/shared').BrandDNA | null : never, analysis?: BrandDnaAnalysis): string {
  const fonts = dna?.fonts;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>${projectName} – Branding Report</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; background: #0f0f1a; color: #eee; padding: 40px; }
    h1 { color: #ff2d95; }
    h2 { color: #00f5ff; margin-top: 2rem; }
    .swatch { display: inline-block; width: 48px; height: 48px; border-radius: 8px; margin: 4px; border: 1px solid #fff3; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    td, th { border: 1px solid #ffffff22; padding: 8px; text-align: left; }
    th { background: #ffffff11; }
  </style>
</head>
<body>
  <h1>${projectName} – Branding Report</h1>
  <p>Erstellt: ${new Date().toLocaleString('de-DE')}</p>

  <h2>Brand DNA</h2>
  <p>${dna?.brandDnaSummary || analysis?.brandDnaSummary || dna?.brandingStyle || '—'}</p>
  <p><strong>Zielgruppe:</strong> ${dna?.targetAudience || analysis?.targetAudience || '—'}</p>

  <h2>Farben</h2>
  <p>Primary</p>
  ${(dna?.primaryColors || analysis?.colorPalette.primary || []).map(c => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('')}
  <p>Accent</p>
  ${(dna?.accentColors || analysis?.colorPalette.accent || []).map(c => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('')}

  <h2>Schriftarten</h2>
  <ul>
    <li>Heading: ${fonts?.heading || '—'}</li>
    <li>Body: ${fonts?.body || '—'}</li>
    <li>Accent: ${fonts?.accent || '—'}</li>
  </ul>

  <h2>Stil</h2>
  <ul>
    <li>Effekt: ${dna?.effectStyle || analysis?.effectStyle || '—'}</li>
    <li>Licht: ${dna?.lightBehavior || analysis?.lightStyle || '—'}</li>
    <li>3D: ${dna?.threeDStyle || analysis?.threeDStyle || '—'}</li>
    <li>Animation: ${dna?.animationStyle || analysis?.animationStyle || '—'}</li>
  </ul>

  <h2>Plattformgrößen</h2>
  <table>
    <tr><th>Asset</th><th>Größe</th><th>Datei</th></tr>
    ${buildBrandingAssetPlan(dna?.platformPreferences?.[0] || 'tiktok').map(a =>
      `<tr><td>${a.label}</td><td>${a.width}×${a.height}px</td><td>${a.exportName}</td></tr>`,
    ).join('')}
  </table>

  <p style="margin-top:2rem;color:#888;">Creator Branding Studio – automatischer Branding Report (Drucken → Als PDF speichern)</p>
</body>
</html>`;
}

export async function createBrandingPackZip(projectId: string, res: import('express').Response): Promise<void> {
  const db = await getDb();
  const project = await db.getProject(projectId);
  const dna = await db.getDNA(projectId);
  const platform = dna?.platformPreferences?.[0] || 'tiktok';
  const plan = buildBrandingAssetPlan(platform);
  const jobs = (await db.listJobs(projectId)).filter(j => j.status === 'done' && j.filePath && existsSync(j.filePath));

  const zipBase = sanitizeBrandingZipName(project?.name || 'Creator');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipBase}_Branding_Pack.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  const slotToFolder = new Map(plan.map(p => [p.slot, p.zipFolder]));
  const fileToFolder = new Map(plan.map(p => [p.exportName, p.zipFolder]));

  for (const job of jobs) {
    if (!job.filePath || !job.fileName) continue;
    const meta = job.metadata as { exportSlot?: string } | undefined;
    const folder = (meta?.exportSlot && slotToFolder.get(meta.exportSlot))
      || fileToFolder.get(job.fileName)
      || 'Overlay';
    archive.file(job.filePath, { name: `${folder}/${job.fileName}` });
  }

  const reportHtml = buildBrandingReportHtml(project?.name || 'Creator', dna);
  archive.append(reportHtml, { name: 'branding-report.html' });
  archive.append(JSON.stringify({
    project: project?.name,
    platform,
    dna: {
      summary: dna?.brandDnaSummary,
      colors: { primary: dna?.primaryColors, accent: dna?.accentColors },
      fonts: dna?.fonts,
      styles: {
        effect: dna?.effectStyle,
        light: dna?.lightBehavior,
        threeD: dna?.threeDStyle,
        animation: dna?.animationStyle,
      },
    },
    assets: plan.map(a => ({ label: a.label, size: `${a.width}x${a.height}`, file: a.exportName, folder: a.zipFolder })),
    generatedAt: new Date().toISOString(),
  }, null, 2), { name: 'branding-report.json' });

  await archive.finalize();
}

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
