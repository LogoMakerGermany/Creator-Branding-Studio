import { randomUUID, createHash } from 'node:crypto';
import {
  CoinSpendCategory,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  MAX_NEXTER_SPEAK_CHARS,
  MAX_VOICE_STUDIO_CHARS,
  applyVoiceChangeRequest,
  buildVoicePreviewSummary,
  defaultVoiceSettings,
  estimateVoiceDurationSec,
  normalizeVoiceLanguage,
  parseVoiceIntent,
  parseVoiceSettings,
  validateVoiceText,
  voiceDownloadFilename,
  voiceSupportsLanguage,
  type CreatorDNA,
  type VoiceConfig,
} from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { generateSpeech, isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { getElevenLabsApiKey } from '../config/env.js';
import { createTinyTestAudio } from '../lib/audio-test.js';
import { AppError } from '../middleware/errorHandler.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import { withDevLock } from '../lib/dev-mutex.js';
import { resolveDnaForRequest } from './dna.service.js';
import {
  issueFileDownloadUrl,
  listUserFiles,
  saveUserFile,
  type UserFile,
} from './file-cloud.service.js';
import { getMediaJob, listMediaJobs, type MediaJob } from './media.service.js';
import { recordJobVersion, getVersionsForJob } from './change-request.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { getUserById } from './user.service.js';
import { getVoiceCatalogEntry, resolveProviderVoiceId } from './nexter/voice-catalog.service.js';

export interface VoiceJobView extends MediaJob {
  fileMissing?: boolean;
  config?: VoiceConfig;
  downloadName?: string;
}

let voiceTestHooks: { result?: 'success' | 'fail'; audioDataUrl?: string } | undefined;

export function setVoiceTestHooks(hooks: typeof voiceTestHooks | null): void {
  voiceTestHooks = hooks ?? undefined;
}

async function resolvePlan(
  userId: string,
  payload?: Record<string, unknown>
): Promise<VoiceConfig> {
  const user = await getUserById(userId);
  const prefs = user?.nexterPreferences;
  const parsed = parseVoiceIntent(typeof payload?.message === 'string' ? payload.message : '', {
    language: prefs?.language,
    voiceCatalogId: prefs?.voiceCatalogId,
  });
  const textRaw =
    typeof payload?.text === 'string'
      ? payload.text
      : typeof payload?.prompt === 'string'
        ? payload.prompt
        : parsed.text;
  const checked = validateVoiceText(textRaw, MAX_VOICE_STUDIO_CHARS);
  if (!checked.ok) {
    throw new ServiceError(400, checked.code, checked.message);
  }
  if (payload?.language !== undefined && payload.language !== null && payload.language !== '') {
    if (!normalizeVoiceLanguage(payload.language)) {
      throw new ServiceError(400, 'INVALID_LANGUAGE', 'Sprache wird nicht unterstützt');
    }
  }
  const language =
    normalizeVoiceLanguage(payload?.language) ??
    normalizeVoiceLanguage(parsed.language) ??
    normalizeVoiceLanguage(prefs?.language) ??
    'de';
  const voiceCatalogId =
    (typeof payload?.voiceCatalogId === 'string' && payload.voiceCatalogId.trim()) ||
    parsed.voiceCatalogId ||
    prefs?.voiceCatalogId ||
    DEFAULT_NEXTER_VOICE_CATALOG_ID;
  const entry = await getVoiceCatalogEntry(voiceCatalogId);
  if (!entry) {
    throw new ServiceError(400, 'UNKNOWN_VOICE', 'Diese Stimme ist nicht verfügbar');
  }
  if (!voiceSupportsLanguage(entry, language)) {
    throw new ServiceError(
      400,
      'VOICE_LANGUAGE_INCOMPATIBLE',
      'Diese Stimme unterstützt die gewählte Sprache nicht'
    );
  }
  const settings = parseVoiceSettings(
    (payload?.settings as Record<string, unknown> | undefined) ?? parsed.settings
  );
  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 80) : parsed.title;
  const estimatedDurationSec = estimateVoiceDurationSec(checked.text);
  return {
    text: checked.text,
    voiceCatalogId,
    language,
    title,
    settings,
    estimatedDurationSec,
    summary: buildVoicePreviewSummary({
      text: checked.text,
      language,
      voiceCatalogId,
      estimatedDurationSec,
    }),
  };
}

export async function listVoice(userId: string): Promise<VoiceJobView[]> {
  const jobs = await listMediaJobs(userId, 'ai-voice');
  return Promise.all(jobs.map((j) => hydrateVoiceJob(j, userId)));
}

export async function getVoice(id: string, userId: string): Promise<VoiceJobView | null> {
  const job = await getMediaJob(id, userId);
  if (!job || job.type !== 'ai-voice') return null;
  return hydrateVoiceJob(job, userId);
}

export async function hydrateVoiceJob(job: MediaJob, userId: string): Promise<VoiceJobView> {
  const config = planFromJob(job);
  const next: VoiceJobView = { ...job, config };
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  const version = typeof job.metadata?.version === 'number' ? job.metadata.version : 1;
  next.downloadName = voiceDownloadFilename({
    title: config.title || (typeof job.title === 'string' ? job.title : 'intro'),
    version,
    ext: 'wav',
  });
  if (!fileId) {
    if (job.status === 'completed') next.fileMissing = true;
    return next;
  }
  try {
    const issued = await issueFileDownloadUrl(fileId, userId);
    if (!issued) {
      next.fileMissing = true;
      next.audioUrl = undefined;
      return next;
    }
    next.audioUrl = issued.downloadUrl;
    next.fileMissing = false;
  } catch (err) {
    if (err instanceof ServiceError && err.code === 'FILE_MISSING') {
      next.fileMissing = true;
      next.audioUrl = undefined;
      return next;
    }
    throw err;
  }
  return next;
}

function planFromJob(job: MediaJob): VoiceConfig {
  const meta = job.metadata ?? {};
  const text = typeof meta.sourceText === 'string' ? meta.sourceText : job.prompt;
  const checked = validateVoiceText(text);
  return {
    text: checked.ok ? checked.text : '',
    voiceCatalogId:
      typeof meta.voiceCatalogId === 'string' ? meta.voiceCatalogId : DEFAULT_NEXTER_VOICE_CATALOG_ID,
    language: normalizeVoiceLanguage(meta.language) ?? 'de',
    title: typeof job.title === 'string' ? job.title : undefined,
    settings: parseVoiceSettings(meta.settings as Record<string, unknown> | undefined),
    estimatedDurationSec:
      typeof job.duration === 'number' ? job.duration : estimateVoiceDurationSec(checked.ok ? checked.text : ''),
    summary: typeof meta.summary === 'string' ? meta.summary : '',
  };
}

export async function downloadVoice(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getVoice(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Voice-Result nicht gefunden');
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Voice-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'nexter-voice-intro-v1.wav',
  };
}

export async function listVoiceVersions(jobId: string, userId: string) {
  const job = await getMediaJob(jobId, userId);
  if (!job || job.type !== 'ai-voice') throw new ServiceError(404, 'NOT_FOUND', 'Voice-Result nicht gefunden');
  const rootId = typeof job.metadata?.parentJobId === 'string' ? job.metadata.parentJobId : jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function listOwnedVoiceFiles(userId: string): Promise<UserFile[]> {
  const files = await listUserFiles(userId);
  return files.filter((f) => f.mimeType.startsWith('audio/'));
}

export async function retryVoiceJob(jobId: string, userId: string): Promise<never> {
  const job = await getMediaJob(jobId, userId);
  if (!job || job.type !== 'ai-voice') throw new ServiceError(404, 'NOT_FOUND', 'Voice-Result nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'VOICE_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function generateVoiceTrack(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: MediaJob; coinsSpent: number; newBalance: number }> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const parentJobId = typeof payload?.parentJobId === 'string' ? payload.parentJobId : undefined;
  let plan: VoiceConfig;
  if (parentJobId) {
    const parent = await getMediaJob(parentJobId, userId);
    if (!parent || parent.type !== 'ai-voice') {
      throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Voiceover nicht gefunden');
    }
    const parentPlan = planFromJob(parent);
    const request =
      typeof payload?.request === 'string'
        ? payload.request
        : typeof payload?.message === 'string'
          ? payload.message
          : '';
    plan = applyVoiceChangeRequest(parentPlan, request);
    const checked = validateVoiceText(plan.text, MAX_VOICE_STUDIO_CHARS);
    if (!checked.ok) throw new ServiceError(400, checked.code, checked.message);
    plan.text = checked.text;
    const entry = await getVoiceCatalogEntry(plan.voiceCatalogId);
    if (!entry) throw new ServiceError(400, 'UNKNOWN_VOICE', 'Diese Stimme ist nicht verfügbar');
    if (!voiceSupportsLanguage(entry, plan.language)) {
      throw new ServiceError(400, 'VOICE_LANGUAGE_INCOMPATIBLE', 'Diese Stimme unterstützt die gewählte Sprache nicht');
    }
  } else {
    plan = await resolvePlan(userId, payload);
  }

  const quoteId = typeof payload?.quoteId === 'string' ? payload.quoteId : undefined;

  if (voiceTestHooks?.result !== 'success' && voiceTestHooks?.result !== 'fail') {
    if (isPaidProviderTestBlocked() || !getElevenLabsApiKey()) {
      throw new ServiceError(
        503,
        'AI_NOT_CONFIGURED',
        'TTS-Provider ist nicht konfiguriert. Vorschau bleibt die Stimmvorschau.'
      );
    }
  }

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.AI_VOICE,
      'KI Stimme Generierung',
      async () => {
        if (voiceTestHooks?.result === 'fail') {
          const job: MediaJob = {
            id: randomUUID(),
            userId,
            type: 'ai-voice',
            status: 'failed',
            prompt: plan.text,
            title: plan.title || `${dna.name} Voice`,
            duration: plan.estimatedDurationSec,
            dnaId: dna.id,
            projectId,
            error: 'mock-fail',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            metadata: voiceJobMetadata(plan, undefined, undefined, parentJobId),
          };
          const { dsSet } = await import('../lib/data-store.js');
          await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
          return job;
        }

        if (isPaidProviderTestBlocked() || voiceTestHooks?.result === 'success') {
          if (isPaidProviderTestBlocked() && voiceTestHooks?.result !== 'success') {
            throw new ServiceError(
              503,
              'AI_NOT_CONFIGURED',
              'TTS-Provider ist nicht konfiguriert. Vorschau bleibt die Stimmvorschau.'
            );
          }
          const dataUrl =
            voiceTestHooks?.audioDataUrl ??
            `data:audio/wav;base64,${createTinyTestAudio().toString('base64')}`;
          return persistVoiceResult(userId, dna, plan, projectId, parentJobId, dataUrl);
        }

        const providerVoiceId = await resolveProviderVoiceId(plan.voiceCatalogId);
        const speech = await generateSpeech(plan.text, {
          voiceId: providerVoiceId,
          settings: plan.settings,
        });
        const dataUrl = speech.audioUrl.startsWith('data:')
          ? speech.audioUrl
          : await fetchAudioAsDataUrl(speech.audioUrl);
        const job = await persistVoiceResult(userId, dna, plan, projectId, parentJobId, dataUrl);
        job.provider = speech.provider;
        const { dsSet } = await import('../lib/data-store.js');
        await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
        return job;
      },
      { quoteId }
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

async function fetchAudioAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'Remote-Audio ohne Mock ist in diesem Block nicht erlaubt');
}

function voiceJobMetadata(
  plan: VoiceConfig,
  fileId?: string,
  version?: number,
  parentJobId?: string
): Record<string, unknown> {
  return {
    sourceText: plan.text,
    voiceCatalogId: plan.voiceCatalogId,
    language: plan.language,
    settings: plan.settings,
    summary: plan.summary,
    fileId,
    version,
    parentJobId,
    mimeType: 'audio/wav',
    downloadName: voiceDownloadFilename({ title: plan.title, version: version ?? 1, ext: 'wav' }),
  };
}

async function persistVoiceResult(
  userId: string,
  dna: CreatorDNA,
  plan: VoiceConfig,
  projectId: string | undefined,
  parentJobId: string | undefined,
  dataUrl: string
): Promise<MediaJob> {
  const id = randomUUID();
  const rootId = parentJobId || id;
  const existing = await getVersionsForJob(rootId, userId);
  const version = existing.length + 1;
  const filename = voiceDownloadFilename({
    title: plan.title || 'intro',
    version,
    ext: 'wav',
  });
  const file = await saveUserFile(userId, {
    name: filename,
    mimeType: 'audio/wav',
    category: 'other',
    dataUrl,
    source: 'generation',
    projectId,
    sourceJobId: id,
  });
  const versionRow = await recordJobVersion(userId, rootId, file.id, parentJobId ? 'Variante' : 'Original');
  const job: MediaJob = {
    id,
    userId,
    type: 'ai-voice',
    status: 'completed',
    prompt: plan.text,
    title: plan.title || `${dna.name} Voice`,
    duration: plan.estimatedDurationSec,
    dnaId: dna.id,
    projectId,
    provider: 'mock',
    audioUrl: file.downloadUrl,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    metadata: voiceJobMetadata(plan, file.id, versionRow.version, parentJobId),
  };
  const { dsSet } = await import('../lib/data-store.js');
  await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
  if (projectId) {
    await attachAssetToProject(userId, projectId, {
      name: filename,
      type: 'audio',
      url: file.downloadUrl || dataUrl,
      jobId: id,
      fileId: file.id,
      module: 'ai-voice',
      sourceType: 'generation',
      sourceId: id,
      mimeType: 'audio/wav',
      version: versionRow.version,
    }).catch(() => undefined);
  }
  return job;
}

export async function speakNexterReply(
  userId: string,
  text: string
): Promise<{ audioUrl: string; provider: string }> {
  const user = await getUserById(userId);
  if (user?.nexterPreferences?.voiceOutputEnabled === false) {
    throw new ServiceError(403, 'VOICE_DISABLED', 'Nexter-Sprachausgabe ist deaktiviert. Der Textchat bleibt aktiv.');
  }
  const checked = validateVoiceText(text, MAX_NEXTER_SPEAK_CHARS);
  if (!checked.ok) {
    throw new ServiceError(400, checked.code, checked.message);
  }
  return withDevLock(`nexter-speak:${userId}`, async () => {
    const hash = createHash('sha256').update(checked.text).digest('hex');
    const now = Date.now();
    const prior = (await dsGet('nexter_speak_guard', userId)) as
      | { at?: number; hash?: string; audioUrl?: string; provider?: string }
      | null;
    const priorAt = typeof prior?.at === 'number' ? prior.at : 0;
    if (prior?.hash === hash && prior.audioUrl && now - priorAt < 60_000) {
      return { audioUrl: prior.audioUrl, provider: String(prior.provider ?? 'cached') };
    }
    if (priorAt && now - priorAt < 8_000) {
      throw new ServiceError(
        429,
        'SPEAK_RATE_LIMIT',
        'Bitte kurz warten, bevor die Sprachausgabe erneut gestartet wird.'
      );
    }
    try {
      const { job } = await withCoinCharge(userId, CoinSpendCategory.NEXTER_VOICE, 'Nexter Sprachausgabe', async () => {
        try {
          const voiceId = await resolveProviderVoiceId(user?.nexterPreferences?.voiceCatalogId);
          const result = await generateSpeech(checked.text, {
            voiceId,
            settings: defaultVoiceSettings(),
          });
          return { status: 'completed' as const, ...result };
        } catch {
          return { status: 'failed' as const, error: 'Sprachausgabe fehlgeschlagen' };
        }
      });
      if (job.status === 'failed' || !('audioUrl' in job) || !job.audioUrl) {
        throw new ServiceError(503, 'VOICE_FAILED', 'Sprachausgabe fehlgeschlagen');
      }
      const audioUrl = job.audioUrl;
      const provider = String(job.provider ?? 'elevenlabs');
      await dsSet('nexter_speak_guard', userId, { at: Date.now(), hash, audioUrl, provider });
      return { audioUrl, provider };
    } catch (err) {
      if (err instanceof AppError) {
        throw new ServiceError(err.statusCode, err.code, err.message);
      }
      throw err;
    }
  });
}
