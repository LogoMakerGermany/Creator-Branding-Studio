import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREAMSET_PACK_ITEMS } from '@ucbs/shared';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('landing page local closure', () => {
  const landing = repo('frontend/src/pages/landing/LandingPage.tsx');
  const html = repo('frontend/index.html');
  const routes = repo('frontend/src/routes/index.tsx');
  const legal = repo('frontend/src/pages/legal/LegalPage.tsx');

  it('renders as the existing public landing with truthful positioning', () => {
    assert.match(routes, /path="\/" element=\{<LandingPage/);
    assert.match(landing, /NEXTER Creator Studio/);
    assert.match(landing, /Geschlossene Creator-Beta/);
    assert.match(landing, /persönlichen KI-Assistenten Nexter/);
    assert.match(landing, /<h1/);
    assert.equal((landing.match(/<h1/g) || []).length, 1);
    assert.match(landing, /id="funktionen"/);
    assert.match(landing, /id="nexter"/);
    assert.match(landing, /id="studios"/);
    assert.match(landing, /id="faq"/);
    assert.equal(landing.includes("from 'firebase/firestore'"), false);
    assert.equal(landing.includes("from 'firebase/storage'"), false);
  });

  it('uses registration status, invite-only CTA, and auth gates', () => {
    assert.match(landing, /Mit Einladung starten/);
    assert.match(landing, /registrationStatus/);
    assert.match(landing, /resolveAuthGate/);
    assert.match(landing, /AUTH_GATE_PATH/);
    assert.match(landing, /Zum Dashboard/);
    assert.match(landing, /Onboarding fortsetzen/);
    assert.match(landing, /authLoading/);
    assert.match(landing, /authReady/);
    assert.match(landing, /Sitzung wird geprüft/);
    assert.match(landing, /label: 'Start'/);
    assert.match(landing, /\.catch\(\(\) => \{/);
    assert.equal(landing.includes('Kostenlos starten'), false);
    assert.equal(landing.includes('Coins jetzt kaufen'), false);
    assert.equal(landing.includes('stripe.checkout'), false);
    assert.equal(landing.includes('paypal.checkout'), false);
  });

  it('describes studios, streamset catalog, mockup modes, and no auto-publish', () => {
    assert.match(landing, /Creator DNA/);
    assert.match(landing, /Logo Studio/);
    assert.match(landing, /400×400/);
    assert.match(landing, /Banner Studio/);
    assert.match(landing, /Facecam Studio/);
    assert.match(landing, /nicht dasselbe wie ein vollständiges Overlay/);
    assert.match(landing, /Overlay Studio/);
    assert.match(landing, /Sticker, Badge & Emote/);
    assert.match(landing, /STREAMSET_PACK_ITEMS\.map/);
    assert.equal(STREAMSET_PACK_ITEMS.length, 12);
    assert.deepEqual(
      STREAMSET_PACK_ITEMS.map((i) => i.key),
      [
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
      ]
    );
    assert.equal(landing.toLowerCase().includes('social bar'), false);
    assert.equal(landing.toLowerCase().includes('goal bar'), false);
    assert.match(landing, /Local Composite/);
    assert.match(landing, /Lifestyle-Mockup/);
    assert.match(landing, /0 Coins/);
    assert.match(landing, /FFmpeg/);
    assert.match(landing, /Nexter-Stimmenpräferenz/);
    assert.match(landing, /Lokale Preview/);
    assert.match(landing, /Kein automatisches Posten/);
    assert.match(landing, /nicht automatisch veröffentlicht/);
    assert.match(landing, /Projects Hub/);
    assert.match(landing, /Kein unbegrenzter Speicher/);
    assert.match(landing, /ohne das Original zu überschreiben/);
    assert.match(landing, /Kosten werden vor einer Generierung angezeigt/);
    assert.match(landing, /Käufe sind derzeit nicht verfügbar/);
    assert.equal(/veröffentlicht automatisch|auto-publish|direkt auf TikTok/.test(landing), false);
  });

  it('has FAQ, legal draft links, navigation, a11y and no fake social proof', () => {
    assert.match(landing, /Was ist Nexter\?/);
    assert.match(landing, /Was ist Creator DNA\?/);
    assert.match(landing, /Wie funktionieren Coins\?/);
    assert.match(landing, /Ist die App schon öffentlich verfügbar\?/);
    assert.match(landing, /keine automatische Abbuchung ohne Bestätigung/);
    assert.match(landing, /\/legal\/impressum/);
    assert.match(landing, /\/legal\/datenschutz/);
    assert.match(landing, /\/legal\/agb/);
    assert.match(landing, /Entwürfe, keine geprüften Finalfassungen/);
    assert.match(legal, /draft/);
    assert.match(landing, /aria-label="Öffentliche Navigation"/);
    assert.match(landing, /aria-label=\{menuOpen \? 'Menü schließen' : 'Menü öffnen'\}/);
    assert.match(landing, /Escape/);
    assert.match(landing, /useReducedMotion/);
    assert.match(landing, /Zum Inhalt/);
    assert.equal(landing.includes('10.000'), false);
    assert.equal(landing.includes('Millionen'), false);
    assert.equal(landing.includes('Testimonial'), false);
    assert.equal(landing.includes('★★★'), false);
    assert.equal(/besser als Twitch|einzigartig weltweit/.test(landing), false);
    assert.equal(landing.includes('100 % sicher'), false);
    assert.equal(landing.includes('unknackbar'), false);
    assert.equal(landing.includes('github.com'), false);
    assert.equal(landing.includes('user.email'), false);
    assert.equal(landing.includes('coinBalance'), false);
  });

  it('seo basics, public APIs only, no providers or payments', () => {
    assert.match(html, /<title>NEXTER Creator Studio<\/title>/);
    assert.match(html, /meta name="description"/);
    assert.match(html, /og:title/);
    assert.match(html, /viewport/);
    assert.equal(html.includes('itemtype="http://schema.org/Review"'), false);
    assert.equal(landing.includes('/api/v1/admin'), false);
    assert.equal(landing.includes('api.auth.me'), false);
    assert.equal(landing.includes('api.stripe'), false);
    assert.equal(landing.includes('openai.com'), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
  });
});
