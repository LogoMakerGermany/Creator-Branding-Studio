import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clampNexterAudioLevel,
  CoinSpendCategory,
  COIN_COSTS,
  isNexterOrbState,
  NEXTER_ORB_STATES,
  nexterOrbStatusLabel,
  resolveNexterOrbState,
} from '@ucbs/shared';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('nexter plasma orb UI — visual only', () => {
  const orb = repo('frontend/src/components/nexter/NexterOrb.tsx');
  const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
  const page = repo('frontend/src/pages/nexter/NexterPage.tsx');
  const css = repo('frontend/src/index.css');
  const appearance = repo('frontend/src/lib/nexter-appearance.ts');
  const store = repo('frontend/src/v2/store/nexter-store.ts');
  const shared = repo('shared/src/nexter.ts');

  it('1. NexterOrb renders a canvas glass orb', () => {
    assert.match(orb, /export function NexterOrb/);
    assert.match(orb, /canvasRef/);
    assert.match(orb, /nexter-orb__glass/);
  });

  for (const state of NEXTER_ORB_STATES) {
    it(`${state} is a supported orb state`, () => {
      assert.equal(isNexterOrbState(state), true);
      assert.match(shared, new RegExp(`'${state}'`));
      assert.equal(typeof nexterOrbStatusLabel(state), 'string');
      assert.match(orb, new RegExp(`['"]${state}['"]|${state}:`));
    });
  }

  it('10. invalid state does not crash and falls back to idle', () => {
    assert.equal(resolveNexterOrbState('not-a-state'), 'idle');
    assert.equal(resolveNexterOrbState(undefined), 'idle');
    assert.equal(resolveNexterOrbState(null), 'idle');
    assert.match(orb, /resolveNexterOrbState/);
    assert.doesNotMatch(orb, /STATE_LABEL\[state\]/);
  });

  it('11-14. audioLevel is clamped to 0..1', () => {
    assert.equal(clampNexterAudioLevel(0), 0);
    assert.equal(clampNexterAudioLevel(1), 1);
    assert.equal(clampNexterAudioLevel(-0.4), 0);
    assert.equal(clampNexterAudioLevel(2.5), 1);
    assert.equal(clampNexterAudioLevel(Number.NaN), 0);
    assert.match(orb, /clampNexterAudioLevel/);
    assert.match(store, /clampNexterAudioLevel/);
  });

  it('15-17. theme primary/secondary and default blue/violet are used', () => {
    assert.match(orb, /primaryColor/);
    assert.match(orb, /secondaryColor/);
    assert.match(orb, /--nexter-orb-primary/);
    assert.match(orb, /--nexter-orb-secondary/);
    assert.match(orb, /#3b82f6/);
    assert.match(orb, /#a855f7/);
    assert.match(appearance, /--nexter-orb-primary/);
    assert.match(appearance, /--nexter-orb-secondary/);
    assert.match(css, /font-size: 26cqmin;/);
    assert.match(css, /\.nexter-orb--identity \.nexter-orb__mark \{[\s\S]*?font-size: 48cqmin;/);
    assert.match(css, /mix-blend-mode: plus-lighter/);
    assert.match(css, /container-type: size/);
  });

  it('18. reduced motion is respected', () => {
    assert.match(orb, /prefers-reduced-motion: reduce/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /\.nexter-orb__glass/);
  });

  it('19-22. orb has no API, Firestore, coin, or provider calls', () => {
    assert.doesNotMatch(orb, /api\.nexter|confirmQuote|openai|firestore|deductAmount|stripe|paypal|fetch\(/i);
    assert.doesNotMatch(orb, /getUserMedia|AudioContext|whisper|elevenlabs/i);
    assert.doesNotMatch(orb, /from 'three'|three\.js/i);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
  });

  it('23-28. chat, send, quick actions, quotes, coins, and error UI stay present', () => {
    assert.match(page, /NexterPanel/);
    assert.match(panel, /aria-label="Nachricht an Nexter"/);
    assert.match(panel, /aria-label="Senden"/);
    assert.match(panel, /m\.suggestions/);
    assert.match(panel, /QuoteCard/);
    assert.match(panel, /formatCoins\(coinBalance\)/);
    assert.match(panel, /role="alert"/);
    assert.match(panel, /Erneut versuchen/);
    assert.match(panel, /toggleListen/);
    assert.match(panel, /setOrbState\('speaking'\)/);
    assert.match(panel, /pulse\('error'\)/);
    assert.match(panel, /setOrbState\('generating'\)/);
    assert.match(panel, /setOrbState\('thinking'\)/);
    assert.match(panel, /setOrbState\('listening'\)/);
    assert.match(panel, /variant="identity"/);
    assert.doesNotMatch(panel, /<canvas/);
  });

  it('living plasma orb uses two energy eyes instead of a center N', () => {
    assert.match(orb, /function drawEyes/);
    assert.match(orb, /function eyeOpenAmount/);
    assert.match(orb, /function drawPlatform/);
    assert.match(orb, /function drawEnergyRing/);
    assert.match(orb, /function strokeLightning/);
    assert.match(orb, /faceSafeZone/);
    assert.match(orb, /energyR \* 0\.73/);
    assert.match(orb, /#6D28FF/);
    assert.match(orb, /#03030B/);
    assert.match(orb, /gfx\.ellipse\(/);
    assert.match(orb, /for \(const side of \[-1, 1\]/);
    assert.match(orb, /identity \? \(/);
    assert.match(orb, />\s*N\s*</);
    assert.match(orb, /variant === 'identity'/);
    assert.doesNotMatch(orb, /fillText\(/);
    assert.doesNotMatch(orb, /nexter-orb__specular/);
    assert.doesNotMatch(orb, /pupil|iris|eyelash|mouth|smiley/i);
    assert.match(panel, /variant="identity"/);
    assert.match(panel, /nexter-orb--identity-compact/);
    assert.match(css, /\.nexter-orb--identity \.nexter-orb__mark \{[\s\S]*?font-size: 48cqmin;/);
  });

  it('chat header uses a static identity mark without a second canvas animation', () => {
    assert.match(orb, /variant === 'identity'/);
    assert.match(css, /nexter-orb--identity/);
    assert.match(panel, /nexter-orb--identity-compact/);
    assert.match(page, /<NexterOrb state=\{resolved\} audioLevel=\{audioLevel\} responsive/);
  });

  it('29-30. mobile stays compact and desktop orb is prominent without covering chat', () => {
    assert.match(page, /h-\[9\.5rem\] w-\[9\.5rem\]/);
    assert.match(page, /sm:h-\[12\.25rem\] sm:w-\[12\.25rem\]/);
    assert.match(page, /lg:h-\[20\.625rem\] lg:w-\[20\.625rem\]/);
    assert.doesNotMatch(page, /lg:h-\[17rem\]/);
    assert.match(page, /overflow-x-hidden/);
    assert.match(page, /minmax\(0,1fr\)/);
    assert.match(page, /nexter-orb-status/);
    assert.doesNotMatch(page, /variant="identity"/);
  });

  it('reference orb keeps organic external lightning, a 3D ring, and a face-safe inner body', () => {
    assert.match(orb, /gfx\.clip\(\)/);
    assert.match(orb, /bezierCurveTo/);
    assert.match(orb, /strokeLightning/);
    assert.match(orb, /drawPlatform/);
    assert.match(orb, /drawEnergyRing/);
    assert.match(orb, /faceSafeZone/);
    assert.doesNotMatch(orb, /strokeArc/);
    assert.doesNotMatch(orb, /\(i \* Math\.PI \* 2\) \/ count/);
    assert.match(orb, /prefers-reduced-motion: reduce/);
    assert.match(orb, /eyeOpenAmount\(t, reduceMotion\)/);
    assert.match(css, /nexter-orb--responsive \.nexter-orb__glass/);
  });

  it('connects real Nexter states, pauses when hidden, and cleans up rAF', () => {
    assert.match(orb, /document\.hidden/);
    assert.match(orb, /visibilitychange/);
    assert.match(orb, /cancelAnimationFrame/);
    assert.match(orb, /requestAnimationFrame/);
    assert.match(orb, /removeEventListener/);
    assert.match(panel, /recording \? 'listening'/);
    assert.match(panel, /orbState === 'generating' \? 'generating' : 'thinking'/);
  });

  it('does not change frozen pricing, welcome bonus, or payments', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_THREE_PART], 75);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_PACK], 200);
    assert.doesNotMatch(orb, /STREAMSET_PACK|streamset_three_part|getDefaultFreeCoins/);
    assert.doesNotMatch(page, /confirmQuote|deductAmount|OPENAI_API_KEY/);
  });
});
