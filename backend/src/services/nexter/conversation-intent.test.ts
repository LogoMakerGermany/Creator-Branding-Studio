import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory } from '@ucbs/shared';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../../config/env.js';
import { getOrCreateUser } from '../user.service.js';
import { upsertDna } from '../dna.service.js';
import { createProject } from '../project.service.js';
import { getCoinBalance } from '../coins.service.js';
import { isPaidProviderTestBlocked } from '../../lib/media-providers.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
import { nexterChat } from './conversation.service.js';
import { listOwnedQuotes } from './quotes.service.js';
import { buildActions, looksLikeConstraintFollowUp, recommendFormat } from './tools.service.js';
import { resolveNexterConversationIntent, isSmalltalkMessage } from './conversation-intent.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

function lastAssistant(session: {
  messages: Array<{
    role: string;
    content: string;
    suggestions?: string[];
    actions?: Array<{ tool: string; requiresConfirmation?: boolean; coinCost?: number; payload?: { coinCost?: number } }>;
  }>;
}) {
  const last = session.messages.at(-1);
  assert.equal(last?.role, 'assistant');
  return last!;
}

async function seed(label: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@intent-${label}.test`, label);
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

describe('nexter conversation intelligence — intent classes', () => {
  it('classifies smalltalk, analysis, advice, create, navigation, help, settings, ambiguous', () => {
    assert.equal(resolveNexterConversationIntent('Wie geht es dir?').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Guten Morgen').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Danke dir').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Erzähl mir einen Witz').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Was machst du?').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Was fehlt meinem Streamset?').intent, 'PROJECT_ANALYSIS');
    assert.equal(resolveNexterConversationIntent('Was habe ich schon erstellt?').intent, 'PROJECT_ANALYSIS');
    assert.equal(resolveNexterConversationIntent('Welche Assets fehlen noch?').intent, 'PROJECT_ANALYSIS');
    assert.equal(resolveNexterConversationIntent('Welche Farben passen zu meinem Kanal?').intent, 'CREATOR_ADVICE');
    assert.equal(resolveNexterConversationIntent('Mach mir ein Logo.').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Erstelle mir ein komplettes Streamset.').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Öffne das Logo Studio.').intent, 'NAVIGATION_ACTION');
    assert.equal(resolveNexterConversationIntent('Was kann Nexter?').intent, 'APP_HELP');
    assert.equal(resolveNexterConversationIntent('Welche Einstellungen habe ich?').intent, 'ACCOUNT_OR_SETTINGS');
    assert.equal(resolveNexterConversationIntent('Mach mal.').intent, 'AMBIGUOUS');
    assert.equal(resolveNexterConversationIntent('Ändere das.').intent, 'AMBIGUOUS');
    assert.equal(isSmalltalkMessage('wie geht es dir?'), true);
    assert.equal(looksLikeConstraintFollowUp('wie geht es dir?'), false);
    assert.equal(looksLikeConstraintFollowUp('Blau und Grün.'), true);
  });

  it('keeps color follow-up in an active create workflow and resets on explicit smalltalk', () => {
    const history = [
      { role: 'user', content: 'Mach mir ein Logo.' },
      { role: 'assistant', content: 'Welche Farben möchtest du?' },
    ];
    assert.equal(resolveNexterConversationIntent('Blau und Grün.', history).intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Übrigens, wie geht es dir?', history).intent, 'SMALLTALK');
  });
});

describe('nexter conversation intelligence — smalltalk side effects', () => {
  it('Wie geht es dir stays smalltalk without format, gaps, quote or debit', async () => {
    const { user } = await seed('hi');
    const before = await getCoinBalance(user.id);
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const session = await nexterChat(user.id, 'Wie geht es dir?');
    const last = lastAssistant(session);
    assert.match(last.content, /gut|danke|geht/i);
    assert.doesNotMatch(last.content, /TikTok\/Shorts|9:16|1080×1920|Starting Soon|Dir fehlt noch/i);
    assert.equal((last.suggestions ?? []).some((s) => /Dir fehlt|Starting Soon|TikTok/i.test(s)), false);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
    assert.equal(recommendFormat('Wie geht es dir?', { preferredPlatforms: ['tiktok'] }), null);
    const { suggestions } = buildActions(
      'Wie geht es dir?',
      {
        coinBalance: 50,
        hasDna: true,
        primaryColors: [],
        projectCount: 1,
        projectNames: ['Brand'],
        fileCount: 0,
        recentJobs: [],
        missingAssets: ['Starting Soon'],
      },
      undefined,
      undefined,
      false,
      undefined,
      'SMALLTALK'
    );
    assert.equal(suggestions.some((s) => /Dir fehlt|Starting Soon/i.test(s)), false);
  });

  it('Guten Morgen, Danke dir and jokes stay smalltalk', async () => {
    const { user } = await seed('greet');
    for (const msg of ['Guten Morgen', 'Danke dir', 'Erzähl mir einen Witz']) {
      const last = lastAssistant(await nexterChat(user.id, msg));
      assert.doesNotMatch(last.content, /TikTok\/Shorts|Dir fehlt noch|Starting Soon/i);
      assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    }
  });
});

describe('nexter conversation intelligence — analysis, advice, create, nav', () => {
  it('project analysis may mention missing assets', async () => {
    const { user } = await seed('gap');
    const last = lastAssistant(await nexterChat(user.id, 'Was fehlt meinem Streamset?'));
    assert.match(last.content, /fehlt|Starting Soon|Asset|Projekt|DNA|Streamset/i);
  });

  it('creator advice may use DNA but not quote or generate', async () => {
    const { user } = await seed('advice');
    const before = await getCoinBalance(user.id);
    const last = lastAssistant(await nexterChat(user.id, 'Welche Farben passen zu meinem Kanal?'));
    assert.match(last.content, /Farbe|DNA|NightWolf|Look/i);
    assert.doesNotMatch(last.content, /Dir fehlt noch: Starting Soon/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('create logo keeps quote flow without provider start, komplettset stays 200', async () => {
    const { user } = await seed('create');
    const last = lastAssistant(await nexterChat(user.id, 'Mach mir ein Logo.'));
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation' && a.requiresConfirmation), true);
    const pack = lastAssistant(await nexterChat(user.id, 'Erstelle mir ein komplettes Streamset.'));
    const start = pack.actions?.find((a) => a.tool === 'start_generation');
    assert.equal(start?.coinCost ?? start?.payload?.coinCost, 200);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_PACK], 200);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_THREE_PART], 75);
    assert.equal(getDefaultFreeCoins(), 50);
  });

  it('navigation opens studio without quote', async () => {
    const { user } = await seed('nav');
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    assert.equal((last.actions ?? []).some((a) => a.tool === 'open_studio'), true);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('ambiguous mach mal asks before acting', async () => {
    const { user } = await seed('amb');
    const last = lastAssistant(await nexterChat(user.id, 'Mach mal.'));
    assert.match(last.content, /Womit soll ich anfangen|Logo|Streamset/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('logo color follow-up stays create; later smalltalk does not quote', async () => {
    const { user } = await seed('switch');
    await nexterChat(user.id, 'Mach mir ein Logo.');
    const follow = lastAssistant(await nexterChat(user.id, 'Blau und Grün.'));
    assert.match(follow.content, /Logo|Farbe|Coins|Erstellen/i);
    const quotesAfterCreate = (await listOwnedQuotes(user.id)).length;
    const smalltalk = lastAssistant(await nexterChat(user.id, 'Übrigens, wie geht es dir?'));
    assert.match(smalltalk.content, /gut|danke|geht/i);
    assert.doesNotMatch(smalltalk.content, /TikTok\/Shorts|Dir fehlt noch/i);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesAfterCreate);
  });
});

describe('nexter conversation intelligence — safety freeze', () => {
  it('does not touch orb, payments, or live providers in this block', () => {
    const conv = src('conversation.service.ts');
    assert.match(conv, /resolveNexterConversationIntent/);
    assert.match(conv, /FIRST RESPOND TO THE USER'S CURRENT INTENT/);
    assert.doesNotMatch(conv, /confirmQuote/);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const orb = src('../nexter-orb-ui.test.ts');
    assert.match(orb, /INNER_ORB_RATIO/);
  });
});
