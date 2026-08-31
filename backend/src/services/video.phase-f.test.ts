import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLocalHighlights,
  sanitizeHighlightLabel,
  highlightClaimsFakeDetection,
  parseAnimationIntent,
  parseHighlightIndex,
  keptRanges,
  clampRange,
  defaultEditPlan,
  ffmpegCropScaleFilter,
  COIN_COSTS,
  CoinSpendCategory,
} from '@ucbs/shared';
import {
  parseFfmpegMetadata,
  parseSceneTimestamps,
  parseSilenceRanges,
  createTinyTestVideo,
  probeVideoMetadata,
  exportEditedVideo,
} from '../lib/video-processing.js';

const dir = dirname(fileURLToPath(import.meta.url));

describe('phase F — highlights are honest', () => {
  it('sanitizes kill/reaction labels', () => {
    assert.equal(sanitizeHighlightLabel('Kill erkannt'), 'Highlight');
    assert.equal(highlightClaimsFakeDetection('Headshot erkannt'), true);
    assert.equal(highlightClaimsFakeDetection('hohe Sprachaktivität + Szenenwechsel'), false);
  });

  it('local highlights have start/end, score 0-100, and real reasons', () => {
    const highlights = buildLocalHighlights({
      durationSec: 40,
      scenes: [{ start: 8, end: 14, duration: 6 }],
      pauses: [{ start: 20, end: 28, duration: 8 }],
      activity: [{ start: 8, end: 16, rms: 0.4 }],
      subtitles: [{ start: 9, end: 13, text: 'Lass uns das Setup zeigen' }],
    });
    assert.ok(highlights.length >= 1);
    for (const h of highlights) {
      assert.ok(h.end > h.start);
      assert.ok(h.score >= 0 && h.score <= 100);
      assert.equal(highlightClaimsFakeDetection(`${h.label} ${h.reason}`), false);
      assert.match(h.reason, /Szene|Sprache|Audio|Aktivität/i);
    }
  });
});

describe('phase F — animation intent', () => {
  it('parses intro duration and logo-loop', () => {
    const intro = parseAnimationIntent('Mach mir daraus ein 10 Sekunden Intro');
    assert.equal(intro.type, 'intro');
    assert.equal(intro.durationSec, 10);
    const loop = parseAnimationIntent('Animier mein Logo');
    assert.equal(loop.type, 'logo-loop');
  });

  it('parses highlight index 1-based', () => {
    assert.equal(parseHighlightIndex('Mach Highlight 2 zum Short'), 1);
  });
});

describe('phase F — edit plan and crop', () => {
  it('clamps trim and inverts pause removals', () => {
    const r = clampRange(-2, 99, 10);
    assert.equal(r.start, 0);
    assert.ok(r.end <= 10);
    const kept = keptRanges({ start: 0, end: 10 }, [{ start: 3, end: 5 }]);
    assert.equal(kept.length, 2);
    assert.equal(kept[0]?.end, 3);
    assert.equal(kept[1]?.start, 5);
  });

  it('default plan is non-destructive', () => {
    const plan = defaultEditPlan(12);
    assert.equal(plan.trimStart, 0);
    assert.equal(plan.trimEnd, 12);
    assert.equal(plan.removeSegments.length, 0);
  });

  it('manual crop filter includes crop then scale', () => {
    const f = ffmpegCropScaleFilter(1080, 1920, {
      mode: 'manual',
      x: 0.2,
      y: 0,
      width: 0.4,
      height: 1,
    });
    assert.match(f, /crop=/);
    assert.match(f, /1080:1920/);
  });
});

describe('phase F — ffmpeg metadata parsers', () => {
  it('parses duration, size, video and audio from ffmpeg stderr', () => {
    const stderr = `
Duration: 00:00:02.20, start: 0.000000, bitrate: 200 kb/s
Stream #0:0: Video: h264 (High), yuv420p, 320x240, 25 fps
Stream #0:1: Audio: aac, 44100 Hz, stereo
`;
    const meta = parseFfmpegMetadata(stderr, 4096);
    assert.ok(Math.abs(meta.durationSec - 2.2) < 0.05);
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 240);
    assert.equal(meta.hasAudio, true);
    assert.equal(meta.videoCodec, 'h264');
    assert.equal(meta.sizeBytes, 4096);
  });

  it('parses scene pts and silence ranges', () => {
    const scenes = parseSceneTimestamps('pts_time:1.20\npts_time:3.00\n', 5);
    assert.ok(scenes.some((s) => s.start === 0));
    assert.ok(scenes.every((s) => s.end > s.start));
    const pauses = parseSilenceRanges('silence_start: 1.00\nsilence_end: 2.50\n', 5);
    assert.equal(pauses.length, 1);
    assert.equal(pauses[0]?.start, 1);
    assert.equal(pauses[0]?.end, 2.5);
  });
});

describe('phase F — real ffmpeg roundtrip', () => {
  it('probes tiny test video and exports a shorter trim', async () => {
    const buf = await createTinyTestVideo();
    assert.ok(buf.length > 500);
    const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
    const meta = await probeVideoMetadata(dataUrl);
    assert.ok(meta.durationSec > 1.5);
    assert.ok(meta.width >= 320);
    assert.ok(meta.height >= 240);
    const exported = await exportEditedVideo(dataUrl, {
      ...defaultEditPlan(meta.durationSec),
      trimStart: 0.2,
      trimEnd: Math.min(meta.durationSec, 1.4),
      aspectRatio: 'original',
    });
    assert.ok(exported.length > 200);
    assert.notEqual(exported.equals(buf), true);
  });

  it('9:16 export actually scales to 1080x1920', async () => {
    const buf = await createTinyTestVideo();
    const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
    const exported = await exportEditedVideo(
      dataUrl,
      {
        ...defaultEditPlan(2),
        trimStart: 0,
        trimEnd: 1.2,
        aspectRatio: '9:16',
        crop: { mode: 'center', x: 0, y: 0, width: 1, height: 1 },
      },
      { vertical: true, width: 1080, height: 1920 }
    );
    const outUrl = `data:video/mp4;base64,${exported.toString('base64')}`;
    const meta = await probeVideoMetadata(outUrl);
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1920);
  });
});

describe('phase F — architecture gates', () => {
  it('animation POST requires Nexter quote', () => {
    const routes = readFileSync(join(dir, '../routes/animation.routes.ts'), 'utf8');
    assert.match(routes, /ANIMATION_REQUIRES_QUOTE/);
    assert.equal(routes.includes('generateAnimation'), false);
  });

  it('local shorts export does not charge VIDEO_EDIT or SHORTS_CLIP', () => {
    const routes = readFileSync(join(dir, '../routes/video.routes.ts'), 'utf8');
    const shortsFn = routes.slice(routes.indexOf('/:id/shorts'), routes.indexOf('cropSchema'));
    assert.equal(shortsFn.includes('withCoinCharge'), false);
    assert.match(shortsFn, /exportShortClip/);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
  });

  it('video project get is ownership-scoped', () => {
    const src = readFileSync(join(dir, 'media.service.ts'), 'utf8');
    assert.match(src, /if \(!p \|\| p.userId !== userId\) return null/);
    assert.match(src, /probeVideoMetadata/);
    assert.match(src, /analyzeVideoLocal/);
  });

  it('animation confirm goes through quotes.service generateAnimation', () => {
    const quotes = readFileSync(join(dir, 'nexter/quotes.service.ts'), 'utf8');
    assert.match(quotes, /kind === 'animation'/);
    assert.match(quotes, /generateAnimation/);
  });
});
