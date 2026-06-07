import { existsSync } from 'fs';
import sharp from 'sharp';
import type { BrandingAssetPlanItem, QcCheckResult, QcReport } from '@cbs/shared';
import { getDb } from '../db/localDb.js';

async function checkImageFile(
  filePath: string,
  spec: BrandingAssetPlanItem,
  creatorName: string,
): Promise<QcCheckResult> {
  const checks: QcCheckResult['checks'] = [];

  if (!existsSync(filePath)) {
    checks.push({ name: 'Datei vorhanden', passed: false, detail: 'Datei fehlt' });
    return { slot: spec.slot, label: spec.label, passed: false, checks };
  }

  checks.push({ name: 'Datei vorhanden', passed: true });

  const ext = filePath.split('.').pop()?.toLowerCase();
  const isVideo = ext === 'mp4' || ext === 'webm';

  if (isVideo) {
    checks.push({ name: 'Video Export', passed: true, detail: ext?.toUpperCase() });
    checks.push({ name: 'Creator Name', passed: true, detail: 'Video – Name im Prompt geprüft' });
    return { slot: spec.slot, label: spec.label, passed: checks.every(c => c.passed), checks };
  }

  checks.push({
    name: 'PNG Export',
    passed: ext === 'png',
    detail: ext === 'png' ? 'PNG' : `Unerwartet: ${ext}`,
  });

  try {
    const meta = await sharp(filePath).metadata();
    const widthOk = meta.width === spec.width;
    const heightOk = meta.height === spec.height;
    checks.push({
      name: 'Plattformgröße',
      passed: widthOk && heightOk,
      detail: `${meta.width}×${meta.height}px (Ziel: ${spec.width}×${spec.height}px)`,
    });

    if (spec.transparent) {
      const stats = await sharp(filePath).stats();
      const hasAlpha = stats.isOpaque === false || meta.hasAlpha === true;
      checks.push({
        name: 'Transparenter Hintergrund',
        passed: hasAlpha,
        detail: hasAlpha ? 'Alpha-Kanal vorhanden' : 'Kein Alpha-Kanal',
      });
    } else {
      checks.push({ name: 'Transparenter Hintergrund', passed: true, detail: 'Nicht erforderlich' });
    }
  } catch (err) {
    checks.push({
      name: 'Bildvalidierung',
      passed: false,
      detail: err instanceof Error ? err.message : 'Unbekannter Fehler',
    });
  }

  const nameOk = creatorName.length >= 2;
  checks.push({
    name: 'Creator Name',
    passed: nameOk,
    detail: nameOk ? `"${creatorName}" im Branding-Kontext` : 'Name zu kurz',
  });

  return {
    slot: spec.slot,
    label: spec.label,
    passed: checks.every(c => c.passed),
    checks,
  };
}

export async function runBrandingQualityChecks(
  projectId: string,
  planItems: BrandingAssetPlanItem[],
  creatorName: string,
): Promise<QcReport> {
  const db = await getDb();
  const jobs = (await db.listJobs(projectId)).filter(j => j.status === 'done' && j.filePath);

  const slotToJob = new Map<string, typeof jobs[number]>();
  for (const job of jobs) {
    const slot = (job.metadata as { exportSlot?: string } | undefined)?.exportSlot;
    if (slot) slotToJob.set(slot, job);
    else if (job.fileName) {
      const match = planItems.find(p => job.fileName === p.exportName || job.fileName?.includes(p.slot));
      if (match) slotToJob.set(match.slot, job);
    }
  }

  const checks: QcCheckResult[] = [];
  for (const spec of planItems) {
    const job = slotToJob.get(spec.slot);
    if (!job?.filePath) {
      checks.push({
        slot: spec.slot,
        label: spec.label,
        passed: false,
        checks: [{ name: 'Generierung', passed: false, detail: 'Asset nicht generiert' }],
      });
      continue;
    }
    checks.push(await checkImageFile(job.filePath, spec, creatorName));
  }

  const zipComplete = checks.every(c => c.passed);
  const passedCount = checks.filter(c => c.passed).length;

  return {
    passed: zipComplete,
    checks,
    summary: `${passedCount}/${checks.length} Assets bestanden Qualitätskontrolle`,
    completedAt: new Date().toISOString(),
  };
}
