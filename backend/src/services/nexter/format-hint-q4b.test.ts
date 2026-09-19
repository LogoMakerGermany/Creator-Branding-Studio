import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyExplicitAspectToFormatHint, parseExplicitAspectFromMessage } from '@ucbs/shared';
import { getDefaultFreeCoins } from '../../config/env.js';
import { isPaidProviderTestBlocked } from '../../lib/media-providers.js';
import { getOrCreateUser } from '../user.service.js';
import { upsertDna } from '../dna.service.js';
import { createProject } from '../project.service.js';
import { deductAmount, getCoinBalance } from '../coins.service.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
import { nexterChat } from './conversation.service.js';
import { listOwnedQuotes, createQuote } from './quotes.service.js';
import { detectQuoteKind, recommendFormat, coinCostForKind } from './tools.service.js';
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
    actions?: Array<{
      tool: string;
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

async function seed(label: string, platforms: string[]) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@q4b-${label}.test`, label);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: `${label} Brand`, type: 'branding', dnaId: dna.id });
  await updateNexterPreferencesForUser(user.id, { platforms });
  return { user, project };
}

describe('Q.4b — explicit aspect overrides platform FORMAT hint', () => {
  it('1. explicit 16:9 + preferred TikTok does not inject 9:16 FORMAT hint', async () => {
    assert.equal(parseExplicitAspectFromMessage(Q4_PROMPT), '16:9');
    const hint = recommendFormat(Q4_PROMPT, { preferredPlatforms: ['tiktok'] });
    assert.equal(hint, null);
    assert.equal(applyExplicitAspectToFormatHint(Q4_PROMPT, 'TikTok/Shorts 9:16 (1080×1920px).'), null);

    const { user } = await seed('explicit-169', ['tiktok', 'youtube']);
    await deductAmount(user.id, 15, 'setup-to-35', { sourceType: 'admin' });
    const last = lastAssistant(await nexterChat(user.id, Q4_PROMPT));
    assert.doesNotMatch(last.content, /TikTok\/Shorts 9:16|1080×1920/);
    assert.doesNotMatch(last.content, /9:16/);
  });

  it('2. explicit 9:16 + preferred Twitch/YouTube does not inject 16:9', () => {
    const msg = 'Erstelle ein KI-Video, 5 Sekunden, 9:16: Neon-Partikel.';
    assert.equal(parseExplicitAspectFromMessage(msg), '9:16');
    assert.equal(recommendFormat(msg, { preferredPlatforms: ['youtube'] }), null);
    assert.equal(recommendFormat(msg, { preferredPlatforms: ['twitch'] }), null);
    assert.equal(applyExplicitAspectToFormatHint(msg, 'YouTube 16:9 (1920×1080px).'), null);
    assert.doesNotMatch(recommendFormat(msg, { preferredPlatforms: ['youtube'] }) ?? '', /16:9|1920×1080/);
  });

  it('3-4 + 14. no explicit ratio keeps preferred-platform personalization', () => {
    const video = 'Erstelle ein KI-Video, 5 Sekunden: originale Plasmakugel.';
    assert.equal(parseExplicitAspectFromMessage(video), undefined);
    assert.match(recommendFormat(video, { preferredPlatforms: ['tiktok'] }) ?? '', /TikTok\/Shorts 9:16|1080×1920/);
    assert.match(recommendFormat('Mach mir ein Video.', { preferredPlatforms: ['youtube'] }) ?? '', /YouTube|16:9|1920×1080/);
    assert.match(recommendFormat('Mach mir ein Video.', { preferredPlatforms: ['twitch'] }) ?? '', /Twitch|1920×1080/);
    assert.match(recommendFormat('tiktok shorts') ?? '', /9:16/);
  });

  it('5-10. AI_VIDEO quote keeps 16:9/9:16, duration 5, price 25, no debit/provider', async () => {
    const { user } = await seed('quote-169', ['tiktok']);
    await deductAmount(user.id, 15, 'setup-to-35', { sourceType: 'admin' });
    assert.equal(await getCoinBalance(user.id), 35);
    const last = lastAssistant(await nexterChat(user.id, Q4_PROMPT));
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(start?.coinCost, 25);
    assert.equal(start?.payload?.kind, 'ai-video');
    const quote = (await listOwnedQuotes(user.id)).find((q) => q.kind === 'ai-video' && q.status === 'pending');
    assert.equal(quote?.coinCost, 25);
    assert.equal(quote?.payload?.aspectRatio, '16:9');
    assert.equal(quote?.payload?.duration, 5);
    assert.equal(coinCostForKind('ai-video'), 25);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(await getCoinBalance(user.id), 35);

    const { user: verticalUser } = await seed('quote-916', ['youtube']);
    const vertical = lastAssistant(
      await nexterChat(verticalUser.id, 'Erstelle ein KI-Video, 5 Sekunden, 9:16: originale Plasmakugel.')
    );
    assert.doesNotMatch(vertical.content, /YouTube 16:9|1920×1080px/);
    const nineSixteen = (await listOwnedQuotes(verticalUser.id)).find((q) => q.kind === 'ai-video');
    assert.equal(nineSixteen?.payload?.aspectRatio, '9:16');
    assert.equal(nineSixteen?.payload?.duration, 5);
    assert.equal(nineSixteen?.coinCost, 25);
    assert.equal(await getCoinBalance(verticalUser.id), getDefaultFreeCoins());
  });

  it('11-13. Q.4a routing, Q.2 duration, and O.2b CREATE-vs-MODIFY stay preserved', () => {
    assert.equal(detectQuoteKind(Q4_PROMPT), 'ai-video');
    assert.equal(resolveNexterConversationIntent(Q4_PROMPT).intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Mach mir ein Logo').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Ändere mein Logo auf blau').intent, 'MODIFY_ASSET');
    const q2 = readFileSync(join(dir, '../video-duration-thumbnail-q2.test.ts'), 'utf8');
    assert.match(q2, /GENERATED_VIDEO_DURATION_MIN_SEC|2–10|2-10/);
    const q4a = src('ai-video-intent-q4a.test.ts');
    assert.match(q4a, /CREATE_ASSET \/ AI_VIDEO/);
    const conv = src('conversation.service.ts');
    assert.match(conv, /conversationIntent\.intent === 'MODIFY_ASSET'/);
  });

  it('15. existing quote confirmation semantics stay quote-payload based and unconfirmed here', async () => {
    const quotes = src('quotes.service.ts');
    assert.match(quotes, /if \(quote\.kind === 'ai-video'\)/);
    assert.match(quotes, /generateAiVideo\(userId, quote\.projectId, \{\s*\.\.\.\(quote\.payload \?\? \{\}\)/s);
    assert.doesNotMatch(src('conversation.service.ts'), /confirmQuote\(/);
    const { user, project } = await seed('confirm-semantics', ['tiktok']);
    const pending = await createQuote(user.id, 'ai-video', project.id, {
      duration: 5,
      aspectRatio: '16:9',
      message: Q4_PROMPT,
    });
    assert.equal(pending.status, 'pending');
    assert.equal(pending.payload?.aspectRatio, '16:9');
    assert.equal(pending.coinCost, 25);
    assert.equal(await getCoinBalance(user.id), getDefaultFreeCoins());
  });

  it('explicit aspect also wins for other asset kinds that share FORMAT hints', () => {
    const tiktok = { preferredPlatforms: ['tiktok'] };
    assert.equal(recommendFormat('Mach mir ein Banner 16:9', tiktok), null);
    assert.equal(recommendFormat('Erstelle eine Facecam 16:9', tiktok), null);
    assert.equal(recommendFormat('Mach ein Overlay 16:9', tiktok), null);
    assert.equal(recommendFormat('Erstelle ein Intro, 16:9', tiktok), null);
    assert.equal(recommendFormat('Mach mir ein Sticker 1:1', tiktok), null);
    assert.match(recommendFormat('Mach mir ein Banner', tiktok) ?? '', /9:16|1080×1920|TikTok/);
  });
});
