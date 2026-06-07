import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { BrandDNA, GenerateRequest } from '@cbs/shared';
import { createDefaultDNA } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';
import { extractDNAFromVision } from '../providers/openai.js';
import { buildMagicPrompt } from '../engines/magicPrompt.js';
import { buildVideoPrompt } from '../engines/videoPrompt.js';
import { applySmartFormat } from '../engines/smartFormat.js';
import { processAsset } from '../engines/transparency.js';
import { generateImage, generateVideo, isVideoAsset, getAvailableVideoProvider } from '../providers/registry.js';
import { generateMockAsset } from '../providers/mockGenerator.js';
import { debitCoins, refundCoins, shouldUseMockGeneration } from './coinService.js';
import { checkCopyright } from '../guards/copyrightGuard.js';
import { checkFraud, audit } from '../guards/fraudShield.js';
import { sanitizeInput } from '../middleware/security.js';
import type { AssetType } from '@cbs/shared';

export async function extractAndSaveDNA(
  projectId: string,
  options: { name?: string; imageBuffer?: Buffer; mimeType?: string },
): Promise<BrandDNA> {
  const db = await getDb();
  let partial: Partial<BrandDNA> = {};

  if (options.imageBuffer && options.mimeType) {
    const base64 = options.imageBuffer.toString('base64');
    partial = await extractDNAFromVision(base64, options.mimeType, options.name);

    const { dominant } = await sharp(options.imageBuffer).stats();
    if (dominant?.r !== undefined) {
      const hex = `#${[dominant.r, dominant.g, dominant.b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
      if (!partial.primaryColors?.length) partial.primaryColors = [hex];
    }
  } else if (options.name) {
    const copyright = await checkCopyright(options.name);
    if (copyright.blocked) throw new Error(copyright.reason);
  }

  const base = createDefaultDNA(projectId, options.name);
  const now = new Date().toISOString();
  const dna: BrandDNA = {
    ...base,
    ...partial,
    primaryColors: partial.primaryColors?.length ? partial.primaryColors : base.primaryColors,
    secondaryColors: partial.secondaryColors?.length ? partial.secondaryColors : base.secondaryColors,
    accentColors: partial.accentColors?.length ? partial.accentColors : base.accentColors,
    fonts: { ...base.fonts, ...partial.fonts },
    projectId,
    updatedAt: now,
    extractedFrom: options.imageBuffer
      ? { type: 'logo', sourceRef: options.name }
      : options.name
        ? { type: 'name', sourceRef: options.name }
        : base.extractedFrom,
  };

  return db.saveDNA(dna);
}

export async function runGeneration(
  projectId: string,
  assetType: AssetType,
  body: GenerateRequest,
  userId?: string,
  ip?: string,
): Promise<{ jobId: string }> {
  const db = await getDb();
  const dna = await db.getDNA(projectId);
  if (!dna) throw new Error('Kein DNA-Profil gefunden. Bitte zuerst Onboarding abschließen.');

  const customText = body.customText ? sanitizeInput(body.customText) : undefined;
  const prompt = buildMagicPrompt({
    dna,
    assetType,
    platform: body.platform,
    customText,
    stickerIndex: body.stickerIndex,
  });

  const fraud = await checkFraud(ip || 'unknown', userId, prompt);
  if (fraud.action === 'block') throw new Error(fraud.reason || 'Anfrage blockiert');
  if (fraud.action === 'throttle') throw new Error(fraud.reason || 'Bitte warten');

  if (customText) {
    const copyright = await checkCopyright(customText, userId, projectId);
    if (copyright.blocked) throw new Error(copyright.reason);
  }

  let coinCost = 0;
  if (userId && !body.skipCoinCharge) {
    const dbUser = await db.getUserById(userId);
    const debit = await debitCoins(userId, assetType, `Generierung: ${assetType}`, 1, true, dbUser || undefined);
    coinCost = debit.cost;
  }

  const now = new Date().toISOString();
  const job = await db.createJob({
    id: crypto.randomUUID(),
    projectId,
    assetType,
    status: 'queued',
    metadata: { coinCost },
    createdAt: now,
    updatedAt: now,
  });

  processJob(job.id, projectId, assetType, dna, body, prompt, userId, ip, coinCost).catch(console.error);
  return { jobId: job.id };
}

async function processJob(
  jobId: string,
  projectId: string,
  assetType: AssetType,
  dna: BrandDNA,
  body: GenerateRequest,
  prompt: string,
  userId?: string,
  ip?: string,
  coinCost = 0,
): Promise<void> {
  const db = await getDb();
  await db.updateJob(jobId, { status: 'processing' });

  const user = userId ? await db.getUserById(userId) : null;
  const useMock = shouldUseMockGeneration(user || undefined);

  try {
    const projectDir = join(env.assetsDir, projectId);
    mkdirSync(projectDir, { recursive: true });

    let buffer: Buffer;
    let provider: string;
    let fileName: string;
    const ext = isVideoAsset(assetType) ? 'mp4' : 'png';

    if (isVideoAsset(assetType) && !useMock) {
      const duration = body.duration || 5;
      const videoProvider = getAvailableVideoProvider();
      const videoPrompt = buildVideoPrompt({
        dna,
        assetType,
        duration,
        provider: videoProvider === 'runway' ? 'runway' : videoProvider === 'replicate' ? 'kling' : 'openai',
        customText: body.customText,
      });
      const result = await generateVideo(videoPrompt, duration);
      buffer = result.buffer;
      provider = result.provider;
      fileName = `${assetType}_${Date.now()}.${ext}`;
    } else if (useMock || (!env.openaiApiKey && !env.replicateApiToken)) {
      if (!useMock && !env.openaiApiKey && !env.replicateApiToken) {
        throw new Error('Kein API-Schlüssel. Aktiviere TEST_MODE oder hinterlege OPENAI_API_KEY.');
      }
      buffer = await generateMockAsset(dna, assetType, body.platform, body.customText);
      buffer = await applySmartFormat(buffer, assetType, body.platform);
      buffer = await processAsset(buffer);
      provider = 'test-mode';
      fileName = assetType === 'sticker' && body.stickerIndex !== undefined
        ? `sticker_${String(body.stickerIndex + 1).padStart(2, '0')}.png`
        : `${assetType}_${Date.now()}.png`;
    } else {
      const result = await generateImage(prompt, assetType);
      buffer = await applySmartFormat(result.buffer, assetType, body.platform);
      buffer = await processAsset(buffer);
      provider = result.provider;

      if (assetType === 'sticker' && body.stickerIndex !== undefined) {
        fileName = `sticker_${String(body.stickerIndex + 1).padStart(2, '0')}.png`;
      } else {
        fileName = `${assetType}_${Date.now()}.png`;
      }
    }

    const filePath = join(projectDir, fileName);
    writeFileSync(filePath, buffer);

    await db.updateJob(jobId, {
      status: 'done',
      provider,
      filePath,
      fileName,
      metadata: { platform: body.platform, customText: body.customText, coinCost, testMode: useMock },
    });

    await audit(db, userId, 'generate', `${projectId}/${assetType}`, fileName, ip);
  } catch (err) {
    if (userId && coinCost > 0) {
      await refundCoins(userId, coinCost, `Erstattung: ${assetType} fehlgeschlagen`);
    }
    await db.updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unbekannter Fehler',
    });
  }
}

export async function waitForJob(jobId: string, maxWaitMs = 120000): Promise<Awaited<ReturnType<typeof getDb>> extends infer _ ? import('@cbs/shared').GenerationJob : never> {
  const db = await getDb();
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await db.getJob(jobId);
    if (!job) throw new Error('Job nicht gefunden');
    if (job.status === 'done' || job.status === 'failed') return job;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Generierung Timeout');
}
