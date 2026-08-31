import {
  CoinSpendCategory,
  buildDnaPromptContext,
  parseAnimationIntent,
  type AnimationConfig,
  type AnimationTypeId,
  type CreatorDNA,
} from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { resolveDnaForRequest } from './dna.service.js';
import { getJobsByUser } from './ai.service.js';
import { listUserFiles } from './file-cloud.service.js';
import { listMediaJobs, runMediaJob, type MediaJob, type MediaJobType } from './media.service.js';
import { AppError } from '../middleware/errorHandler.js';

const ANIMATION_JOB_TYPES: MediaJobType[] = ['intro', 'outro', 'stinger', 'alert', 'logo-loop'];

function asJobType(type: AnimationTypeId): MediaJobType {
  return type;
}

export async function listAnimations(userId: string): Promise<MediaJob[]> {
  const jobs = await listMediaJobs(userId);
  return jobs.filter((j) => ANIMATION_JOB_TYPES.includes(j.type));
}

export async function listOwnedLogoUrls(userId: string): Promise<Set<string>> {
  const urls = new Set<string>();
  const { dna } = await resolveDnaForRequest(userId);
  for (const a of dna?.sourceAssets ?? []) {
    if (a.url) urls.add(a.url);
  }
  const jobs = await getJobsByUser(userId);
  for (const j of jobs) {
    if (j.module === 'logo' && j.imageUrl) urls.add(j.imageUrl);
  }
  const files = await listUserFiles(userId);
  for (const f of files) {
    if (f.downloadUrl) urls.add(f.downloadUrl);
  }
  return urls;
}

export async function resolveAnimationLogo(userId: string, explicit?: string): Promise<string | undefined> {
  if (explicit?.trim()) {
    const url = explicit.trim();
    if (url.startsWith('data:image/')) return url;
    const owned = await listOwnedLogoUrls(userId);
    if (!owned.has(url)) {
      throw new ServiceError(403, 'LOGO_NOT_OWNED', 'Dieses Logo gehört nicht zu deinem Account');
    }
    return url;
  }
  const owned = [...(await listOwnedLogoUrls(userId))];
  return owned[0];
}

export async function generateAnimation(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: MediaJob; coinsSpent: number; newBalance: number }> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const parsed = parseAnimationIntent(typeof payload?.message === 'string' ? payload.message : '');
  const type = (payload?.type as AnimationTypeId) || parsed.type || 'intro';
  const durationSec = Number(payload?.durationSec ?? parsed.durationSec ?? 6);
  const aspectRatio = (payload?.aspectRatio as AnimationConfig['aspectRatio']) || parsed.aspectRatio || '16:9';
  const motion = (payload?.motion as AnimationConfig['motion']) || 'medium';
  const loop = Boolean(payload?.loop ?? type === 'logo-loop');
  const withAudio = Boolean(payload?.withAudio);
  const logoUrl = await resolveAnimationLogo(userId, typeof payload?.logoUrl === 'string' ? payload.logoUrl : undefined);

  const dnaCtx = buildDnaPromptContext(dna);
  const lockLine = [
    dna.locks?.colors ? `LOCKED colors ${dna.primaryColors.join(', ')}` : null,
    dna.locks?.character || dna.locks?.mascot ? `LOCKED character ${dna.character?.description || dna.mascot}` : null,
    dna.locks?.name ? `LOCKED name ${dna.name}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  const prompt = [
    `${type} animation for ${dna.name}`,
    dnaCtx,
    lockLine,
    `motion ${motion}`,
    loop ? 'seamless loop, logo stays centered and unchanged' : null,
    withAudio ? 'subtle whoosh sfx implied in motion' : 'no on-screen lyrics',
    aspectRatio === '9:16' ? 'vertical 9:16' : '16:9 widescreen',
    logoUrl ? 'use the provided brand logo as the hero mark — do not invent a different mascot' : null,
  ]
    .filter(Boolean)
    .join('. ');

  try {
    return await withCoinCharge(userId, CoinSpendCategory.ANIMATION_GENERATION, `Animation ${type}`, async () => {
      return runMediaJob(userId, asJobType(type), dna, {
        customPrompt: prompt,
        title: `${dna.name} ${type}`,
        duration: Math.min(15, Math.max(2, durationSec)),
        projectId,
        metadata: {
          animationType: type,
          aspectRatio,
          motion,
          loop,
          withAudio,
          logoUrl,
          imageToVideoAttempted: Boolean(logoUrl),
        },
      });
    });
  } catch (err) {
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

export function animationUsesDna(dna: CreatorDNA, job: MediaJob): boolean {
  return job.dnaId === dna.id || Boolean(job.prompt?.includes(dna.name));
}
