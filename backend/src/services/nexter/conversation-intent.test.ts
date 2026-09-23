import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory, NEXTER_STUDIO_PATHS, nexterStudioPathFromUtterance, shouldAutoNavigateNexterStudio } from '@ucbs/shared';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../../config/env.js';
import { getOrCreateUser } from '../user.service.js';
import { upsertDna } from '../dna.service.js';
import { createProject } from '../project.service.js';
import { deductAmount, getCoinBalance } from '../coins.service.js';
import { dsGet, dsSet } from '../../lib/data-store.js';
import { isPaidProviderTestBlocked } from '../../lib/media-providers.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
import { nexterChat } from './conversation.service.js';
import { listOwnedQuotes, createQuote } from './quotes.service.js';
import { buildActions, detectChangeIntent, looksLikeConstraintFollowUp, recommendFormat } from './tools.service.js';
import { resolveNexterConversationIntent, isSmalltalkMessage } from './conversation-intent.js';
import { NEXTER_SMALLTALK_PROMPT_RULES, NEXTER_PROJECT_ANALYSIS_PROMPT_RULES, NEXTER_NAVIGATION_PROMPT_RULES, buildNexterSystemPrompt, stripUnsolicitedCreatorCta } from './conversation-prompt.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

const CREATOR_CTA =
  /erstellen möchtest|Was möchtest du( heute)? erstellen|Lass uns an deinem Projekt|ich kann dir ein Logo|TikTok\/Shorts|Dir fehlt noch|Starting Soon/i;

function lastAssistant(session: {
  messages: Array<{
    role: string;
    content: string;
    suggestions?: string[];
    actions?: Array<{
      tool: string;
      label?: string;
      path?: string;
      autoNavigate?: boolean;
      requiresConfirmation?: boolean;
      coinCost?: number;
      payload?: { coinCost?: number; missing?: string[] };
    }>;
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

async function seedJob(
  userId: string,
  extra: { module: string; assetKey: string; projectId?: string }
) {
  const jobId = randomUUID();
  const now = new Date().toISOString();
  await dsSet('generationJobs', jobId, {
    id: jobId,
    userId,
    module: extra.module,
    status: 'completed',
    imageUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    prompt: extra.assetKey,
    projectId: extra.projectId,
    assetKey: extra.assetKey,
    createdAt: now,
    completedAt: now,
  });
  return jobId;
}

describe('nexter conversation intelligence — intent classes', () => {
  it('classifies smalltalk, analysis, advice, create, navigation, help, settings, ambiguous', () => {
    assert.equal(resolveNexterConversationIntent('Wie geht es dir?').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Guten Morgen').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Danke dir').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Erzähl mir einen Witz').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Was machst du?').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Was machst du gerade?').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Das sieht richtig gut aus.').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Wie war dein Tag?').intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Was fehlt meinem Streamset?').intent, 'PROJECT_ANALYSIS');
    assert.equal(resolveNexterConversationIntent('Was habe ich schon erstellt?').intent, 'PROJECT_ANALYSIS');
    assert.equal(resolveNexterConversationIntent('Welche Assets fehlen noch?').intent, 'PROJECT_ANALYSIS');
    assert.equal(resolveNexterConversationIntent('Welche Farben passen zu meinem Kanal?').intent, 'CREATOR_ADVICE');
    assert.equal(
      resolveNexterConversationIntent('Welche Farben würdest du für meinen Kanal empfehlen?').intent,
      'CREATOR_ADVICE'
    );
    assert.equal(resolveNexterConversationIntent('Mach mir ein Logo.').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Erstelle mir ein komplettes Streamset.').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Öffne das Logo Studio.').intent, 'NAVIGATION_ACTION');
    assert.equal(resolveNexterConversationIntent('Was kann Nexter?').intent, 'APP_HELP');
    assert.equal(resolveNexterConversationIntent('What could I stream tonight?').intent, 'CREATOR_ADVICE');
    assert.equal(resolveNexterConversationIntent('Where can I change my colors?').intent, 'APP_HELP');
    assert.equal(resolveNexterConversationIntent('How many Coins does a logo cost?').intent, 'APP_HELP');
    assert.equal(resolveNexterConversationIntent('Was bist du eigentlich?').intent, 'APP_HELP');
    assert.equal(resolveNexterConversationIntent('Welche Einstellungen habe ich?').intent, 'ACCOUNT_OR_SETTINGS');
    assert.equal(resolveNexterConversationIntent('Wie kann ich meine Nexter-Farben ändern?').intent, 'ACCOUNT_OR_SETTINGS');
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
    assert.equal(resolveNexterConversationIntent('Danke, reicht erstmal.', history).intent, 'SMALLTALK');
    assert.equal(resolveNexterConversationIntent('Okay, lass uns mit dem Logo weitermachen.', history).intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Mach den Rahmen dünner.', history).intent, 'MODIFY_ASSET');
  });
});

describe('nexter conversation intelligence — smalltalk CTA gate', () => {
  it('strips unsolicited creator CTAs without becoming a single-string filter', () => {
    const production = 'Mir geht es gut, danke der Nachfrage! Und wie geht es dir?\nWenn du etwas erstellen möchtest, lass es mich wissen!';
    const cleaned = stripUnsolicitedCreatorCta(production);
    assert.match(cleaned, /gut, danke der Nachfrage/i);
    assert.match(cleaned, /wie geht es dir/i);
    assert.doesNotMatch(cleaned, /erstellen möchtest|lass es mich wissen/i);
    const prompt = buildNexterSystemPrompt({
      intent: 'SMALLTALK',
      replyLanguageInstruction: 'Antworte auf Deutsch.',
      contextBlock: 'Kein Projektkontext.',
      memory: '',
    });
    assert.match(prompt, /SMALLTALK/);
    assert.match(prompt, /Do not append a creator call-to-action/);
    assert.doesNotMatch(prompt, /Du schlägst nur vor/);
    assert.match(NEXTER_SMALLTALK_PROMPT_RULES, /ANSWER THE CURRENT USER INTENT FIRST/);
    const analysis = buildNexterSystemPrompt({
      intent: 'PROJECT_ANALYSIS',
      replyLanguageInstruction: 'Antworte auf Deutsch.',
      contextBlock: 'Kein vollständiges Streamset-Projekt.',
      memory: '',
    });
    assert.match(analysis, /PROJECT_ANALYSIS/);
    assert.match(NEXTER_PROJECT_ANALYSIS_PROMPT_RULES, /Do not pretend a complete streamset project was analyzed/);
    assert.match(analysis, /optional user-clickable suggestions/);
    const navPrompt = buildNexterSystemPrompt({
      intent: 'NAVIGATION_ACTION',
      replyLanguageInstruction: 'Antworte auf Deutsch.',
      contextBlock: 'Kein Projektkontext.',
      memory: '',
      quoteKind: 'logo',
      quotedCost: 15,
    });
    assert.match(navPrompt, /NAVIGATION_ACTION/);
    assert.match(NEXTER_NAVIGATION_PROMPT_RULES, /Opening a studio is free/);
    assert.doesNotMatch(navPrompt, /Angebot: logo für 15 Coins/);
  });
});

describe('nexter conversation intelligence — smalltalk side effects', () => {
  it('Wie geht es dir stays smalltalk without CTA, format, gaps, quote or debit', async () => {
    const { user } = await seed('hi');
    const before = await getCoinBalance(user.id);
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const session = await nexterChat(user.id, 'Wie geht es dir?');
    const last = lastAssistant(session);
    const stored = await dsGet('nexterSessions', session.id);
    assert.ok(stored);
    assert.equal('jobId' in stored, false);
    assert.match(last.content, /gut|danke|geht/i);
    assert.doesNotMatch(last.content, CREATOR_CTA);
    assert.equal((last.suggestions ?? []).some((s) => /Dir fehlt|Starting Soon|TikTok|erstellen/i.test(s)), false);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation' || a.tool === 'open_studio'), false);
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

  it('more smalltalk stays conversational without creator tasks', async () => {
    const { user } = await seed('greet');
    for (const msg of [
      'Guten Morgen',
      'Danke dir',
      'Erzähl mir einen Witz',
      'Was machst du gerade?',
      'Das sieht richtig gut aus.',
      'Wie war dein Tag?',
    ]) {
      const last = lastAssistant(await nexterChat(user.id, msg));
      assert.doesNotMatch(last.content, CREATOR_CTA);
      assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    }
  });
});

describe('nexter conversation intelligence — analysis, advice, create, nav, help', () => {
  it('project analysis may mention missing assets from real context without auto-navigation', async () => {
    const { user } = await seed('gap');
    const last = lastAssistant(await nexterChat(user.id, 'Was fehlt meinem Streamset?'));
    assert.match(last.content, /fehlt|Starting Soon|Asset|Projekt|DNA|Streamset/i);
    assert.doesNotMatch(last.content, /Dein Streamset benötigt folgende Assets:/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    const analyze = (last.actions ?? []).find((a) => a.tool === 'analyze_asset');
    const open = (last.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(Boolean(analyze), true);
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.streamset);
    assert.equal(open?.autoNavigate, false);
    assert.equal(shouldAutoNavigateNexterStudio(open, { awaitingConfirm: false }), false);
  });

  it('creator advice may use DNA but not quote, generate, or gap chips', async () => {
    const { user } = await seed('advice');
    const before = await getCoinBalance(user.id);
    const last = lastAssistant(await nexterChat(user.id, 'Welche Farben würdest du für meinen Kanal empfehlen?'));
    assert.match(last.content, /Farbe|DNA|NightWolf|Look/i);
    assert.doesNotMatch(last.content, /Dir fehlt noch: Starting Soon/i);
    assert.doesNotMatch(last.content, /#[0-9a-fA-F]{6}/);
    assert.equal((last.suggestions ?? []).some((s) => /Dir fehlt|Starting Soon/i.test(s)), false);
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
    assert.equal(getDefaultFreeCoins() < COIN_COSTS[CoinSpendCategory.STREAMSET_THREE_PART], true);
    assert.equal(getDefaultFreeCoins() < COIN_COSTS[CoinSpendCategory.STREAMSET_PACK], true);
  });

  it('explicit streamset studio command may auto-navigate; analysis button stays click-only', async () => {
    const { user } = await seed('nav-ss');
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Streamset Studio.'));
    const open = (last.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.streamset);
    assert.equal(open?.autoNavigate, true);
    assert.equal(shouldAutoNavigateNexterStudio(open, { awaitingConfirm: false }), true);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('missing assets come from completed jobs, not a static fake gap', async () => {
    const { user } = await seed('owned-gap');
    await seedJob(user.id, { module: 'overlay', assetKey: 'starting-soon' });
    const last = lastAssistant(await nexterChat(user.id, 'Was fehlt meinem Streamset?'));
    assert.doesNotMatch(last.content, /Dein Streamset benötigt folgende Assets:/i);
    const missing = (last.actions ?? []).find((a) => a.tool === 'analyze_asset')?.payload?.missing ?? [];
    assert.equal(missing.includes('Starting Soon'), false);
    assert.equal(missing.includes('BRB'), true);
  });

  it('no bound project does not claim a complete streamset was analyzed', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@intent-bare.test`, 'bare');
    const last = lastAssistant(await nexterChat(user.id, 'Was fehlt meinem Streamset?'));
    assert.match(last.content, /kein vollständiges Streamset-Projekt/i);
    assert.doesNotMatch(last.content, /Dein Streamset benötigt folgende Assets:/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('navigation opens studio without quote', async () => {
    const { user } = await seed('nav');
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    const open = (last.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.logo);
    assert.equal(open?.autoNavigate, true);
    assert.equal(shouldAutoNavigateNexterStudio(open, { awaitingConfirm: false }), true);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.doesNotMatch(last.content, /nicht genügend|erforderlichen Coins|nicht öffnen/i);
    assert.match(last.content, /keine Coins/i);
  });

  it('app help explains Nexter without quotes or gaps', async () => {
    const { user } = await seed('help');
    const last = lastAssistant(await nexterChat(user.id, 'Was kann Nexter?'));
    assert.match(last.content, /Nexter|Studio|Logo|Streamset/i);
    assert.doesNotMatch(last.content, CREATOR_CTA);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('settings explain Nexter colors without generation', async () => {
    const { user } = await seed('set');
    const last = lastAssistant(await nexterChat(user.id, 'Wie kann ich meine Nexter-Farben ändern?'));
    assert.match(last.content, /Einstellung|Farbe|Theme/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('ambiguous mach mal asks before acting', async () => {
    const { user } = await seed('amb');
    const last = lastAssistant(await nexterChat(user.id, 'Mach mal.'));
    assert.match(last.content, /Womit soll ich anfangen|Logo|Streamset|Was möchtest du/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('modify without a unique asset asks instead of guessing', async () => {
    const { user } = await seed('mod');
    await nexterChat(user.id, 'Mach mir ein Logo.');
    const quotesAfterCreate = (await listOwnedQuotes(user.id)).length;
    const last = lastAssistant(await nexterChat(user.id, 'Mach den Rahmen dünner.'));
    assert.match(last.content, /Welches Element|Logo|Banner|Facecam|Overlay/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesAfterCreate);
  });

  it('logo color follow-up stays create; later smalltalk and pause do not quote', async () => {
    const { user } = await seed('switch');
    await nexterChat(user.id, 'Mach mir ein Logo.');
    const follow = lastAssistant(await nexterChat(user.id, 'Blau und Grün.'));
    assert.match(follow.content, /Logo|Farbe|Coins|Erstellen/i);
    const quotesAfterCreate = (await listOwnedQuotes(user.id)).length;
    const smalltalk = lastAssistant(await nexterChat(user.id, 'Übrigens, wie geht es dir?'));
    assert.match(smalltalk.content, /gut|danke|geht/i);
    assert.doesNotMatch(smalltalk.content, CREATOR_CTA);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesAfterCreate);
    const pause = lastAssistant(await nexterChat(user.id, 'Danke, reicht erstmal.'));
    assert.doesNotMatch(pause.content, CREATOR_CTA);
    assert.equal((pause.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    const resume = lastAssistant(await nexterChat(user.id, 'Okay, lass uns mit dem Logo weitermachen.'));
    assert.match(resume.content, /Logo|Coins|Erstellen|Farbe/i);
  });
});

describe('nexter conversation intelligence — navigation is free', () => {
  const blockedNav = /nicht genügend|erforderlichen Coins|kannst du das .+ nicht öffnen/i;

  it('opens logo studio with 50 coins without quoting 15', async () => {
    const { user } = await seed('nav-50');
    const before = await getCoinBalance(user.id);
    assert.equal(before, getDefaultFreeCoins());
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(before >= COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], true);
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    const open = (last.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(resolveNexterConversationIntent('Öffne das Logo Studio.').intent, 'NAVIGATION_ACTION');
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.logo);
    assert.equal(open?.autoNavigate, true);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.doesNotMatch(last.content, blockedNav);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
  });

  it('opens logo studio even with 0 coins', async () => {
    const { user } = await seed('nav-0');
    const before = await getCoinBalance(user.id);
    if (before > 0) await deductAmount(user.id, before, 'nav-zero');
    assert.equal(await getCoinBalance(user.id), 0);
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    assert.equal((last.actions ?? []).find((a) => a.tool === 'open_studio')?.autoNavigate, true);
    assert.doesNotMatch(last.content, blockedNav);
    assert.equal(await getCoinBalance(user.id), 0);
  });

  it('create logo still quotes 15 and does not auto-confirm', async () => {
    const { user } = await seed('create-15');
    const before = await getCoinBalance(user.id);
    const last = lastAssistant(await nexterChat(user.id, 'Mach mir ein Logo.'));
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(resolveNexterConversationIntent('Mach mir ein Logo.').intent, 'CREATE_ASSET');
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(start?.coinCost ?? start?.payload?.coinCost, 15);
    assert.doesNotMatch(last.content, /Nicht genügend Coins/i);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('insufficient coins only apply to generation, not navigation', async () => {
    const { user } = await seed('nav-low');
    const before = await getCoinBalance(user.id);
    if (before > 10) await deductAmount(user.id, before - 10, 'nav-ten');
    assert.equal(await getCoinBalance(user.id), 10);
    const create = lastAssistant(await nexterChat(user.id, 'Mach mir ein Logo.'));
    assert.match(create.content, /Nicht genügend Coins|Benötigt: 15|vorhanden: 10/i);
    assert.equal((create.actions ?? []).some((a) => a.tool === 'start_generation'), true);
    const nav = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    assert.equal((nav.actions ?? []).find((a) => a.tool === 'open_studio')?.autoNavigate, true);
    assert.doesNotMatch(nav.content, blockedNav);
    assert.equal(await getCoinBalance(user.id), 10);
  });

  it('stale streamset or logo quotes do not gate later navigation', async () => {
    const { user, project } = await seed('stale-quote');
    await createQuote(user.id, 'streamset', project.id);
    await createQuote(user.id, 'logo', project.id);
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    assert.equal(quotesBefore >= 2, true);
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal((last.actions ?? []).find((a) => a.tool === 'open_studio')?.autoNavigate, true);
    assert.doesNotMatch(last.content, blockedNav);
    assert.doesNotMatch(last.content, /200 Coins|Komplettset/i);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
  });

  it('analysis stays click-only while explicit streamset open auto-navigates', async () => {
    const { user } = await seed('nav-ss-iso');
    const analysis = lastAssistant(await nexterChat(user.id, 'Was fehlt meinem Streamset?'));
    const analysisOpen = (analysis.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(analysisOpen?.autoNavigate, false);
    const nav = lastAssistant(await nexterChat(user.id, 'Öffne das Streamset Studio.'));
    const open = (nav.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.streamset);
    assert.equal(open?.autoNavigate, true);
    assert.doesNotMatch(nav.content, blockedNav);
  });
});

const PLASMA_LOGO =
  'originales futuristisches E-Sports-Logo mit abstrakter violett-blauer Plasmakugel, kreisförmiges Premium-Gaming-Design, transparenter Hintergrund. Keine bestehenden Marken, Figuren oder fremden Logos.';

describe('nexter conversation intelligence — O.2b logo create vs open studio', () => {
  it('classifies new-logo prompts as CREATE_ASSET and edits as MODIFY_ASSET', () => {
    assert.equal(NEXTER_STUDIO_PATHS.logo, '/logo-studio');
    assert.equal(nexterStudioPathFromUtterance('Öffne das Logo Studio.'), '/logo-studio');
    assert.equal(nexterStudioPathFromUtterance('Öffne das Logo Studio'), '/logo-studio');
    assert.equal(nexterStudioPathFromUtterance('Logo Studio öffnen'), '/logo-studio');
    assert.equal(resolveNexterConversationIntent('Öffne das Logo Studio.').intent, 'NAVIGATION_ACTION');
    assert.equal(resolveNexterConversationIntent('Mach mir ein Logo').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Erstelle ein neues Logo').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent('Ich möchte ein Logo für meinen Stream').intent, 'CREATE_ASSET');
    assert.equal(resolveNexterConversationIntent(PLASMA_LOGO).intent, 'CREATE_ASSET');
    assert.equal(detectChangeIntent(PLASMA_LOGO), null);
    assert.equal(resolveNexterConversationIntent('Ändere mein Logo auf blau').intent, 'MODIFY_ASSET');
    assert.equal(resolveNexterConversationIntent('Mach den Hintergrund meines Logos transparent').intent, 'MODIFY_ASSET');
    assert.equal(resolveNexterConversationIntent('Entferne den Text aus meinem vorhandenen Logo').intent, 'MODIFY_ASSET');
    assert.equal(detectChangeIntent('Mach den Hintergrund transparent.', { lastLogoId: 'logo-1', lastModule: 'logo' })?.kind, 'logo');
    const conv = src('conversation.service.ts');
    assert.match(conv, /conversationIntent\.intent === 'MODIFY_ASSET'/);
    assert.doesNotMatch(conv, /confirmQuote/);
    const panel = readFileSync(join(dir, '../../../../frontend/src/components/nexter/NexterPanel.tsx'), 'utf8');
    assert.match(panel, /nexterStudioPathFromUtterance/);
    assert.match(panel, /CONTENT_RIGHTS_ACK_VERSION/);
    const openaiImage = readFileSync(join(dir, '../../lib/openai-image.ts'), 'utf8');
    assert.match(openaiImage, /gpt-image-2.5-flare/);
    assert.match(openaiImage, /images\/generations/);
    const env = readFileSync(join(dir, '../../config/env.ts'), 'utf8');
    assert.match(env, /isEnvFlagTrue\('IMAGE_GENERATIONS_ENABLED'\)/);
  });

  it('CREATE_ASSET without an existing logo does not abort with the no-logo modify message', async () => {
    const { user } = await seed('o2b-create');
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const before = await getCoinBalance(user.id);
    const last = lastAssistant(await nexterChat(user.id, PLASMA_LOGO));
    assert.doesNotMatch(last.content, /finde kein Logo/i);
    const start = (last.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(start?.coinCost ?? start?.payload?.coinCost, 15);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation' && !a.requiresConfirmation), false);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore + 1);
  });

  it('MODIFY_ASSET without a logo stays a safe no-logo reply with a click-to-open studio action', async () => {
    const { user } = await seed('o2b-modify-none');
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const before = await getCoinBalance(user.id);
    const last = lastAssistant(await nexterChat(user.id, 'Ändere mein Logo auf blau'));
    assert.match(last.content, /finde kein Logo/i);
    const open = (last.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.logo);
    assert.equal(open?.autoNavigate, false);
    assert.equal(nexterStudioPathFromUtterance(open?.label ?? ''), '/logo-studio');
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
  });

  it('typed and chip-equivalent open-studio stays navigation without quote or debit', async () => {
    const { user } = await seed('o2b-nav');
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const before = await getCoinBalance(user.id);
    await nexterChat(user.id, PLASMA_LOGO);
    const last = lastAssistant(await nexterChat(user.id, 'Öffne das Logo Studio.'));
    const open = (last.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, '/logo-studio');
    assert.equal(open?.autoNavigate, true);
    assert.equal(shouldAutoNavigateNexterStudio(open, { currentPath: '/nexter', awaitingConfirm: false }), true);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore + 1);
  });
});

describe('nexter conversation intelligence — format routing', () => {
  it('uses format only when the request needs one', () => {
    assert.equal(recommendFormat('Wie geht es dir?', { preferredPlatforms: ['tiktok'] }), null);
    assert.equal(recommendFormat('Welche Farben passen zu mir?', { preferredPlatforms: ['tiktok'] }), null);
    assert.match(recommendFormat('Mach ein TikTok Short.', { preferredPlatforms: ['youtube'] }) ?? '', /9:16|1080/i);
    assert.match(recommendFormat('Mach einen YouTube Banner.', { preferredPlatforms: ['tiktok'] }) ?? '', /youtube|banner|2560/i);
  });
});

describe('nexter conversation intelligence — safety freeze', () => {
  it('does not touch orb, payments, or live providers in this block', () => {
    const conv = src('conversation.service.ts');
    const prompt = src('conversation-prompt.ts');
    assert.match(conv, /resolveNexterConversationIntent/);
    assert.match(conv, /stripUnsolicitedCreatorCta/);
    assert.match(prompt, /FIRST RESPOND TO THE USER'S CURRENT INTENT/);
    assert.match(prompt, /Do not append a creator call-to-action/);
    assert.match(prompt, /CURRENT INTENT: PROJECT_ANALYSIS/);
    assert.match(prompt, /CURRENT INTENT: NAVIGATION_ACTION/);
    assert.match(conv, /NAVIGATION_ACTION/);
    assert.doesNotMatch(conv, /confirmQuote/);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const orb = src('../nexter-orb-ui.test.ts');
    assert.match(orb, /INNER_ORB_RATIO/);
  });
});
