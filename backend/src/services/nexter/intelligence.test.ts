import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStructuredStudioPrompt,
  detectDnaChangeScope,
  detectKnownFactFollowUp,
  detectNameBasedLogoHelp,
  describeDnaContinuity,
  dnaUpdateConfirmationPrompt,
  formatLogoDirectionReply,
  qualityInstructionsForStyle,
  qualityNegativesForStyle,
  resolveNexterQualityMode,
  suggestLogoDirections,
  detectStudioChangeScope,
  targetsForStudioChange,
} from '@ucbs/shared';
import { getOrCreateUser } from '../user.service.js';
import { upsertDna, getActiveDna } from '../dna.service.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
import { buildNexterContext } from './context.service.js';
import {
  buildActions,
  detectChangeIntent,
  detectIncompletePrompt,
  formatContextForPrompt,
  quoteActions,
  recommendFormat,
  recordOwnedByUser,
} from './tools.service.js';
import {
  createNexterSession,
  getNexterSessionForUser,
  nexterChat,
} from './conversation.service.js';
import { listMemory, storeMemory } from './memory.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

const emptyCtx = {
  coinBalance: 40,
  hasDna: false,
  primaryColors: [] as string[],
  projectCount: 0,
  projectNames: [] as string[],
  fileCount: 0,
  recentJobs: [] as never[],
  missingAssets: [] as string[],
};

describe('nexter creator DNA intelligence', () => {
  it('preferences flow into Nexter context', async () => {
    const user = await getOrCreateUser(`intel-pref-${randomUUID()}`, 'pref@intel.test', 'Lars');
    await updateNexterPreferencesForUser(user.id, {
      addressAs: 'Lars',
      platforms: ['twitch', 'tiktok'],
      creationInterests: ['logo', 'facecam'],
      stylePreferences: ['neon'],
      creatorGoals: ['brand'],
      customPrimary: '#1e40af',
      customAccent: '#22d3ee',
    });
    const ctx = await buildNexterContext(user.id);
    assert.equal(ctx.addressAs, 'Lars');
    assert.deepEqual(ctx.preferredPlatforms, ['twitch', 'tiktok']);
    assert.deepEqual(ctx.creationInterests, ['logo', 'facecam']);
    assert.deepEqual(ctx.stylePreferences, ['neon']);
    assert.deepEqual(ctx.creatorGoals, ['brand']);
    assert.equal(ctx.customPrimary, '#1e40af');
    const prompt = formatContextForPrompt(ctx);
    assert.match(prompt, /twitch/);
    assert.match(prompt, /neon/);
  });

  it('creator DNA flows into context', async () => {
    const user = await getOrCreateUser(`intel-dna-${randomUUID()}`, 'dna@intel.test', 'Wolf');
    await upsertDna({
      userId: user.id,
      name: 'NightWolf',
      mascot: 'Cyber-Wolf',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF', '#111827'],
      brandingStyle: 'aggressive esports',
      visualLanguage: 'sharp neon edges',
    });
    const ctx = await buildNexterContext(user.id);
    assert.equal(ctx.hasDna, true);
    assert.equal(ctx.dnaName, 'NightWolf');
    assert.equal(ctx.mascot, 'Cyber-Wolf');
    assert.deepEqual(ctx.primaryColors.slice(0, 2), ['#1E40AF', '#111827']);
    assert.match(formatContextForPrompt(ctx), /NightWolf/);
  });

  it('does not load another user\'s DNA', async () => {
    const a = await getOrCreateUser(`intel-iso-a-${randomUUID()}`, 'a@intel.test', 'Ada');
    const b = await getOrCreateUser(`intel-iso-b-${randomUUID()}`, 'b@intel.test', 'Ben');
    await upsertDna({
      userId: a.id,
      name: 'NightWolf',
      mascot: 'Wolf',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF'],
    });
    await upsertDna({
      userId: b.id,
      name: 'OtherBrand',
      mascot: 'Drache',
      styleDirection: 'fantasy',
      primaryColors: ['#dc2626'],
    });
    const ctxA = await buildNexterContext(a.id);
    const ctxB = await buildNexterContext(b.id);
    assert.equal(ctxA.dnaName, 'NightWolf');
    assert.equal(ctxB.dnaName, 'OtherBrand');
    assert.equal(ctxA.mascot, 'Wolf');
    assert.notEqual(ctxA.dnaName, ctxB.dnaName);
    assert.equal(ctxA.dnaId === ctxB.dnaId, false);
  });

  it('does not re-ask known colors', () => {
    const follow = detectKnownFactFollowUp('Welche Farben möchtest du?', {
      ...emptyCtx,
      primaryColors: ['#1E40AF', '#22c55e'],
    });
    assert.match(follow ?? '', /Blau-Grün|bleiben/i);
    assert.equal(
      detectIncompletePrompt('Mach mir ein Logo.', {
        ...emptyCtx,
        hasDna: true,
        dnaName: 'NightWolf',
        primaryColors: ['#1E40AF'],
      }),
      null
    );
  });

  it('asks when an important character choice is missing', () => {
    const ask = detectKnownFactFollowUp('Ich weiß nicht, was für eine Figur ins Logo soll.', emptyCtx);
    assert.match(ask ?? '', /menschlich, tierisch oder komplett abstrakt/i);
    assert.equal(
      detectKnownFactFollowUp('Ich weiß nicht, was für eine Figur ins Logo soll.', {
        ...emptyCtx,
        hasDna: true,
        mascot: 'Cyber-Wolf',
        primaryColors: ['#1E40AF'],
      }),
      null
    );
  });

  it('reuses existing DNA for follow-on assets', () => {
    const line = describeDnaContinuity(
      {
        hasDna: true,
        dnaName: 'NightWolf',
        mascot: 'Wolf',
        styleDirection: 'neon',
        primaryColors: ['#1E40AF', '#111827'],
      },
      'einen Facecam-Rahmen'
    );
    assert.match(line ?? '', /Wolf/);
    assert.match(line ?? '', /Facecam/);
    assert.match(line ?? '', /zusammenpasst/);
  });

  it('treats size/transparency edits as project changes, not a new DNA write', () => {
    const change = detectChangeIntent('Mach die Figur kleiner.', {
      lastLogoId: 'logo-1',
      lastModule: 'logo',
    });
    assert.equal(change?.kind, 'logo');
    const transparent = detectChangeIntent('Mach den Hintergrund transparent.', {
      lastLogoId: 'logo-1',
      lastModule: 'logo',
    });
    assert.equal(transparent?.kind, 'logo');
    const conv = src('conversation.service.ts');
    assert.equal(conv.includes('updateDna('), false);
    assert.equal(conv.includes('restoreDnaVersion'), false);
  });

  it('permanent DNA updates need an explicit confirmation prompt', () => {
    assert.equal(detectDnaChangeScope('Dieses Logo diesmal rot.'), 'ask-confirm');
    assert.equal(detectDnaChangeScope('Speichere Rot dauerhaft in meiner Creator DNA.'), 'explicit-dna');
    assert.match(dnaUpdateConfirmationPrompt('Dieses Logo diesmal rot.'), /nur für dieses Projekt|Creator-DNA/i);
    assert.equal(src('conversation.service.ts').includes('updateDna('), false);
  });

  it('distinguishes asset change, set change, and DNA change', () => {
    assert.equal(detectStudioChangeScope('Mach die Figur 40 % kleiner.'), 'asset');
    assert.equal(detectStudioChangeScope('Name kleiner'), 'asset');
    assert.equal(detectStudioChangeScope('Mach das ganze Set dunkler.'), 'set');
    assert.equal(detectStudioChangeScope('Speichere Rot dauerhaft in meiner Creator DNA.'), 'dna');
    assert.deepEqual(
      targetsForStudioChange('asset', { selectedAssetKey: 'facecam', selectedKeys: ['facecam', 'hud'] }),
      ['facecam']
    );
    assert.deepEqual(
      targetsForStudioChange('set', { selectedAssetKey: 'facecam', selectedKeys: ['facecam', 'hud', 'brb'] }),
      ['facecam', 'hud', 'brb']
    );
    assert.deepEqual(targetsForStudioChange('dna', { selectedKeys: ['facecam'] }), []);
  });

  it('quality profile respects chosen style and does not force cinematic 3D on minimal', () => {
    assert.equal(resolveNexterQualityMode('minimal'), 'clean-premium');
    assert.equal(resolveNexterQualityMode('gaming', ['ultra-cinematic']), 'cinematic-premium');
    const min = qualityInstructionsForStyle('minimal');
    const neg = qualityNegativesForStyle('minimal');
    assert.match(min, /restrained|negative space|crisp/i);
    assert.doesNotMatch(min, /ultra-cinematic/i);
    assert.match(neg, /ultra-cinematic 3D/i);
    const cine = qualityInstructionsForStyle('gaming');
    assert.match(cine, /ultra-cinematic/i);
    const prompt = buildStructuredStudioPrompt({
      assetType: 'logo',
      style: 'minimal',
      quality: min,
      negatives: neg,
      colors: '#111111, #eeeeee',
    });
    assert.match(prompt, /1\. Asset Type/);
    assert.match(prompt, /8\. Quality Profile/);
    assert.doesNotMatch(prompt, /ultra-cinematic, high-end 3D materials/i);
  });

  it('uses stored platform context when the message has no platform', () => {
    const fromPrefs = recommendFormat('Mach mir ein Video.', { preferredPlatforms: ['tiktok'] });
    assert.match(fromPrefs ?? '', /9:16|1080×1920|TikTok/i);
    assert.match(recommendFormat('Twitch Overlay') ?? '', /Twitch/i);
  });

  it('offers name-based logo directions without starting a job', async () => {
    assert.equal(
      detectNameBasedLogoHelp('Ich weiß gar nicht, was für ein Logo zu meinem Namen passen würde.'),
      true
    );
    const help = suggestLogoDirections({
      name: 'NightWolf',
      platforms: ['twitch'],
      stylePreferences: ['neon'],
      creatorGoals: ['brand'],
      dnaStyle: 'neon',
      mascot: 'Wolf',
    });
    assert.ok(help.directions.length >= 1 && help.directions.length <= 3);
    assert.match(formatLogoDirectionReply(help), /NightWolf/);
    assert.match(formatLogoDirectionReply(help), /nichts generiert/i);
    const user = await getOrCreateUser(`intel-name-${randomUUID()}`, 'name@intel.test', 'NightWolf');
    await updateNexterPreferencesForUser(user.id, { addressAs: 'NightWolf', platforms: ['twitch'] });
    const session = await nexterChat(
      user.id,
      'Ich weiß gar nicht, was für ein Logo zu meinem Namen passen würde.'
    );
    const last = session.messages[session.messages.length - 1];
    assert.equal(last.role, 'assistant');
    assert.match(last.content, /Richtungen|NightWolf/i);
    assert.equal((last.actions ?? []).some((a) => a.tool === 'start_generation'), false);
  });

  it('paid tools still require a conscious confirmed action', () => {
    const actions = quoteActions('facecam', 'quote-face');
    const start = actions.find((a) => a.tool === 'start_generation');
    assert.equal(start?.requiresConfirmation, true);
    assert.ok(start?.coinCost && start.coinCost > 0);
    const conv = src('conversation.service.ts');
    assert.equal(conv.includes('confirmQuote'), false);
    const { actions: built } = buildActions('Mach mir einen Facecam-Rahmen.', {
      ...emptyCtx,
      hasDna: true,
      dnaName: 'NightWolf',
      primaryColors: ['#1E40AF'],
    });
    assert.equal(built.some((a) => a.tool === 'start_generation' && !a.requiresConfirmation), false);
  });

  it('conversation and memory stay user-isolated', async () => {
    const a = await getOrCreateUser(`intel-sess-a-${randomUUID()}`, 'sa@intel.test', 'Ada');
    const b = await getOrCreateUser(`intel-sess-b-${randomUUID()}`, 'sb@intel.test', 'Ben');
    const session = await createNexterSession(a.id);
    assert.ok(await getNexterSessionForUser(session.id, a.id));
    assert.equal(await getNexterSessionForUser(session.id, b.id), null);
    await storeMemory(a.id, 'preferredColor', 'blue', 'preference');
    const memB = await listMemory(b.id);
    assert.equal(memB.some((m) => m.key === 'preferredColor' && m.value === 'blue'), false);
    assert.equal(recordOwnedByUser({ userId: a.id, id: 'x' }, b.id), null);
  });

  it('project-only color talk does not mutate stored DNA', async () => {
    const user = await getOrCreateUser(`intel-dnasafe-${randomUUID()}`, 'safe@intel.test', 'Lia');
    const dna = await upsertDna({
      userId: user.id,
      name: 'NightWolf',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF'],
    });
    const before = dna.primaryColors.slice();
    await nexterChat(user.id, 'Dieses Logo diesmal rot.');
    const after = await getActiveDna(user.id);
    assert.deepEqual(after?.primaryColors, before);
  });
});
