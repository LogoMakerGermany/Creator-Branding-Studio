import PQueue from 'p-queue';
import {
  getStreamSetConfig,
  calculateStreamSetCost,
  type StreamSetAssetSpec,
} from '@cbs/shared';
import type { AssetType, GenerateRequest } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { debitAmount } from './coinService.js';
import { runGeneration, waitForJob } from './dnaExtractor.js';

export interface StreamPackProgress {
  projectId: string;
  userId: string;
  platform: string;
  total: number;
  completed: number;
  current?: string;
  jobs: { assetType: string; slot: string; jobId: string; status: string }[];
  done: boolean;
  error?: string;
}

const packProgress = new Map<string, StreamPackProgress>();

export function getStreamSetPreview(platform: string) {
  const config = getStreamSetConfig(platform);
  return {
    platform: config.platform,
    label: config.label,
    totalCoins: calculateStreamSetCost(platform),
    assets: config.assets.map(a => ({
      slot: a.slot,
      label: a.label,
      assetType: a.assetType,
      exportName: a.exportName,
      dimensions: `${a.width} × ${a.height}px`,
      width: a.width,
      height: a.height,
      transparent: a.transparent,
      coinCost: a.coinCost,
    })),
  };
}

export async function startStreamPack(
  projectId: string,
  userId?: string,
  ip?: string,
  platform = 'tiktok',
): Promise<{ packId: string }> {
  const db = await getDb();
  const user = userId ? await db.getUserById(userId) : null;
  const config = getStreamSetConfig(platform);
  const totalCost = calculateStreamSetCost(platform);

  await debitAmount(
    userId!,
    totalCost,
    `Stream-Set: ${config.label}`,
    { platform, assetCount: config.assets.length },
    true,
    user || undefined,
  );

  const packId = crypto.randomUUID();

  packProgress.set(packId, {
    projectId,
    userId: userId!,
    platform,
    total: config.assets.length,
    completed: 0,
    jobs: [],
    done: false,
  });

  runStreamPack(packId, projectId, config.assets, userId, ip, platform).catch(err => {
    const p = packProgress.get(packId);
    if (p) { p.done = true; p.error = err.message; }
  });

  return { packId };
}

async function runStreamPack(
  packId: string,
  projectId: string,
  assets: StreamSetAssetSpec[],
  userId?: string,
  ip?: string,
  platform?: string,
): Promise<void> {
  const db = await getDb();
  const dna = await db.getDNA(projectId);
  const wizardContext = dna ? {
    creatorName: dna.extractedFrom?.sourceRef,
    niche: dna.brandingStyle,
    visualStyle: dna.brandingStyle,
  } : undefined;

  const queue = new PQueue({ concurrency: 2 });
  const progress = packProgress.get(packId)!;
  let stickerCount = 0;

  const tasks = assets.map(spec => queue.add(async () => {
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
      body.customText = ['GG', 'EZ WIN', 'LOL', "LET'S GO", 'TEAM'][stickerCount] || 'GG';
      stickerCount++;
    }
    const { jobId } = await runGeneration(
      projectId,
      spec.assetType as AssetType,
      body,
      userId,
      ip,
    );
    progress.jobs.push({ assetType: spec.assetType, slot: spec.slot, jobId, status: 'processing' });
    const job = await waitForJob(jobId, 180000);
    const entry = progress.jobs.find(j => j.jobId === jobId);
    if (entry) entry.status = job.status;
    progress.completed++;
  }));

  await Promise.all(tasks);
  progress.done = true;
  progress.current = undefined;
}

export function getStreamPackProgress(packId: string, projectId: string): StreamPackProgress | null {
  const progress = packProgress.get(packId);
  if (!progress || progress.projectId !== projectId) return null;
  return progress;
}

export async function generateStickers(
  projectId: string,
  stickerTexts: string[],
  userId?: string,
  ip?: string,
  platform?: string,
): Promise<{ jobIds: string[] }> {
  const db = await getDb();
  const user = userId ? await db.getUserById(userId) : null;
  await debitAmount(userId!, 10, 'Sticker Studio (5 Sticker)', { platform }, true, user || undefined);

  const texts = stickerTexts.length >= 5
    ? stickerTexts.slice(0, 5)
    : ['GG', 'EZ WIN', 'LOL', "LET'S GO", 'TEAM XYZ'];

  const jobIds: string[] = [];
  const queue = new PQueue({ concurrency: 3 });

  await Promise.all(texts.map((text, i) => queue.add(async () => {
    const { jobId } = await runGeneration(projectId, 'sticker', {
      customText: text,
      stickerIndex: i,
      stickerTexts: texts,
      platform,
      exportSlot: `sticker_${i + 1}`,
      skipCoinCharge: true,
    }, userId, ip);
    jobIds.push(jobId);
    await waitForJob(jobId, 120000);
  })));

  return { jobIds };
}

export async function listProjectAssets(projectId: string) {
  const db = await getDb();
  const jobs = await db.listJobs(projectId);
  return jobs.filter(j => j.status === 'done' && j.filePath);
}
