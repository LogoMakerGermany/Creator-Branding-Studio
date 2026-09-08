import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultEditPlan, ffmpegCropScaleFilter, isValidTrim, parseVideoStudioPrep } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { createProject } from './project.service.js';
import { saveUserFile, issueFileDownloadUrl, getUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import {
  parseAndValidateVideoDataUrl,
  looksLikePathInjection,
  MAX_CONCURRENT_LOCAL_VIDEO_JOBS,
} from '../lib/upload-validation.js';
import { createTinyTestVideo, exportEditedVideo, probeVideoMetadata } from '../lib/video-processing.js';
import { generateSubtitles } from './media.service.js';
import {
  attachVideoSource,
  createVideoProject,
  detectHighlights,
  exportShortClip,
  getVideoProject,
  renderVideoProject,
  saveEditPlan,
} from './media.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-wf.test`, 'Vid');
  const brand = await createProject(user.id, { name: 'Brand', type: 'video' });
  const video = await createVideoProject(user.id, 'NightWolf Cut', 30, 'shorts', undefined, brand.id);
  const buf = await createTinyTestVideo();
  const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
  const attached = await attachVideoSource(video.id, user.id, dataUrl, undefined, 'clip.mp4');
  return { user, brand, video: attached, dataUrl };
}

describe('video workflow — upload security', () => {
  it('rejects invalid MIME and empty files', () => {
    assert.throws(
      () => parseAndValidateVideoDataUrl('data:image/png;base64,AAAA'),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_UPLOAD'
    );
    assert.throws(
      () => parseAndValidateVideoDataUrl('data:video/mp4;base64,AA=='),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_UPLOAD'
    );
    const fake = `data:video/mp4;base64,${Buffer.from('not a video file at all!!').toString('base64')}`;
    assert.throws(
      () => parseAndValidateVideoDataUrl(fake, { fileName: 'clip.mp4' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_UPLOAD'
    );
  });

  it('upload belongs to owner and foreign project is isolated', async () => {
    const a = await seed();
    const b = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-wf-b.test`, 'B');
    assert.equal(await getVideoProject(a.video.id, b.id), null);
    assert.ok(a.video.sourceFileId);
    const file = await getUserFile(a.video.sourceFileId!, a.user.id);
    assert.ok(file);
    assert.equal(await getUserFile(a.video.sourceFileId!, b.id), null);
  });
});

describe('video workflow — metadata and persistence', () => {
  it('extracts metadata and survives reload', async () => {
    const { user, video } = await seed();
    assert.ok(video.metadata);
    assert.ok(video.metadata!.durationSec > 1);
    assert.ok(video.metadata!.width >= 320);
    assert.ok(video.metadata!.height >= 240);
    assert.ok(video.metadata!.aspectRatio);
    assert.equal(video.metadata!.hasAudio, true);
    const reloaded = await getVideoProject(video.id, user.id);
    assert.ok(reloaded?.sourceFileId);
    assert.equal(reloaded?.title, 'NightWolf Cut');
    assert.ok(reloaded?.editPlan);
  });
});

describe('video workflow — trim and presets', () => {
  it('valid trim is accepted; invalid trim is rejected before ffmpeg', async () => {
    const { user, video } = await seed();
    assert.equal(isValidTrim(0.2, 1.2, video.duration), true);
    assert.equal(isValidTrim(-1, 1, video.duration), false);
    assert.equal(isValidTrim(1.5, 0.2, video.duration), false);
    await assert.rejects(
      () =>
        saveEditPlan(video.id, user.id, {
          ...defaultEditPlan(video.duration),
          trimStart: 1.8,
          trimEnd: 0.2,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_TRIM'
    );
    const saved = await saveEditPlan(video.id, user.id, {
      ...defaultEditPlan(video.duration),
      trimStart: 0.2,
      trimEnd: 1.4,
    });
    assert.equal(saved.editPlan?.trimStart, 0.2);
  });

  it('16:9, 9:16 and 1:1 presets export without stretching via crop/fit filters', async () => {
    const buf = await createTinyTestVideo();
    const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
    const landscape = await exportEditedVideo(dataUrl, {
      ...defaultEditPlan(2),
      trimStart: 0,
      trimEnd: 1.1,
      aspectRatio: '16:9',
      fitMode: 'crop',
    });
    const lmeta = await probeVideoMetadata(`data:video/mp4;base64,${landscape.toString('base64')}`);
    assert.equal(lmeta.width, 1920);
    assert.equal(lmeta.height, 1080);

    const square = await exportEditedVideo(dataUrl, {
      ...defaultEditPlan(2),
      trimStart: 0,
      trimEnd: 1.1,
      aspectRatio: '1:1',
      fitMode: 'fit',
    });
    const smeta = await probeVideoMetadata(`data:video/mp4;base64,${square.toString('base64')}`);
    assert.equal(smeta.width, 1080);
    assert.equal(smeta.height, 1080);

    const fit = ffmpegCropScaleFilter(1080, 1920, { mode: 'center', x: 0, y: 0, width: 1, height: 1 }, 'fit');
    assert.match(fit, /force_original_aspect_ratio=decrease/);
    assert.equal(fit.includes('increase'), false);
  });
});

describe('video workflow — highlights and shorts', () => {
  it('highlight candidates do not auto-export; manual short works', async () => {
    const { user, video } = await seed();
    const analyzed = await detectHighlights(video.id, user.id);
    assert.ok(Array.isArray(analyzed.highlights));
    assert.equal(analyzed.shorts.length, 0);
    const media = src('media.service.ts');
    const detectFn = media.split('export async function detectHighlights')[1]?.split('export async function')[0] ?? '';
    assert.match(detectFn, /analyzeVideoLocally/);
    assert.equal(detectFn.includes('transcribeVideoSource'), false);

    const job = await exportShortClip(video.id, user.id, { start: 0.2, end: 1.3, format: 'shorts' });
    assert.equal(job.status, 'completed');
    assert.ok(job.metadata?.fileId);
    const refreshed = await getVideoProject(video.id, user.id);
    assert.equal(refreshed?.shorts.length, 1);
    assert.equal(refreshed?.shorts[0]?.metadata?.version, 1);
  });

  it('no-highlight state stays usable', async () => {
    const { video } = await seed();
    assert.equal(video.highlights.length, 0);
    assert.ok(isValidTrim(0, Math.min(1, video.duration), video.duration));
  });
});

describe('video workflow — ownership, paths, limits', () => {
  it('foreign intro and audio are rejected; client paths blocked', async () => {
    const a = await seed();
    const b = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-wf-c.test`, 'C');
    const buf = await createTinyTestVideo();
    const foreign = await saveUserFile(b.id, {
      name: 'intro.mp4',
      mimeType: 'video/mp4',
      category: 'video',
      dataUrl: `data:video/mp4;base64,${buf.toString('base64')}`,
      source: 'upload',
    });
    await assert.rejects(
      () =>
        saveEditPlan(a.video.id, a.user.id, {
          ...defaultEditPlan(a.video.duration),
          introFileId: foreign.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    await assert.rejects(
      () =>
        saveEditPlan(a.video.id, a.user.id, {
          ...defaultEditPlan(a.video.duration),
          audioFileId: foreign.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    await assert.rejects(
      () => exportEditedVideo('/etc/passwd', defaultEditPlan(2)),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_SOURCE'
    );
    await assert.rejects(
      () => exportEditedVideo('C:\\\\temp\\\\clip.mp4', defaultEditPlan(2)),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_SOURCE'
    );
    assert.equal(looksLikePathInjection('../secret'), true);
    const routes = readFileSync(join(dir, '../routes/video.routes.ts'), 'utf8');
    assert.match(routes, /rejectClientPaths/);
    assert.match(routes, /INVALID_SOURCE/);
  });

  it('resource limits and concurrent cap exist', () => {
    assert.ok(MAX_CONCURRENT_LOCAL_VIDEO_JOBS >= 1);
    const proc = readFileSync(join(dir, '../lib/video-processing.ts'), 'utf8');
    assert.match(proc, /FFMPEG_TIMEOUT_MS/);
    assert.match(proc, /MAX_VIDEO_OUTPUT_BYTES/);
    const media = src('media.service.ts');
    assert.match(media, /assertLocalVideoCapacity/);
    assert.match(media, /MAX_VIDEO_DURATION_SEC/);
  });
});

describe('video workflow — export results', () => {
  it('failed export does not persist a successful asset; success is owned and versioned', async () => {
    const { user, video, brand } = await seed();
    const failed = await exportShortClip(video.id, user.id, { start: 0.1, end: 1.0, format: 'shorts' });
    // Force a failure path: invalid trim never creates a completed job
    await assert.rejects(
      () => exportShortClip(video.id, user.id, { start: 9, end: 1, format: 'shorts' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_TRIM'
    );
    const second = await exportShortClip(video.id, user.id, { start: 0.3, end: 1.2, format: 'youtube' });
    assert.equal(failed.status, 'completed');
    assert.equal(second.status, 'completed');
    assert.equal(second.metadata?.version, 2);
    const fileId = String(second.metadata?.fileId ?? '');
    assert.ok(fileId);
    const issued = await issueFileDownloadUrl(fileId, user.id);
    assert.ok(issued.downloadUrl);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-wf-d.test`, 'D');
    assert.equal(await issueFileDownloadUrl(fileId, other.id), null);
    const rendered = await renderVideoProject(video.id, user.id);
    assert.ok(rendered.renderFileId);
    assert.equal(rendered.status, 'ready');
    void brand;
  });

  it('Nexter video commands prepare the owned project and do not quote', () => {
    const tiktok = parseVideoStudioPrep('Mach daraus einen TikTok-Clip.');
    assert.equal(tiktok?.studio, 'shorts');
    const convo = readFileSync(join(dir, 'nexter/conversation.service.ts'), 'utf8');
    const block = convo.split('const videoPrep = parseVideoStudioPrep')[1]?.split('const changeIntent')[0] ?? '';
    assert.match(convo, /parseVideoStudioPrep/);
    assert.match(block, /ctx.videoProjectId/);
    assert.equal(block.includes('createQuote'), false);
  });
});

describe('video workflow — provider and payment safety', () => {
  it('provider and payment calls stay at 0', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const { user, video } = await seed();
    await assert.rejects(
      () => generateSubtitles(video.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    const analysis = readFileSync(join(dir, '../lib/video-analysis.ts'), 'utf8');
    assert.match(analysis, /isPaidProviderTestBlocked/);
    const media = src('media.service.ts');
    assert.equal(media.includes('api.openai.com'), false);
    assert.equal(media.includes('api.stripe.com'), false);
  });
});
