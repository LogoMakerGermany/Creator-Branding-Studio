import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEXTER_STUDIO_PATHS,
  parseVideoStudioPrep,
  isAiVideoQuoteIntent,
  parseGeneratedVideoAspectFromMessage,
} from '@ucbs/shared';
import { getDefaultFreeCoins } from '../../config/env.js';
import { isPaidProviderTestBlocked } from '../../lib/media-providers.js';
import { getOrCreateUser } from '../user.service.js';
import { upsertDna } from '../dna.service.js';
import { createProject } from '../project.service.js';
import { deductAmount, getCoinBalance } from '../coins.service.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
import { nexterChat } from './conversation.service.js';
import { listOwnedQuotes, createQuote } from './quotes.service.js';
import { detectQuoteKind, detectOpenStudio, detectShowHighlights, detectMakeShort, coinCostForKind } from './tools.service.js';
import { resolveNexterConversationIntent } from './conversation-intent.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

const Q4_PROMPT =
  'Erstelle ein KI-Video, 5 Sekunden, 16:9: Eine originale futuristische violett-blaue Plasmakugel schwebt in einem dunklen High-Tech-Studio. Elektrische Energie pulsiert dezent über die Oberfläche, kleine Lichtpartikel bewegen sich langsam im Raum. Die Kamera fährt sanft nach vorne. Cinematisch, hochwertig, keine Schrift, keine Logos, keine Marken, keine bekannten Figuren.';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

function lastAssistant(session: {
  messages: Array<{
    role: string;
    content: string;
    suggestions?: string[];
    actions?: Array<{
      tool: string;
      label?: string;
      path?: string;
      requiresConfirmation?: boolean;
      coinCost?: number;
      payload?: Record<string, unknown>;
    }>;
  }>;
}) {
  const last = session.messages.at(-1);
  assert.equal(last?.role, 'assistant');
  return last!;
}

async function seed(label: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@q4a-${label}.test`, label);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: `${label} Brand`, type: 'branding', dnaId: dna.id });
  await updateNexterPreferencesForUser(user.id, { platforms: ['tiktok'] });
  return { user, project };
}

describe('Q.4a — KI-Video create vs existing-video routing', () => {
  it('1. Erstelle ein KI-Video 5s 16:9 is CREATE_ASSET / AI_VIDEO and quotes 25 without upload', async () => {
    assert.equal(isAiVideoQuoteIntent(Q4_PROMPT), true);
    assert.equal(parseVideoStudioPrep(Q4_PROMPT), null);
    assert.equal(detectQuoteKind(Q4_PROMPT), 'ai-video');
    assert.equal(resolveNexterConversationIntent(Q4_PROMPT).intent, 'CREATE_ASSET');
    assert.equal(parseGeneratedVideoAspectFromMessage(Q4_PROMPT), '16:9');

    const { user } = await seed('q4-prompt');
    assert.equal(getDefaultFreeCoins(), 50);
    const drained = await deductAmount(user.id, 15, 'setup-to-35', { sourceType: 'admin' });
    assert.equal(drained.success, true);
    assert.equal(await getCoinBalance(user.id), 35);
    const quotesBefore = await listOwnedQuotes(user.id);
    const last = lastAssistant(await nexterChat(user.id, Q4_PROMPT));
    assert.doesNotMatch(last.content, /Lade zuerst|Highlights finden|ich starte keinen Export/i);
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(start?.coinCost, 25);
    assert.equal(start?.payload?.kind, 'ai-video');
    assert.equal(start?.payload?.coinBalance, 35);
    assert.equal(coinCostForKind('ai-video'), 25);
    const quotes = await listOwnedQuotes(user.id);
    const created = quotes.find((q) => q.kind === 'ai-video' && q.status === 'pending');
    assert.ok(created);
    assert.equal(created.coinCost, 25);
    assert.equal(created.payload?.duration, 5);
    assert.equal(created.payload?.aspectRatio, '16:9');
    assert.equal(quotes.length, quotesBefore.length + 1);
    assert.equal(await getCoinBalance(user.id), 35);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation' && !a.requiresConfirmation), false);
  });

  it('2. Generiere ein Video 5s 9:16 is CREATE_ASSET / AI_VIDEO', async () => {
    const msg = 'Generiere ein Video, 5 Sekunden, 9:16: Neon-Partikel in einem dunklen Studio.';
    assert.equal(detectQuoteKind(msg), 'ai-video');
    assert.equal(resolveNexterConversationIntent(msg).intent, 'CREATE_ASSET');
    assert.equal(parseVideoStudioPrep(msg), null);
    assert.equal(parseGeneratedVideoAspectFromMessage(msg), '9:16');
    const { user } = await seed('gen-916');
    const last = lastAssistant(await nexterChat(user.id, msg));
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(start?.payload?.kind, 'ai-video');
    assert.equal(start?.coinCost, 25);
    const quote = (await listOwnedQuotes(user.id)).find((q) => q.kind === 'ai-video');
    assert.equal(quote?.payload?.aspectRatio, '9:16');
    assert.equal(quote?.payload?.duration, 5);
    assert.equal(await getCoinBalance(user.id), getDefaultFreeCoins());
  });

  it('3. Mach mir ein 5 Sekunden KI-Video is CREATE_ASSET / AI_VIDEO', async () => {
    const msg = 'Mach mir ein 5 Sekunden KI-Video';
    assert.equal(detectQuoteKind(msg), 'ai-video');
    assert.equal(resolveNexterConversationIntent(msg).intent, 'CREATE_ASSET');
    const { user } = await seed('five-sec');
    const last = lastAssistant(await nexterChat(user.id, msg));
    assert.equal((last.actions ?? []).find((a) => a.tool === 'start_generation')?.payload?.kind, 'ai-video');
  });

  it('4-7. existing-video, highlights, shorts, and open-studio stay off the AI_VIDEO quote path', async () => {
    assert.equal(detectQuoteKind('Schneide mein Video'), null);
    assert.equal(isAiVideoQuoteIntent('Schneide mein Video'), false);
    assert.ok(parseVideoStudioPrep('Schneide mein Video'));
    assert.equal(detectShowHighlights('Finde Highlights in meinem Video'), true);
    assert.equal(detectMakeShort('Mach Shorts aus meinem Video'), true);
    assert.equal(detectQuoteKind('Mach Shorts aus meinem Video'), null);
    assert.equal(detectOpenStudio('Öffne das Video Studio'), NEXTER_STUDIO_PATHS.video);
    assert.equal(resolveNexterConversationIntent('Öffne das Video Studio').intent, 'NAVIGATION_ACTION');
    assert.equal(detectQuoteKind('Öffne das Video Studio'), null);

    const { user } = await seed('edit-flows');
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const before = await getCoinBalance(user.id);

    const cut = lastAssistant(await nexterChat(user.id, 'Schneide mein Video'));
    assert.match(cut.content, /Video Studio|hoch/i);
    assert.equal((cut.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    const highlights = lastAssistant(await nexterChat(user.id, 'Finde Highlights in meinem Video'));
    assert.match(highlights.content, /Highlight|Video Studio/i);
    assert.equal((highlights.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    const shorts = lastAssistant(await nexterChat(user.id, 'Mach Shorts aus meinem Video'));
    assert.match(shorts.content, /Short|Video Studio|Highlight|Clip/i);
    assert.equal((shorts.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    const nav = lastAssistant(await nexterChat(user.id, 'Öffne das Video Studio'));
    assert.equal((nav.actions ?? []).find((a) => a.tool === 'open_studio')?.path, NEXTER_STUDIO_PATHS.video);
    assert.equal((nav.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('8-14. text-to-video quote does not require upload; 25 coins; duration 5 and 16:9 accepted; no debit/provider', async () => {
    const { user } = await seed('no-upload');
    await deductAmount(user.id, 15, 'setup-to-35', { sourceType: 'admin' });
    const last = lastAssistant(await nexterChat(user.id, Q4_PROMPT));
    assert.doesNotMatch(last.content, /Lade zuerst eines hoch/i);
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(start?.coinCost, 25);
    assert.equal(Number(start?.payload?.coinBalance) - Number(start?.coinCost), 10);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(await getCoinBalance(user.id), 35);
    const quote = (await listOwnedQuotes(user.id)).find((q) => q.kind === 'ai-video');
    assert.equal(quote?.payload?.duration, 5);
    assert.equal(quote?.payload?.aspectRatio, '16:9');
  });

  it('15. invalid 15s asks for 2–10 duration and does not quote', async () => {
    const msg = 'Erstelle ein KI-Video, 15 Sekunden, 16:9: originale Plasmakugel.';
    assert.equal(detectQuoteKind(msg), 'ai-video');
    const { user } = await seed('dur-15');
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const last = lastAssistant(await nexterChat(user.id, msg));
    assert.match(last.content, /2–10|2-10/);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
    assert.equal(await getCoinBalance(user.id), getDefaultFreeCoins());
  });

  it('16. old pending Animation quote is not reused as AI_VIDEO', async () => {
    const { user, project } = await seed('old-anim');
    const anim = await createQuote(user.id, 'animation', project.id, {
      duration: 5,
      message: 'Mach mir ein Intro',
    });
    assert.equal(anim.kind, 'animation');
    assert.equal(anim.status, 'pending');
    const last = lastAssistant(await nexterChat(user.id, Q4_PROMPT));
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(start?.payload?.kind, 'ai-video');
    assert.notEqual(start?.payload?.quoteId, anim.id);
    const quotes = await listOwnedQuotes(user.id);
    const ai = quotes.find((q) => q.kind === 'ai-video' && q.status === 'pending');
    const stillAnim = quotes.find((q) => q.id === anim.id);
    assert.ok(ai);
    assert.notEqual(ai.id, anim.id);
    assert.equal(stillAnim?.kind, 'animation');
    assert.equal(stillAnim?.status, 'pending');
  });

  it('17-20. rights gate, Q.1/Q.2, and O.2b create-vs-modify stay preserved', () => {
    const quotes = src('quotes.service.ts');
    assert.match(quotes, /assertCurrentContentRightsAck/);
    assert.ok(quotes.indexOf('assertCurrentContentRightsAck') < quotes.indexOf('confirmAiVideoQuote') || quotes.includes('await assertCurrentContentRightsAck(userId)'));
    const panel = readFileSync(join(dir, '../../../../frontend/src/components/nexter/NexterPanel.tsx'), 'utf8');
    assert.match(panel, /rightsChecked/);
    assert.match(panel, /CONTENT_RIGHTS_ACK_VERSION/);
    const runway = readFileSync(join(dir, '../../lib/runway-video.ts'), 'utf8');
    assert.match(runway, /RUNWAY_VIDEO_MODEL = 'gen4\.5'/);
    assert.doesNotMatch(runway, /RUNWAY_VIDEO_MODEL = 'gen3a_turbo'/);
    const q2 = readFileSync(join(dir, '../video-duration-thumbnail-q2.test.ts'), 'utf8');
    assert.match(q2, /GENERATED_VIDEO_DURATION_MIN_SEC|2–10|2-10/);
    const conv = src('conversation.service.ts');
    assert.match(conv, /conversationIntent\.intent === 'MODIFY_ASSET'/);
    assert.match(conv, /quoteKindForVideoPrep !== 'ai-video'/);
    assert.equal(resolveNexterConversationIntent('Mach mir ein Logo').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Ändere mein Logo auf blau').intent, 'MODIFY_ASSET');
    assert.equal(resolveNexterConversationIntent('Öffne das Logo Studio.').intent, 'NAVIGATION_ACTION');
  });
});
