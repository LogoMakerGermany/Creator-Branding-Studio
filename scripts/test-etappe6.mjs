#!/usr/bin/env node
/** Etappe 6 — Social, Assistant, Calendar, Chat, File Cloud. Run: node scripts/test-etappe6.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(l) { passed++; console.log(`  ✓ ${l}`); }
function fail(l, d) { failed++; console.error(`  ✗ ${l}${d ? `: ${d}` : ''}`); }
function read(r) { return readFileSync(join(root, r), 'utf8'); }
function inc(r, n, l) { read(r).includes(n) ? ok(l) : fail(l, n); }
function exc(r, n, l) { !read(r).includes(n) ? ok(l) : fail(l, n); }

console.log('\n=== Etappe 6 Rest — Static Tests ===\n');

console.log('Social');
exc('backend/src/services/social.service.ts', 'Math.random()', 'no fake engagement');
inc('backend/src/services/social.service.ts', 'uploadAssetFromDataUrl', 'social media upload');
inc('backend/src/services/social.service.ts', 'createCalendarEvent', 'scheduled posts sync to calendar');
inc('backend/src/services/social.service.ts', 'ServiceError', 'social uses ServiceError');
inc('frontend/src/pages/social/SocialMediaPage.tsx', 'mediaDataUrl', 'social media upload UI');
console.log('');

console.log('Assistant');
inc('backend/src/services/assistant.service.ts', 'isProduction()', 'production guard on AI');
inc('backend/src/services/assistant.service.ts', 'AI_UNAVAILABLE', 'clear error without API key');
exc('backend/src/services/assistant.service.ts', 'getFallbackReply', 'no production keyword fallback');
inc('backend/src/services/assistant.service.ts', 'messages.slice(-12)', 'conversation history in API call');
console.log('');

console.log('Calendar');
inc('backend/src/services/calendar.service.ts', 'parseIsoDate', 'date validation');
inc('backend/src/services/calendar.service.ts', 'ServiceError', 'calendar uses ServiceError');
console.log('');

console.log('Chat');
inc('backend/src/services/chat.service.ts', 'isDevMode()', 'welcome message dev-only');
inc('backend/src/services/chat.service.ts', 'listTeamsForUser', 'team-aware channel name');
inc('backend/src/services/chat.service.ts', 'ServiceError', 'chat uses ServiceError');
console.log('');

console.log('File Cloud');
inc('backend/src/services/file-cloud.service.ts', 'parseAndValidateVideoDataUrl', 'video upload validation');
inc('backend/src/routes/modules.routes.ts', "'sticker'", 'sticker category in upload route');
inc('frontend/src/pages/files/FileCloudPage.tsx', 'file.downloadUrl', 'image preview from storage URL');
console.log('');

console.log(`--- Result: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
