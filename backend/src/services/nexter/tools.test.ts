import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COIN_COSTS, CoinSpendCategory, NEXTER_STUDIO_PATHS } from '@ucbs/shared';
import type { NexterContextSnapshot } from '@ucbs/shared';
import {
  buildActions,
  coinCostForKind,
  detectIncompletePrompt,
  detectOpenStudio,
  detectQuoteKind,
  evaluateGenerationGate,
  extractPreference,
  formatContextForPrompt,
  formatStreamsetGapForPrompt,
  quoteActions,
  recordOwnedByUser,
  recommendFormat,
  warnBadSettings,
  detectLockedTraitOverride,
  detectFakeDetectionRequest,
  detectShowHighlights,
  detectMakeShort,
  detectAnalyzeVideo,
  detectVideoStudioPrep,
  detectTextQuoteIntent,
  detectExternalPublishIntent,
  detectChangeIntent,
  resolveChangeTarget,
  defaultStreamsetQuoteKeys,
} from './tools.service.js';

const emptyCtx: NexterContextSnapshot = {
  coinBalance: 40,
  hasDna: false,
  primaryColors: [],
  projectCount: 0,
  projectNames: [],
  fileCount: 0,
  recentJobs: [],
  missingAssets: [],
};

const dnaCtx: NexterContextSnapshot = {
  ...emptyCtx,
  hasDna: true,
  dnaName: 'NightWolf',
  styleDirection: 'gaming',
  primaryColors: ['#7C3AED'],
  coinBalance: 200,
  projectCount: 1,
  projectNames: ['Twitch Launch'],
};

describe('nexter tools — incomplete prompts', () => {
  it('asks for more detail on vague prompts', () => {
    assert.ok(detectIncompletePrompt('mach'));
    assert.equal(detectIncompletePrompt('Mach mir ein dunkles Wolf-Logo für Twitch mit Lila'), null);
  });

  it('asks for a name when logo request has no DNA', () => {
    const ask = detectIncompletePrompt('Mach mir ein Logo.', emptyCtx);
    assert.match(ask ?? '', /Namen|DNA/i);
  });

  it('does not re-ask logo basics when DNA is known', () => {
    assert.equal(detectIncompletePrompt('Mach mir ein Logo.', dnaCtx), null);
    assert.equal(detectIncompletePrompt('Ich möchte daraus ein Logo machen.', dnaCtx), null);
  });
});

describe('nexter tools — open_studio', () => {
  it('maps Öffne das Logo Studio to /logo-studio', () => {
    assert.equal(detectOpenStudio('Öffne das Logo Studio.'), NEXTER_STUDIO_PATHS.logo);
    assert.equal(detectOpenStudio('Öffne mein Logo Studio.'), NEXTER_STUDIO_PATHS.logo);
  });

  it('maps Shorts intent to /shorts-studio', () => {
    assert.equal(detectOpenStudio('Ich möchte Shorts machen.'), NEXTER_STUDIO_PATHS.shorts);
  });

  it('does not treat generate-logo as navigation', () => {
    assert.equal(detectOpenStudio('Ich möchte daraus ein Logo machen.'), null);
    assert.equal(detectQuoteKind('Ich möchte daraus ein Logo machen.'), 'logo');
  });

  it('emits open_studio with a real path', () => {
    const { actions } = buildActions('Öffne das Logo Studio.', dnaCtx);
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, '/logo-studio');
    assert.equal(open?.autoNavigate, true);
    assert.equal(detectQuoteKind('Öffne das Logo Studio.'), null);
  });

  it('project analysis offers streamset as a click-only action', () => {
    const { actions } = buildActions(
      'Was fehlt meinem Streamset?',
      { ...dnaCtx, missingAssets: ['Starting Soon', 'BRB'] },
      undefined,
      undefined,
      false,
      undefined,
      'PROJECT_ANALYSIS'
    );
    const analyze = actions.find((a) => a.tool === 'analyze_asset');
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.deepEqual(analyze?.payload?.missing, ['Starting Soon', 'BRB']);
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.streamset);
    assert.equal(open?.autoNavigate, false);
    assert.equal(actions.some((a) => a.tool === 'start_generation'), false);
  });

  it('maps Streamset intent to quote kind streamset', () => {
    assert.equal(detectQuoteKind('Soll ich dir daraus ein vollständiges Streamset erstellen?'), 'streamset');
    assert.equal(detectQuoteKind('Mach mir ein komplettes Streamset'), 'streamset');
    assert.equal(detectQuoteKind('Mach mir ein Komplettset'), 'streamset');
    assert.equal(detectQuoteKind('Streamset – 3 Teile'), 'streamset');
    assert.equal(coinCostForKind('streamset'), 200);
    assert.deepEqual(defaultStreamsetQuoteKeys('Mach mir ein Komplettset'), [
      'starting-soon',
      'brb',
      'offline',
      'ending',
      'just-chatting',
      'hud',
      'panel',
      'alert',
      'twitch-banner',
      'youtube-banner',
      'facecam',
      'sticker',
    ]);
    assert.deepEqual(defaultStreamsetQuoteKeys('Streamset – 3 Teile', 'twitch'), [
      'facecam',
      'starting-soon',
      'twitch-banner',
    ]);
  });

  it('maps lifestyle / Zeig mir schwarze Tasse to mockup quote, not navigation', () => {
    assert.equal(detectQuoteKind('Zeig mir schwarze Tasse'), 'mockup');
    assert.equal(detectQuoteKind('Zeig mir eine schwarze Tasse als Lifestyle-Foto'), 'mockup');
    assert.equal(detectQuoteKind('Mach mir eine realistische Lifestyle-Version auf einer schwarzen Tasse.'), 'mockup');
    assert.equal(detectQuoteKind('Zeig mein Logo auf einem Hoodie.'), 'mockup');
    assert.equal(coinCostForKind('mockup'), COIN_COSTS[CoinSpendCategory.MOCKUP_GENERATION]);
    assert.equal(COIN_COSTS[CoinSpendCategory.MOCKUP_GENERATION], 8);
    assert.equal(detectOpenStudio('Zeig mir schwarze Tasse'), null);
  });

  it('maps animation generate vs open studio', () => {
    assert.equal(detectQuoteKind('Animier mein Logo'), 'animation');
    assert.equal(detectQuoteKind('Mach mir daraus ein 10 Sekunden Intro'), 'animation');
    assert.equal(coinCostForKind('animation'), COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION]);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(detectOpenStudio('Öffne das Animation Studio.'), NEXTER_STUDIO_PATHS.animation);
    assert.equal(detectQuoteKind('Öffne das Animation Studio.'), null);
  });

  it('maps text generation to quote kind text from TEXT_GENERATION pricing', () => {
    assert.equal(detectQuoteKind('Mach mir einen TikTok-Text für meinen letzten Short.'), 'text');
    assert.equal(detectQuoteKind('Mach die Caption kürzer.'), 'text');
    assert.equal(detectQuoteKind('3 neue Hooks'), 'text');
    assert.equal(coinCostForKind('text'), COIN_COSTS[CoinSpendCategory.TEXT_GENERATION]);
    assert.equal(COIN_COSTS[CoinSpendCategory.TEXT_GENERATION], 2);
    assert.equal(detectQuoteKind('Öffne das Text Studio.'), null);
    assert.equal(detectOpenStudio('Öffne das Text Studio.'), NEXTER_STUDIO_PATHS.text);
    assert.equal(detectQuoteKind('Öffne das Logo Studio.'), null);
    assert.equal(detectQuoteKind('Gehe zum Video Studio.'), null);
    assert.equal(detectQuoteKind('Zeig mir das Musik Studio.'), null);
  });

  it('maps video analyze to studio, not a paid quote', () => {
    assert.equal(detectOpenStudio('Öffne das Video Studio.'), NEXTER_STUDIO_PATHS.video);
    assert.equal(detectQuoteKind('Analysiere dieses Video'), null);
  });

  it('after a logo job suggests a Streamset pack', () => {
    const { suggestions } = buildActions('Was fehlt noch?', { ...dnaCtx, lastModule: 'logo' });
    assert.ok(suggestions.some((s) => /Komplettset/i.test(s)));
  });
});

describe('nexter tools — quotes and confirmation', () => {
  it('quote_generation uses real COIN_COSTS', () => {
    assert.equal(coinCostForKind('logo'), COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);
    assert.equal(coinCostForKind('streamset'), COIN_COSTS[CoinSpendCategory.STREAMSET_PACK]);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_PACK], 200);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_THREE_PART], 75);
  });

  it('buildActions without quoteId never starts a paid job', () => {
    const { actions } = buildActions('Ich möchte daraus ein Logo machen.', dnaCtx);
    assert.equal(
      actions.some((a) => a.tool === 'start_generation'),
      false
    );
  });

  it('start_generation always requires confirmation and a quoteId', () => {
    const actions = quoteActions('logo', 'quote-abc');
    const start = actions.find((a) => a.tool === 'start_generation');
    const quoted = actions.find((a) => a.tool === 'quote_generation');
    assert.equal(quoted?.coinCost, 15);
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(start?.payload?.quoteId, 'quote-abc');
    assert.match(start?.label ?? '', /15 Coins/);
    assert.ok(actions.some((a) => a.tool === 'cancel_generation'));
  });

  it('mockup quote is 8 coins and points at Mockup Studio', () => {
    const actions = quoteActions('mockup', 'quote-mug');
    const start = actions.find((a) => a.tool === 'start_generation');
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.equal(start?.coinCost, 8);
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(open?.path, '/mockup-studio');
  });

  it('insufficient coins and missing DNA block the gate', () => {
    const base = {
      quoteUserId: 'a',
      requestUserId: 'a',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      coinCost: 15,
      coinBalance: 200,
      hasDna: true,
    };
    assert.equal(evaluateGenerationGate(base), 'ok');
    assert.equal(evaluateGenerationGate({ ...base, hasDna: false }), 'no_dna');
    assert.equal(evaluateGenerationGate({ ...base, coinBalance: 2 }), 'insufficient_coins');
    assert.equal(evaluateGenerationGate({ ...base, status: 'confirmed' }), 'not_pending');
  });
});

describe('nexter tools — isolation', () => {
  it('User A never receives User B records', () => {
    const b = { id: 's1', userId: 'user-b' };
    assert.equal(recordOwnedByUser(b, 'user-a'), null);
    assert.equal(recordOwnedByUser(b, 'user-b')?.id, 's1');
    assert.equal(recordOwnedByUser(null, 'user-a'), null);
    assert.equal(evaluateGenerationGate({
      quoteUserId: 'user-b',
      requestUserId: 'user-a',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      coinCost: 15,
      coinBalance: 999,
      hasDna: true,
    }), 'wrong_user');
  });
});

describe('nexter tools — memory and advice', () => {
  it('stores style prefs but not secrets', () => {
    assert.deepEqual(extractPreference('Ich bevorzuge lila'), { key: 'preferredColor', value: 'lila' });
    assert.equal(extractPreference('Mein Passwort ist hunter2'), null);
    assert.equal(extractPreference('api_key sk-test'), null);
  });

  it('warns on bad typography', () => {
    assert.match(warnBadSettings('Bitte Comic Sans') ?? '', /unprofessionell/);
  });

  it('recommends 9:16 for shorts', () => {
    assert.match(recommendFormat('tiktok shorts') ?? '', /9:16/);
  });
});

describe('nexter context prompt', () => {
  it('includes coin balance and missing DNA', () => {
    const text = formatContextForPrompt(emptyCtx);
    assert.match(text, /Coins: 40/);
    assert.match(text, /Keine Creator DNA/);
    assert.match(text, /Keine Projekte/);
  });

  it('includes creator platforms and interests when present', () => {
    const text = formatContextForPrompt({
      ...dnaCtx,
      preferredPlatforms: ['twitch', 'tiktok'],
      creationInterests: ['logo'],
      stylePreferences: ['neon'],
      creatorGoals: ['community'],
      addressAs: 'Lars',
    });
    assert.match(text, /Creator-Plattformen: twitch, tiktok/);
    assert.match(text, /Möchte erstellen: logo/);
    assert.match(text, /Bevorzugte Stile: neon/);
    assert.match(text, /Creator-Ziele: community/);
    assert.match(text, /Ansprache: Lars/);
  });

  it('includes DNA name and projects when present', () => {
    const text = formatContextForPrompt({ ...dnaCtx, lastModule: 'logo' });
    assert.match(text, /NightWolf/);
    assert.match(text, /Twitch Launch/);
    assert.match(text, /Letzter Job: logo/);
  });

  it('streamset gaps distinguish catalog remainder from a bound project', () => {
    const unbound = formatStreamsetGapForPrompt({
      ...emptyCtx,
      missingAssets: ['Starting Soon', 'BRB'],
    });
    assert.match(unbound, /Kein vollständiges Streamset-Projekt/);
    assert.match(unbound, /Starting Soon, BRB/);
    assert.match(unbound, /kein analysiertes Komplettset-Projekt/);
    const bound = formatStreamsetGapForPrompt({
      ...dnaCtx,
      projectId: 'p1',
      projectName: 'Twitch Launch',
      presentAssets: ['Starting Soon'],
      missingAssets: ['BRB'],
    });
    assert.match(bound, /Aktives Projekt: Twitch Launch/);
    assert.match(bound, /Starting Soon/);
    assert.match(bound, /BRB/);
  });

  it('includes character and lock flags in the prompt context', () => {
    const text = formatContextForPrompt({
      ...dnaCtx,
      dnaSource: 'project',
      projectName: 'NightWolf',
      characterDescription: 'Cyber-Wolf',
      mascot: 'Cyber-Wolf',
      locks: { colors: true, character: true, style: true },
      dnaVersion: 3,
    });
    assert.match(text, /Cyber-Wolf/);
    assert.match(text, /Farben/);
    assert.match(text, /Figur/);
    assert.match(text, /Projekt-DNA/);
  });
});

describe('nexter tools — DNA locks', () => {
  it('refuses color changes when colors are locked', () => {
    const msg = detectLockedTraitOverride('Ändere meine Farben für dieses Design auf Rot.', {
      ...dnaCtx,
      locks: { colors: true },
    });
    assert.match(msg ?? '', /gesperrt/i);
    assert.match(msg ?? '', /Violett|Lila|Magenta|Farbsperre/i);
  });

  it('refuses character swaps when character is locked', () => {
    const msg = detectLockedTraitOverride('Tausche die Figur gegen einen Drachen.', {
      ...dnaCtx,
      mascot: 'Cyber-Wolf',
      locks: { character: true },
    });
    assert.match(msg ?? '', /Figur ist gesperrt/i);
  });

  it('refuses style changes when style is locked', () => {
    const msg = detectLockedTraitOverride('Ändere den Stil auf cartoon.', {
      ...dnaCtx,
      locks: { style: true },
    });
    assert.match(msg ?? '', /Stil ist gesperrt/i);
  });

  it('allows color talk when colors are not locked', () => {
    assert.equal(
      detectLockedTraitOverride('Welche Farben gehören zu meinem Projekt?', dnaCtx),
      null
    );
  });
});

describe('nexter tools — phase F video / animation', () => {
  it('refuses fake kill detection', () => {
    const msg = detectFakeDetectionRequest('Kill erkannt — war das ein Headshot?');
    assert.match(msg ?? '', /nicht verfügbar/i);
    assert.equal(detectFakeDetectionRequest('Zeig mir die besten Stellen'), null);
  });

  it('show highlights and make short intents', () => {
    assert.equal(detectShowHighlights('Zeig mir die besten Stellen aus meinem Video'), true);
    assert.equal(detectMakeShort('Mach Highlight 2 zu einem Short'), true);
    assert.equal(detectAnalyzeVideo('Analysiere dieses Video'), true);
    assert.equal(detectQuoteKind('Analysiere dieses Video'), null);
    const tiktok = detectVideoStudioPrep('Mach daraus einen TikTok-Clip.');
    assert.equal(tiktok?.studio, 'shorts');
    assert.equal(tiktok?.aspectRatio, '9:16');
    const twenty = detectVideoStudioPrep('Nimm die besten 20 Sekunden.');
    assert.equal(twenty?.bestSeconds, 20);
    const intro = detectVideoStudioPrep('Füge mein Intro davor.');
    assert.equal(intro?.wantIntro, true);
  });

  it('animation quote is 25 coins and points at Animation Studio', () => {
    const actions = quoteActions('animation', 'quote-anim');
    const start = actions.find((a) => a.tool === 'start_generation');
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.equal(start?.coinCost, 25);
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(open?.path, '/animation-studio');
  });
});

describe('nexter tools — phase G text / no fake publish', () => {
  it('open text studio is navigation not a quote', () => {
    assert.equal(detectTextQuoteIntent('Öffne das Text Studio.'), false);
    assert.equal(detectQuoteKind('Öffne das Text Studio.'), null);
  });

  it('text quote actions use central pricing and Text Studio path', () => {
    const actions = quoteActions('text', 'quote-text');
    const start = actions.find((a) => a.tool === 'start_generation');
    const quoted = actions.find((a) => a.tool === 'quote_generation');
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.equal(quoted?.coinCost, COIN_COSTS[CoinSpendCategory.TEXT_GENERATION]);
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(start?.payload?.quoteId, 'quote-text');
    assert.equal(open?.path, '/text-studio');
  });

  it('refuses fake external publishing language', () => {
    const msg = detectExternalPublishIntent('Veröffentliche das auf TikTok');
    assert.match(msg ?? '', /nicht verfügbar/i);
    assert.equal(detectExternalPublishIntent('Mach die Caption kürzer.'), null);
  });

  it('context prompt mentions last short and content package', () => {
    const text = formatContextForPrompt({
      ...dnaCtx,
      lastShortId: 'short-1',
      lastShortVideoProjectId: 'vid-1',
      contentPackageId: 'pkg-1',
      contentPackageTitle: 'Night Raid',
    });
    assert.match(text, /short-1/);
    assert.match(text, /Night Raid/);
  });
});

describe('nexter tools — phase H change intent', () => {
  it('resolves last logo / darker banner / facecam-only and does not pack a streamset', () => {
    const logo = detectChangeIntent('Mach mein letztes Logo dunkler.');
    assert.equal(logo?.kind, 'logo');
    assert.equal(logo?.wantsLatest, true);
    const banner = detectChangeIntent('Mach den Banner aggressiver.');
    assert.equal(banner?.kind, 'banner');
    const face = detectChangeIntent('Ändere nur die Facecam aus meinem Streamset.');
    assert.equal(face?.kind, 'facecam');
    assert.equal(face?.facecamOnly, true);
    // detectQuoteKind would still see "Streamset" — conversation must resolve change first.
    assert.equal(detectQuoteKind('Ändere nur die Facecam aus meinem Streamset.'), 'streamset');
    assert.equal(detectChangeIntent('Soll ich dir daraus ein vollständiges Streamset erstellen?'), null);
    assert.equal(detectChangeIntent('Mach das ganze Set dunkler.'), null);
  });

  it('caption revision stays on the text system', () => {
    assert.equal(detectChangeIntent('Mach die Caption kürzer.'), null);
    assert.equal(detectQuoteKind('Mach die Caption kürzer.'), 'text');
  });

  it('asks when several logos exist and the user did not say last', () => {
    const asked = resolveChangeTarget({ ...dnaCtx, lastLogoId: 'logo-a', logoCount: 2 }, 'logo', false);
    assert.ok('ask' in asked);
    const latest = resolveChangeTarget({ ...dnaCtx, lastLogoId: 'logo-a', logoCount: 2 }, 'logo', true);
    assert.deepEqual(latest, { jobId: 'logo-a' });
  });

  it('change quote actions use module price and honest KI-Variante label', () => {
    const actions = quoteActions('logo', 'quote-change', true);
    const start = actions.find((a) => a.tool === 'start_generation');
    assert.equal(start?.coinCost, COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);
    assert.match(start?.label ?? '', /KI-Variante/);
    assert.equal(start?.payload?.changeRequest, true);
    assert.equal(coinCostForKind('logo') !== COIN_COSTS[CoinSpendCategory.AI_IMAGE], true);
  });
});

describe('nexter tools — music intent vs animation / logo', () => {
  it('A: epic gaming stream-intro song is music, not animation', () => {
    assert.equal(
      detectQuoteKind(
        'Erstelle mir einen 30 Sekunden langen epischen Gaming-Song für mein Stream-Intro ohne Gesang.'
      ),
      'music'
    );
  });

  it('B: animated intro from logo stays animation', () => {
    assert.equal(
      detectQuoteKind('Erstelle mir ein animiertes 15 Sekunden Intro aus meinem Logo.'),
      'animation'
    );
  });

  it('C: YouTube background music is music', () => {
    assert.equal(detectQuoteKind('Mach Hintergrundmusik für mein YouTube Video.'), 'music');
  });

  it('D: gaming logo stays logo', () => {
    assert.equal(detectQuoteKind('Erstelle mir ein Gaming Logo.'), 'logo');
  });

  it('music for intro beats animation', () => {
    assert.equal(detectQuoteKind('Erstelle Musik für mein Intro'), 'music');
    assert.equal(detectQuoteKind('Ich brauche Musik für mein Intro'), 'music');
    assert.equal(detectQuoteKind('Mach mir ein Jingle'), 'music');
    assert.equal(detectQuoteKind('Erstelle BGM für mein YouTube Video'), 'music');
    assert.equal(detectQuoteKind('Mach mir Musik für meinen Stream'), 'music');
    assert.equal(detectQuoteKind('Erstelle mir einen Song'), 'music');
    assert.equal(detectQuoteKind('Mach mir einen Gaming-Song'), 'music');
  });

  it('music quotes use AI_MUSIC coins and Musik Studio', () => {
    assert.equal(coinCostForKind('music'), COIN_COSTS[CoinSpendCategory.AI_MUSIC]);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    const actions = quoteActions('music', 'quote-music');
    const start = actions.find((a) => a.tool === 'start_generation');
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.equal(start?.coinCost, 10);
    assert.equal(start?.requiresConfirmation, true);
    assert.equal(open?.path, '/ai-music');
  });

  it('voiceover is voice, not animation or music', () => {
    assert.equal(detectQuoteKind('Sprich folgenden Text als Voiceover: Willkommen.'), 'voice');
    assert.equal(detectQuoteKind('Mach ein Voiceover für mein Intro.'), 'voice');
    assert.equal(coinCostForKind('voice'), COIN_COSTS[CoinSpendCategory.AI_VOICE]);
    const actions = quoteActions('voice', 'quote-voice');
    const open = actions.find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, '/ai-voice');
  });

  it('maps open Musik Studio to /ai-music, not animation', () => {
    assert.equal(detectOpenStudio('Öffne das Musik Studio.'), NEXTER_STUDIO_PATHS.music);
    assert.equal(detectQuoteKind('Öffne das Musik Studio.'), null);
  });
});

