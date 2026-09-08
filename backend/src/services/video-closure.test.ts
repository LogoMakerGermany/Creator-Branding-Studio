import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_TRANSITION_TYPES,
  buildVideoPreviewState,
  captionsFromTranscript,
  defaultEditPlan,
  parseVideoClosureCommand,
  sanitizeCaptionText,
  type VideoEditPlan,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { createProject } from './project.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import {
  buildSrtContent,
  captionBurnFilter,
  createTinyTestVideo,
  exportEditedVideo,
  probeVideoMetadata,
} from '../lib/video-processing.js';
import {
  attachVideoSource,
  createVideoProject,
  executeQuotedCaptions,
  generateSubtitles,
  getVideoProject,
  saveEditPlan,
  saveSubtitleEdits,
  setCaptionTestHooks,
} from './media.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { nexterChat } from './nexter/conversation.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

async function seed(durationSec = 2.2) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-close.test`, 'Close');
  const brand = await createProject(user.id, { name: 'Brand', type: 'video' });
  const video = await createVideoProject(user.id, 'Closure Cut', 30, 'shorts', undefined, brand.id);
  const buf = await createTinyTestVideo(durationSec);
  const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
  const attached = await attachVideoSource(video.id, user.id, dataUrl, undefined, 'clip.mp4');
  return { user, brand, video: attached, dataUrl, buf };
}

afterEach(() => {
  setCaptionTestHooks(null);
});

describe('video closure — transitions', () => {
  it('cut concatenates two clips without requiring a fade', async () => {
    const { dataUrl, buf } = await seed();
    const exported = await exportEditedVideo(
      dataUrl,
      { ...defaultEditPlan(2.2), trimStart: 0, trimEnd: 2, transition: 'cut' },
      { introBuffer: buf }
    );
    const meta = await probeVideoMetadata(`data:video/mp4;base64,${exported.toString('base64')}`);
    assert.ok(meta.durationSec > 3.5);
    assert.equal(meta.hasAudio, true);
  });

  it('crossfade/fade is executed when two clips exist', async () => {
    const { dataUrl, buf } = await seed();
    const exported = await exportEditedVideo(
      dataUrl,
      {
        ...defaultEditPlan(2.2),
        trimStart: 0,
        trimEnd: 2,
        transition: 'fade',
        transitionSec: 0.4,
      },
      { introBuffer: buf }
    );
    const meta = await probeVideoMetadata(`data:video/mp4;base64,${exported.toString('base64')}`);
    assert.ok(meta.durationSec > 2.8);
    assert.ok(meta.durationSec < 4.4);
    assert.equal(meta.hasAudio, true);
  });

  it('rejects unsupported transition types', async () => {
    const { user, video } = await seed();
    await assert.rejects(
      () =>
        saveEditPlan(video.id, user.id, {
          ...defaultEditPlan(video.duration),
          transition: 'wipe' as VideoEditPlan['transition'],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_TRANSITION'
    );
  });

  it('rejects invalid transition duration', async () => {
    const { user, video } = await seed();
    await assert.rejects(
      () =>
        saveEditPlan(video.id, user.id, {
          ...defaultEditPlan(video.duration),
          transition: 'fade',
          transitionSec: 9,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_TRANSITION'
    );
    const short = await seed(0.8);
    await assert.rejects(
      () =>
        exportEditedVideo(
          short.dataUrl,
          { ...defaultEditPlan(0.8), trimStart: 0, trimEnd: 0.7, transition: 'fade', transitionSec: 1.2 },
          { introBuffer: short.buf }
        ),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_TRANSITION'
    );
  });

  it('UI transition types match backend-supported types only', () => {
    assert.deepEqual([...VIDEO_TRANSITION_TYPES], ['cut', 'fade']);
    const routes = readFileSync(join(dir, '../routes/video.routes.ts'), 'utf8');
    assert.match(routes, /z\.enum\(\['cut', 'fade'\]\)/);
    const page = readFileSync(join(dir, '../../../frontend/src/pages/video/VideoStudioPage.tsx'), 'utf8');
    assert.match(page, /VIDEO_TRANSITION_TYPES/);
    assert.equal(page.includes('wipe'), false);
  });

  it('audio crossfade is used when both clips have audio; mute falls back to video-only', async () => {
    const proc = readFileSync(join(dir, '../lib/video-processing.ts'), 'utf8');
    assert.match(proc, /acrossfade/);
    assert.match(proc, /xfade=transition=fade/);
    const { dataUrl, buf } = await seed();
    const muted = await exportEditedVideo(
      dataUrl,
      {
        ...defaultEditPlan(2.2),
        trimStart: 0,
        trimEnd: 2,
        transition: 'fade',
        transitionSec: 0.4,
        mute: true,
      },
      { introBuffer: buf }
    );
    const meta = await probeVideoMetadata(`data:video/mp4;base64,${muted.toString('base64')}`);
    assert.equal(meta.hasAudio, false);
  });
});

describe('video closure — manual captions', () => {
  it('creates, edits, deletes and persists captions', async () => {
    const { user, video } = await seed(8);
    const created = await saveSubtitleEdits(video.id, user.id, [
      { start: 1, end: 3, text: 'Caption A' },
    ]);
    assert.equal(created.subtitles.length, 1);
    assert.equal(created.subtitles[0]?.text, 'Caption A');
    const edited = await saveSubtitleEdits(video.id, user.id, [
      { start: 1, end: 3, text: 'Caption A edit' },
      { start: 4, end: 6, text: 'Caption B' },
    ]);
    assert.equal(edited.subtitles.length, 2);
    const deleted = await saveSubtitleEdits(video.id, user.id, [{ start: 4, end: 6, text: 'Caption B' }]);
    assert.equal(deleted.subtitles.length, 1);
    const reloaded = await getVideoProject(video.id, user.id);
    assert.equal(reloaded?.subtitles[0]?.text, 'Caption B');
  });

  it('rejects invalid caption timing and captions past video duration', async () => {
    const { user, video } = await seed(8);
    await assert.rejects(
      () => saveSubtitleEdits(video.id, user.id, [{ start: -1, end: 1, text: 'x' }]),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_CAPTION'
    );
    await assert.rejects(
      () => saveSubtitleEdits(video.id, user.id, [{ start: 2, end: 2, text: 'x' }]),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_CAPTION'
    );
    await assert.rejects(
      () => saveSubtitleEdits(video.id, user.id, [{ start: 1, end: 20, text: 'x' }]),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_CAPTION'
    );
  });

  it('keeps caption text out of the ffmpeg argv (SRT file + default style only)', async () => {
    const payload = `hi'; rm -rf / $(whoami) && echo`;
    const srt = buildSrtContent([{ start: 1, end: 2, text: payload }]);
    assert.match(srt, /hi/);
    const filter = captionBurnFilter('/tmp/subs.srt');
    assert.equal(filter.includes(payload), false);
    assert.equal(filter.includes('$(whoami)'), false);
    assert.match(filter, /force_style=/);
    assert.equal(sanitizeCaptionText('a --> b\u0000'), 'a → b');
    const proc = readFileSync(join(dir, '../lib/video-processing.ts'), 'utf8');
    assert.match(proc, /captionBurnFilter/);
    assert.match(proc, /DEFAULT_CAPTION_FORCE_STYLE/);
    assert.equal(proc.includes('req.body.filter'), false);
  });

  it('caption render config burns via subtitles filter when subtitleTrack is on', async () => {
    const { dataUrl } = await seed(8);
    const buf = await exportEditedVideo(
      dataUrl,
      { ...defaultEditPlan(8), trimStart: 0, trimEnd: 2, subtitleTrack: true },
      { subtitles: [{ start: 0.2, end: 1.5, text: 'Willkommen' }] }
    );
    assert.ok(buf.length > 200);
  });
});

describe('video closure — automatic captions (provider-gated)', () => {
  it('maps mock transcript to caption entries without a provider', () => {
    const entries = captionsFromTranscript(
      [
        { start: 1, end: 3, text: 'Caption A' },
        { start: 4, end: 6, text: 'Caption B' },
      ],
      10
    );
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.text, 'Caption A');
    assert.equal(entries[1]?.start, 4);
  });

  it('automatic captions require the provider gate and explicit quote confirmation', async () => {
    const { user, video } = await seed(8);
    await assert.rejects(
      () => generateSubtitles(video.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    await assert.rejects(
      () => executeQuotedCaptions(user.id, video.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    const convo = readFileSync(join(dir, 'nexter/conversation.service.ts'), 'utf8');
    assert.equal(convo.includes('executeQuotedCaptions'), false);
    assert.equal(convo.includes('confirmQuote'), false);
    assert.match(convo, /wantTranscribe/);
    const quotes = readFileSync(join(dir, 'nexter/quotes.service.ts'), 'utf8');
    assert.match(quotes, /executeQuotedCaptions/);
    assert.match(quotes, /kind === 'captions'/);
  });

  it('confirmed caption quote applies mock transcript and leaves review required', async () => {
    const { user, video } = await seed(8);
    setCaptionTestHooks({
      transcript: [
        { start: 1, end: 3, text: 'Caption A' },
        { start: 4, end: 6, text: 'Caption B' },
      ],
    });
    const quote = await createQuote(user.id, 'captions', video.id, { videoProjectId: video.id });
    const result = await confirmQuote(user.id, quote.id);
    assert.equal(result.jobIds.length, 1);
    const loaded = await getVideoProject(video.id, user.id);
    assert.equal(loaded?.subtitles.length, 2);
    assert.equal(loaded?.subtitles[0]?.text, 'Caption A');
    assert.equal(loaded?.captionsNeedReview, true);
    assert.equal(loaded?.editPlan?.subtitleTrack, false);
    const reviewed = await saveSubtitleEdits(video.id, user.id, [
      { start: 1, end: 3, text: 'Caption A fix' },
      { start: 4, end: 6, text: 'Caption B' },
    ]);
    assert.equal(reviewed.captionsNeedReview, false);
    assert.equal(reviewed.subtitles[0]?.text, 'Caption A fix');
  });
});

describe('video closure — preview', () => {
  it('preview uses owned source and rejects foreign project access', async () => {
    const a = await seed();
    const b = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-close-b.test`, 'B');
    assert.equal(await getVideoProject(a.video.id, b.id), null);
    const owned = await getVideoProject(a.video.id, a.user.id);
    assert.ok(owned?.sourceFileId);
    assert.ok(owned?.preview);
    const routes = readFileSync(join(dir, '../routes/video.routes.ts'), 'utf8');
    assert.match(routes, /rejectClientPaths/);
    assert.equal(routes.includes('previewUrl'), false);
  });

  it('preview reflects trim, aspect, crop/fit and captions; persists after reload', async () => {
    const { user, video } = await seed(8);
    await saveSubtitleEdits(video.id, user.id, [{ start: 1, end: 3, text: 'Willkommen im Stream' }]);
    const saved = await saveEditPlan(video.id, user.id, {
      ...defaultEditPlan(video.duration),
      trimStart: 0.5,
      trimEnd: 4,
      aspectRatio: '9:16',
      fitMode: 'fit',
      transition: 'fade',
      subtitleTrack: true,
    });
    assert.equal(saved.preview?.trimStart, 0.5);
    assert.equal(saved.preview?.aspectRatio, '9:16');
    assert.equal(saved.preview?.objectFit, 'contain');
    assert.equal(saved.preview?.cssAspect, '9 / 16');
    assert.equal(saved.preview?.captions[0]?.text, 'Willkommen im Stream');
    assert.equal(saved.preview?.label, 'Vorschau');
    const reloaded = await getVideoProject(video.id, user.id);
    assert.deepEqual(reloaded?.preview, saved.preview);
    const page = readFileSync(join(dir, '../../../frontend/src/pages/video/VideoStudioPage.tsx'), 'utf8');
    assert.match(page, /buildVideoPreviewState/);
    assert.match(page, /video-preview-label/);
    assert.equal(page.includes('Final Render'), false);
  });

  it('preview and export share the same central plan fields', () => {
    const plan = {
      ...defaultEditPlan(10),
      trimStart: 1,
      trimEnd: 5,
      aspectRatio: '1:1' as const,
      fitMode: 'crop' as const,
      transition: 'cut' as const,
    };
    const preview = buildVideoPreviewState({ plan, captions: [] });
    assert.equal(preview.trimStart, plan.trimStart);
    assert.equal(preview.trimEnd, plan.trimEnd);
    assert.equal(preview.aspectRatio, plan.aspectRatio);
    assert.equal(preview.fitMode, plan.fitMode);
    assert.equal(preview.objectFit, 'cover');
    const proc = readFileSync(join(dir, '../lib/video-processing.ts'), 'utf8');
    assert.match(proc, /ffmpegCropScaleFilter/);
    assert.match(proc, /plan\.fitMode/);
    assert.match(proc, /plan\.aspectRatio/);
  });
});

describe('video closure — nexter and safety', () => {
  it('parses transition, timed caption and preview commands; transcribe stays a quote', async () => {
    const fade = parseVideoClosureCommand('Mach zwischen den beiden Clips eine weiche Überblendung.');
    assert.equal(fade?.transition, 'fade');
    const cap = parseVideoClosureCommand(`Schreib unten 'Willkommen im Stream' von Sekunde 2 bis 5`);
    assert.equal(cap?.caption?.text, 'Willkommen im Stream');
    assert.equal(cap?.caption?.start, 2);
    assert.equal(cap?.caption?.end, 5);
    const preview = parseVideoClosureCommand('Zeig mir erst eine Vorschau.');
    assert.equal(preview?.wantPreview, true);
    assert.equal(detectQuoteKind('Mach die Caption kürzer.'), 'text');
    assert.equal(detectQuoteKind('Transkribier die Untertitel in meinem Video'), 'captions');
    assert.equal(detectQuoteKind(`Schreib unten 'Willkommen im Stream' von Sekunde 2 bis 5`), null);
  });

  it('Nexter applies local transition/caption config without quoting transcription', async () => {
    const { user, video } = await seed(8);
    const fadeSession = await nexterChat(user.id, 'Mach zwischen den beiden Clips eine weiche Überblendung.');
    const fadeMsg = fadeSession.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(fadeMsg?.content ?? '', /Überblendung|Fade|vorbereitet/i);
    const afterFade = await getVideoProject(video.id, user.id);
    assert.equal(afterFade?.editPlan?.transition, 'fade');

    const capSession = await nexterChat(user.id, `Schreib unten 'Willkommen im Stream' von Sekunde 2 bis 5`);
    const capMsg = capSession.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(capMsg?.content ?? '', /Caption|Willkommen/);
    const afterCap = await getVideoProject(video.id, user.id);
    assert.equal(afterCap?.subtitles.some((s) => s.text === 'Willkommen im Stream'), true);

    const previewSession = await nexterChat(user.id, 'Zeig mir erst eine Vorschau.');
    const previewMsg = previewSession.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(previewMsg?.content ?? '', /Vorschau/);
    assert.equal((previewMsg?.content ?? '').includes('Final Render'), false);
  });

  it('resource limits remain; provider and payment calls stay at 0', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const media = readFileSync(join(dir, 'media.service.ts'), 'utf8');
    assert.match(media, /assertLocalVideoCapacity/);
    assert.equal(media.includes('api.openai.com'), false);
    assert.equal(media.includes('api.stripe.com'), false);
    assert.equal(media.includes('api.paypal.com'), false);
    const proc = readFileSync(join(dir, '../lib/video-processing.ts'), 'utf8');
    assert.match(proc, /FFMPEG_TIMEOUT_MS/);
    assert.match(proc, /MAX_VIDEO_OUTPUT_BYTES/);
  });
});
