#!/usr/bin/env node
/**
 * Etappe 2 — Video module smoke checks (static verification).
 * Run: node scripts/test-etappe2.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function mustInclude(rel, needle, label) {
  if (read(rel).includes(needle)) ok(label);
  else fail(label, `missing "${needle}" in ${rel}`);
}

function mustNotInclude(rel, needle, label) {
  if (!read(rel).includes(needle)) ok(label);
  else fail(label, `still contains "${needle}" in ${rel}`);
}

function mustExist(rel, label) {
  if (existsSync(join(root, rel))) ok(label);
  else fail(label, `file missing: ${rel}`);
}

console.log('\n=== Etappe 2 Video — Static Tests ===\n');

console.log('Video Studio');
mustExist('backend/src/lib/video-processing.ts', 'video-processing module');
mustExist('backend/src/lib/video-analysis.ts', 'video-analysis module');
mustNotInclude('backend/src/lib/media-providers.ts', 'buildFallbackVideoAnalysis', 'fallback removed');
mustInclude('backend/src/lib/video-analysis.ts', 'whisper-1', 'Whisper transcription');
mustInclude('backend/src/services/media.service.ts', 'clipVideoSegment', 'ffmpeg clip for shorts');
mustInclude('backend/src/services/media.service.ts', 'burnSubtitlesIntoVideo', 'subtitle render');
mustInclude('backend/src/routes/video.routes.ts', '/render', 'render route');
mustInclude('frontend/src/pages/video/VideoStudioPage.tsx', 'api.video.render', 'render UI');
console.log('');

console.log('Intro / Outro');
mustInclude('backend/src/services/media.service.ts', 'convertMp4ToGif', 'GIF export');
mustInclude('backend/src/services/media.service.ts', 'convertMp4ToWebm', 'WEBM export');
mustInclude('frontend/src/pages/intro-outro/IntroOutroPage.tsx', 'getMediaExports', 'export download UI');
console.log('');

console.log('KI Media & VTuber');
mustInclude('backend/src/services/media.service.ts', 'inferMusicMetadata', 'music metadata');
mustNotInclude('backend/src/services/media.service.ts', 'Live2D-ready', 'no false VTuber formats');
mustInclude('backend/package.json', 'ffmpeg-static', 'ffmpeg-static dependency');
console.log('');

console.log(`--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
