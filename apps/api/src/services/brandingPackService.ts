import PQueue from 'p-queue';
import {
  buildBrandingAssetPlan,
  calculateBrandingPlanCost,
  selectBrandingPlanForGeneration,
  type BrandingAssetPlanItem,
  type QcReport,
  type WizardPayload,
} from '@cbs/shared';
import type { AssetType, GenerateRequest } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { debitAmount } from './coinService.js';
import { runGeneration, waitForJob } from './dnaExtractor.js';
import { runBrandingQualityChecks } from './brandingQcService.js';
import { buildBrandingPreview } from '@cbs/shared';

export type BrandingPhase =
  | 'dna'
  | 'planning'
  | 'preview'
  | 'generating'
  | 'qc'
  | 'ready'
  | 'failed';

export interface BrandingPackProgress {
  packId: string;
  projectId: string;
  userId: string;
  platform: string;
  phase: BrandingPhase;
  total: number;
  completed: number;
  current?: string;
  enabledSlots: string[];
  jobs: { assetType: string; slot: string; jobId: string; status: string }[];
  qc?: QcReport;
  done: boolean;
  error?: string;
}

const packProgress = new Map<string, BrandingPackProgress>();

const STICKER_TEXTS = ['GG', 'EZ WIN', 'LOL', "LET'S GO", 'TEAM'];

export function getBrandingPackProgress(packId: string, projectId: string): BrandingPackProgress | null {
  const progress = packProgress.get(packId);
  if (!progress || progress.projectId !== projectId) return null;
  return progress;
}

export function getBrandingAnalyzePreview(wizard: WizardPayload, enabledSlots?: string[]) {
  return buildBrandingPreview(wizard, enabledSlots);
}

export async function startBrandingPack(
  projectId: string,
  userId: string,
  ip: string | undefined,
  platform: string,
  enabledSlots?: string[],
): Promise<{ packId: string; totalCoins: number }> {
  const db = await getDb();
  const user = await db.getUserById(userId);
  const plan = selectBrandingPlanForGeneration(platform, enabledSlots);
  const totalCost = calculateBrandingPlanCost(plan);

  await debitAmount(
    userId,
    totalCost,
    `Branding-Paket: ${platform}`,
    { platform, assetCount: plan.length },
    true,
    user || undefined,
  );

  const packId = crypto.randomUUID();
  packProgress.set(packId, {
    packId,
    projectId,
    userId,
    platform,
    phase: 'generating',
    total: plan.length,
    completed: 0,
    enabledSlots: plan.map(p => p.slot),
    jobs: [],
    done: false,
  });

  runBrandingPack(packId, projectId, plan, userId, ip, platform).catch(err => {
    const p = packProgress.get(packId);
    if (p) {
      p.done = true;
      p.phase = 'failed';
      p.error = err instanceof Error ? err.message : 'Generierung fehlgeschlagen';
    }
  });

  return { packId, totalCoins: totalCost };
}

async function runBrandingPack(
  packId: string,
  projectId: string,
  assets: BrandingAssetPlanItem[],
  userId: string,
  ip: string | undefined,
  platform: string,
): Promise<void> {
  const db = await getDb();
  const project = await db.getProject(projectId);
  const dna = await db.getDNA(projectId);
  const creatorName = dna?.extractedFrom?.sourceRef || project?.name || 'Creator';

  const wizardContext = {
    creatorName,
    niche: dna?.niche || dna?.brandingStyle,
    visualStyle: dna?.visualStyle || dna?.brandingStyle,
    clanName: dna?.clanName,
  };

  const progress = packProgress.get(packId)!;
  const queue = new PQueue({ concurrency: 2 });
  let stickerCount = 0;

  await Promise.all(assets.map(spec => queue.add(async () => {
    progress.current = spec.label;
    const body: GenerateRequest = {
      platform,
      exportSlot: spec.slot,
      formatOverride: { width: spec.width, height: spec.height },
      skipCoinCharge: true,
      wizardContext,
    };

    if (spec.assetType === 'sticker') {
      body.stickerIndex = stickerCount;
      body.customText = STICKER_TEXTS[stickerCount] || 'GG';
      stickerCount++;
    } else if (spec.category === 'logo' && spec.slot !== 'logo_main') {
      body.customText = spec.slot === 'logo_minimal' ? creatorName : `${creatorName} ALT`;
    } else if (['starting_soon', 'brb', 'ending'].includes(spec.assetType)) {
      body.customText = spec.label;
    }

    const { jobId } = await runGeneration(projectId, spec.assetType as AssetType, body, userId, ip);
    progress.jobs.push({ assetType: spec.assetType, slot: spec.slot, jobId, status: 'processing' });
    const job = await waitForJob(jobId, 180000);
    const entry = progress.jobs.find(j => j.jobId === jobId);
    if (entry) entry.status = job.status;
    progress.completed++;
  })));

  progress.phase = 'qc';
  progress.current = 'Qualitätskontrolle';

  const qc = await runBrandingQualityChecks(projectId, assets, creatorName);
  progress.qc = qc;
  progress.phase = qc.passed ? 'ready' : 'ready';
  progress.done = true;
  progress.current = undefined;
}

export async function regenerateBrandingAssets(
  projectId: string,
  userId: string,
  ip: string | undefined,
  platform: string,
  options: { slots?: string[]; category?: string },
): Promise<{ packId: string }> {
  const fullPlan = buildBrandingAssetPlan(platform);
  let targets: BrandingAssetPlanItem[];

  if (options.category) {
    targets = fullPlan.filter(a => a.category === options.category || a.zipFolder === options.category);
  } else if (options.slots?.length) {
    const set = new Set(options.slots);
    targets = fullPlan.filter(a => set.has(a.slot));
  } else {
    targets = fullPlan;
  }

  if (!targets.length) throw new Error('Keine Assets zum Regenerieren ausgewählt');

  const { packId } = await startBrandingPack(
    projectId,
    userId,
    ip,
    platform,
    targets.map(t => t.slot),
  );
  return { packId };
}

export function listBrandingCategories(platform: string) {
  const plan = buildBrandingAssetPlan(platform);
  const categories = new Map<string, { label: string; slots: string[]; coins: number }>();

  const labels: Record<string, string> = {
    logo: 'Logo',
    banner: 'Banner',
    extras: 'Sticker / Intro / Outro',
    streaming: 'Streaming',
    social: 'Social Media',
  };

  for (const item of plan) {
    const key = item.category;
    const existing = categories.get(key) || { label: labels[key] || key, slots: [], coins: 0 };
    existing.slots.push(item.slot);
    existing.coins += item.coinCost;
    categories.set(key, existing);
  }

  return Array.from(categories.entries()).map(([id, data]) => ({ id, ...data }));
}
