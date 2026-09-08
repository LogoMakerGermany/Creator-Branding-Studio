import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NEXTER_VOICE_CATALOG_ID } from '@ucbs/shared';
import { getOrCreateUser, getUserById } from '../user.service.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
import {
  __resetVoiceCatalogCacheForTests,
  __setElevenLabsVoicesLoaderForTests,
  catalogIdForProviderVoice,
  listPublicNexterVoices,
  resolveProviderVoiceId,
} from './voice-catalog.service.js';
import { getElevenLabsVoiceId } from '../../config/env.js';
import { detectQuoteKind } from './tools.service.js';

process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../../..');

afterEach(() => {
  __setElevenLabsVoicesLoaderForTests(null);
  __resetVoiceCatalogCacheForTests();
});

function fixtureVoice(i: number) {
  const gender = i % 3 === 0 ? 'female' : i % 3 === 1 ? 'male' : 'neutral';
  return {
    voice_id: `fixture_voice_secret_${String(i).padStart(3, '0')}_zzzzzzzz`,
    name: `Fixture Voice ${i}`,
    category: 'premade',
    labels: {
      gender,
      accent: 'american',
      descriptive: gender === 'male' ? 'calm' : gender === 'female' ? 'warm' : 'balanced',
    },
    verified_languages: i < 5 ? [{ language: 'de' }, { language: 'en' }] : [{ language: 'en' }],
    preview_url: i === 0 ? 'https://cdn.example.test/preview.mp3' : undefined,
  };
}

function fixtureList(count: number) {
  return Array.from({ length: count }, (_, i) => fixtureVoice(i));
}

describe('nexter dynamic voice catalog', () => {
  it('A) official voice list shape is loaded via GET /v1/voices mapper', async () => {
    const list = fixtureList(4);
    __setElevenLabsVoicesLoaderForTests(async () => list);
    const pub = await listPublicNexterVoices();
    const remote = pub.filter((v) => v.catalogId.startsWith('el-'));
    assert.equal(remote.length, list.length);
  });

  it('B) every provider voice from a 21-item fixture is mapped (count not hardcoded in production)', async () => {
    const list = fixtureList(21);
    __setElevenLabsVoicesLoaderForTests(async () => list);
    const pub = await listPublicNexterVoices();
    const remote = pub.filter((v) => v.catalogId.startsWith('el-'));
    assert.equal(remote.length, list.length);
    assert.equal(list.length, 21);
  });

  it('C) male / female / neutral metadata is copied', async () => {
    __setElevenLabsVoicesLoaderForTests(async () => fixtureList(6));
    const pub = await listPublicNexterVoices();
    const remote = pub.filter((v) => v.catalogId.startsWith('el-'));
    assert.equal(remote.filter((v) => v.gender === 'female').length, 2);
    assert.equal(remote.filter((v) => v.gender === 'male').length, 2);
    assert.equal(remote.filter((v) => v.gender === 'neutral').length, 2);
  });

  it('D) German verified_languages are marked germanAvailable', async () => {
    __setElevenLabsVoicesLoaderForTests(async () => fixtureList(8));
    const pub = await listPublicNexterVoices();
    const remote = pub.filter((v) => v.catalogId.startsWith('el-'));
    assert.equal(remote.filter((v) => v.germanAvailable).length, 5);
    assert.ok(remote.filter((v) => v.germanAvailable).every((v) => v.languages?.includes('de')));
  });

  it('E) public catalog JSON contains no provider voice ids', async () => {
    const list = fixtureList(3);
    __setElevenLabsVoicesLoaderForTests(async () => list);
    const pub = await listPublicNexterVoices();
    const json = JSON.stringify(pub);
    for (const raw of list) {
      assert.equal(json.includes(raw.voice_id), false);
    }
    assert.equal(json.toLowerCase().includes('voice_id'), false);
    assert.equal(json.toLowerCase().includes('provider'), false);
    assert.equal(
      pub.some((v) => Object.keys(v).some((k) => k.toLowerCase().includes('provider'))),
      false
    );
  });

  it('F) user stores only catalogId, not a provider id', async () => {
    const list = fixtureList(2);
    __setElevenLabsVoicesLoaderForTests(async () => list);
    const pub = await listPublicNexterVoices();
    const chosen = pub.find((v) => v.catalogId.startsWith('el-'));
    assert.ok(chosen);
    const user = await getOrCreateUser(`vc-f-${randomUUID()}`, 'vc-f@np.test', 'Vivi');
    await updateNexterPreferencesForUser(user.id, { voiceCatalogId: chosen!.catalogId });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.nexterPreferences.voiceCatalogId, chosen!.catalogId);
    assert.equal(loaded?.nexterPreferences.voiceCatalogId?.includes('fixture_voice_secret'), false);
  });

  it('G) catalogId resolves server-side to the provider voice', async () => {
    const list = fixtureList(2);
    __setElevenLabsVoicesLoaderForTests(async () => list);
    const catalogId = catalogIdForProviderVoice(list[0].voice_id);
    const resolved = await resolveProviderVoiceId(catalogId);
    assert.equal(resolved, list[0].voice_id);
  });

  it('H) ElevenLabs list failure still serves Nexter Standard fallback', async () => {
    __setElevenLabsVoicesLoaderForTests(async () => {
      throw new Error('voices_http_503');
    });
    const pub = await listPublicNexterVoices();
    assert.equal(pub.some((v) => v.catalogId === DEFAULT_NEXTER_VOICE_CATALOG_ID), true);
    const fallback = getElevenLabsVoiceId();
    assert.equal(await resolveProviderVoiceId(null), fallback);
    assert.equal(await resolveProviderVoiceId(DEFAULT_NEXTER_VOICE_CATALOG_ID), fallback);
  });

  it('I) missing saved voice falls back without throwing', async () => {
    __setElevenLabsVoicesLoaderForTests(async () => fixtureList(2));
    const fallback = getElevenLabsVoiceId();
    assert.equal(await resolveProviderVoiceId('el-ffffffffffffffff'), fallback);
    assert.equal(await resolveProviderVoiceId('unknown-catalog'), fallback);
  });

  it('J) logo / animation / music intents unchanged', () => {
    assert.equal(detectQuoteKind('Ich möchte daraus ein Logo machen.'), 'logo');
    assert.equal(detectQuoteKind('Animier mein Logo'), 'animation');
    assert.equal(detectQuoteKind('Erstelle Musik für mein Intro'), 'music');
  });

  it('frontend voice UI has filters and no provider ids', () => {
    const ui = readFileSync(
      join(repoRoot, 'frontend/src/components/nexter/NexterPersonalizationFields.tsx'),
      'utf8'
    );
    assert.match(ui, /Männlich/);
    assert.match(ui, /Weiblich/);
    assert.match(ui, /Neutral/);
    assert.match(ui, /Deutsch verfügbar/);
    assert.match(ui, /Stimmvorschau/);
    assert.equal(ui.toLowerCase().includes('elevenlabs'), false);
    assert.equal(ui.includes('voice_id'), false);
  });
});
