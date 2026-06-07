import PQueue from 'p-queue';
import { STREAM_PACK_ASSETS } from '@cbs/shared';
import type { GenerateRequest } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { debitCoins } from './coinService.js';
import { runGeneration, waitForJob } from './dnaExtractor.js';

export interface StreamPackProgress {
  projectId: string;
  userId: string;
  total: number;
  completed: number;
  current?: string;
  jobs: { assetType: string; jobId: string; status: string }[];
  done: boolean;
  error?: string;
}

const packProgress = new Map<string, StreamPackProgress>();

export async function startStreamPack(
  projectId: string,
  userId?: string,
  ip?: string,
  platform?: string,
): Promise<{ packId: string }> {
  const db = await getDb();
  const user = userId ? await db.getUserById(userId) : null;
  await debitCoins(userId!, 'stream_set', 'Stream-Set Generator', 1, true, user || undefined);

  const packId = crypto.randomUUID();
  const assets = [...STREAM_PACK_ASSETS];
  // Stream pack needs 5 stickers - add 4 more sticker jobs
  const stickerSlots = 4;
  for (let i = 1; i <= stickerSlots; i++) {
    assets.push('sticker');
  }

  packProgress.set(packId, {
    projectId,
    userId: userId!,
    total: assets.length,
    completed: 0,
    jobs: [],
    done: false,
  });

  runStreamPack(packId, projectId, assets, userId, ip, platform).catch(err => {
    const p = packProgress.get(packId);
    if (p) { p.done = true; p.error = err.message; }
  });

  return { packId };
}

async function runStreamPack(
  packId: string,
  projectId: string,
  assets: string[],
  userId?: string,
  ip?: string,
  platform?: string,
): Promise<void> {
  const queue = new PQueue({ concurrency: 2 });
  const progress = packProgress.get(packId)!;
  let stickerCount = 0;

  const tasks = assets.map(assetType => queue.add(async () => {
    progress.current = assetType;
    const body: GenerateRequest = { platform, skipCoinCharge: true };
    if (assetType === 'sticker') {
      body.stickerIndex = stickerCount;
      body.customText = ['GG', 'EZ WIN', 'LOL', "LET'S GO", 'TEAM'][stickerCount] || 'GG';
      stickerCount++;
    }
    const { jobId } = await runGeneration(projectId, assetType as import('@cbs/shared').AssetType, body, userId, ip);
    progress.jobs.push({ assetType, jobId, status: 'processing' });
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
  await debitCoins(userId!, 'stickers_pack', 'Sticker Studio (5 Sticker)', 1, true, user || undefined);

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
