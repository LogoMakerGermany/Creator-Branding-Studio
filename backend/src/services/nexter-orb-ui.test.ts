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

  it('1. NexterOrb renders a canvas glass orb with a center N', () => {
    assert.match(orb, /export function NexterOrb/);
    assert.match(orb, /canvasRef/);
    assert.match(orb, /nexter-orb__glass/);
    assert.match(orb, />\s*N\s*</);
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
    assert.match(css, /44cqmin/);
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
  });

  it('29-30. mobile stays compact and desktop orb is prominent without covering chat', () => {
    assert.match(page, /h-\[4\.75rem\] w-\[4\.75rem\]/);
    assert.match(page, /sm:h-36 sm:w-36/);
    assert.match(page, /lg:h-64 lg:w-64/);
    assert.match(page, /overflow-x-hidden/);
    assert.match(page, /minmax\(0,1fr\)/);
    assert.match(page, /nexterOrbStatusLabel/);
  });

  it('connects real Nexter states, pauses when hidden, and cleans up rAF', () => {
    assert.match(orb, /document\.hidden/);
    assert.match(orb, /visibilitychange/);
    assert.match(orb, /cancelAnimationFrame/);
    assert.match(orb, /requestAnimationFrame/);
    assert.match(orb, /removeEventListener/);
    assert.match(orb, /ResizeObserver/);
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
