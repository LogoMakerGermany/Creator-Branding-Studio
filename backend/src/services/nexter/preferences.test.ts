import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNexterGreeting,
  DEFAULT_NEXTER_ACCENT_PRESET,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  resolveNexterPreferences,
  UserRole,
} from '@ucbs/shared';
import { getOrCreateUser, getUserById, updateUser } from '../user.service.js';
import { getActiveDna, upsertDna } from '../dna.service.js';
import {
  assertSafePreferencesPatch,
  getNexterPreferencesForUser,
  updateNexterPreferencesForUser,
} from './preferences.service.js';
import { resolveProviderVoiceId, listPublicNexterVoices } from './voice-catalog.service.js';
import { getElevenLabsVoiceId } from '../../config/env.js';
import { detectQuoteKind } from './tools.service.js';

process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../../..');
const repoRoot = join(dir, '../../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const extraBefore = process.env.NEXTER_VOICE_CATALOG_EXTRA;

afterEach(() => {
  if (extraBefore === undefined) delete process.env.NEXTER_VOICE_CATALOG_EXTRA;
  else process.env.NEXTER_VOICE_CATALOG_EXTRA = extraBefore;
});

describe('nexter personalization V1', () => {
  it('A) new user without stored prefs gets safe defaults', async () => {
    const user = await getOrCreateUser(`np-a-${randomUUID()}`, 'a@np.test', 'Ada');
    assert.equal(user.nexterPreferences.language, 'de');
    assert.equal(user.nexterPreferences.addressAs, 'Ada');
    assert.equal(user.nexterPreferences.voiceCatalogId, null);
    assert.equal(user.nexterPreferences.uiTheme, 'dark');
    assert.equal(user.nexterPreferences.accentPreset, DEFAULT_NEXTER_ACCENT_PRESET);
    assert.equal(user.nexterPreferences.personalizationCompleted, false);
    assert.equal(user.nexterPreferences.voiceOutputEnabled, false);
    const resolved = resolveNexterPreferences(undefined, { locale: 'de', displayName: 'Ada' });
    assert.equal(resolved.uiTheme, 'dark');
    assert.equal(resolved.voiceOutputEnabled, false);
  });

  it('B) addressAs Lars is used in greeting, not repeated by helper contract', () => {
    const withName = buildNexterGreeting({
      addressAs: 'Lars',
      language: 'de',
      contextLine: 'DNA aktiv.',
    });
    assert.match(withName, /^Hallo Lars, ich bin Nexter/);
    const without = buildNexterGreeting({ language: 'de', contextLine: 'DNA aktiv.' });
    assert.match(without, /^Hallo, ich bin Nexter/);
    assert.equal(without.includes('Lars'), false);
    const en = buildNexterGreeting({ addressAs: 'Lars', language: 'en', contextLine: 'DNA ready.' });
    assert.match(en, /^Hi Lars, I'm Nexter/);
  });

  it('C) user A theme change does not affect user B', async () => {
    const a = await getOrCreateUser(`np-c-a-${randomUUID()}`, 'a@iso.test', 'A');
    const b = await getOrCreateUser(`np-c-b-${randomUUID()}`, 'b@iso.test', 'B');
    await updateNexterPreferencesForUser(a.id, { uiTheme: 'light', accentPreset: 'red' });
    const a2 = await getUserById(a.id);
    const b2 = await getUserById(b.id);
    assert.equal(a2?.nexterPreferences.uiTheme, 'light');
    assert.equal(a2?.nexterPreferences.accentPreset, 'red');
    assert.equal(b2?.nexterPreferences.uiTheme, 'dark');
    assert.equal(b2?.nexterPreferences.accentPreset, DEFAULT_NEXTER_ACCENT_PRESET);
    assert.equal(b2?.id, b.id);
  });

  it('D) voiceCatalogId resolves server-side to a provider id; public catalog has no provider fields', async () => {
    process.env.NEXTER_VOICE_CATALOG_EXTRA = 'warm-de:test-provider-voice-1:Warm:female:de';
    const resolved = await resolveProviderVoiceId('warm-de');
    assert.equal(resolved, 'test-provider-voice-1');
    const pub = await listPublicNexterVoices();
    assert.equal(
      pub.some((v) => Object.keys(v).some((k) => k.toLowerCase().includes('provider'))),
      false
    );
    assert.equal(JSON.stringify(pub).includes('test-provider-voice-1'), false);
    const speakSrc = src('src/services/voice.service.ts');
    assert.match(speakSrc, /resolveProviderVoiceId/);
    assert.match(speakSrc, /generateSpeech/);
    assert.doesNotMatch(speakSrc, /voiceId:\s*['"]/);
  });

  it('E) no voice chosen uses existing NEXTER_VOICE fallback', async () => {
    const fallback = getElevenLabsVoiceId();
    assert.equal(await resolveProviderVoiceId(null), fallback);
    assert.equal(await resolveProviderVoiceId(undefined), fallback);
    assert.equal(await resolveProviderVoiceId('unknown-catalog'), fallback);
    const pub = await listPublicNexterVoices();
    assert.equal(pub.some((v) => v.catalogId === DEFAULT_NEXTER_VOICE_CATALOG_ID), true);
  });

  it('F) existing onboarded user without prefs still loads and is not blocked by DNA reset', async () => {
    const user = await getOrCreateUser(`np-f-${randomUUID()}`, 'f@np.test', 'Legacy');
    await updateUser(user.id, { onboardingCompleted: true });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.onboardingCompleted, true);
    assert.equal(loaded?.nexterPreferences.personalizationCompleted, false);
    assert.equal(loaded?.displayName, 'Legacy');
    assert.equal(loaded?.nexterPreferences.language, 'de');
    const onboarding = readFileSync(join(repoRoot, 'frontend/src/pages/onboarding/OnboardingPage.tsx'), 'utf8');
    const setup = readFileSync(join(repoRoot, 'frontend/src/pages/onboarding/NexterSetupPage.tsx'), 'utf8');
    const gate = readFileSync(join(repoRoot, 'frontend/src/components/auth/ProtectedRoute.tsx'), 'utf8');
    assert.match(gate, /resolveAuthGate/);
    assert.match(onboarding, /onboardingCompleted/);
    assert.equal(onboarding.includes('personalizationCompleted: true'), false);
    assert.match(onboarding, /\/nexter-setup/);
    assert.match(setup, /onboardingCompleted/);
    assert.match(setup, /personalizationCompleted: true/);
    const gates = readFileSync(join(repoRoot, 'frontend/src/lib/auth-gates.ts'), 'utf8');
    assert.match(gates, /nexter-setup/);
    assert.match(gates, /personalizationCompleted/);
  });

  it('G) UI accent change does not mutate Creator DNA colors', async () => {
    const user = await getOrCreateUser(`np-g-${randomUUID()}`, 'g@np.test', 'Gena');
    const dna = await upsertDna({
      userId: user.id,
      name: 'Brand',
      primaryColors: ['#112233'],
      secondaryColors: ['#445566'],
      accentColors: ['#778899'],
    });
    await updateNexterPreferencesForUser(user.id, { accentPreset: 'purple' });
    const after = await getActiveDna(user.id);
    assert.deepEqual(after?.primaryColors, dna.primaryColors);
    assert.deepEqual(after?.secondaryColors, dna.secondaryColors);
    assert.deepEqual(after?.accentColors, dna.accentColors);
    assert.equal((await getUserById(user.id))?.nexterPreferences.accentPreset, 'purple');
  });

  it('H) coinBalance and role cannot be patched via preferences', async () => {
    const user = await getOrCreateUser(`np-h-${randomUUID()}`, 'h@np.test', 'Hana');
    const beforeCoins = user.coinBalance;
    const beforeRole = user.role;
    assert.throws(() => assertSafePreferencesPatch({ coinBalance: 9999 }), /FORBIDDEN_FIELD/);
    assert.throws(() => assertSafePreferencesPatch({ role: UserRole.ADMIN }), /FORBIDDEN_FIELD/);
    await assert.rejects(
      () => updateNexterPreferencesForUser(user.id, { coinBalance: 9999, uiTheme: 'light' }),
      /FORBIDDEN_FIELD/
    );
    const after = await getUserById(user.id);
    assert.equal(after?.coinBalance, beforeCoins);
    assert.equal(after?.role, beforeRole);
    assert.equal(after?.nexterPreferences.uiTheme, 'dark');
  });

  it('I) music / logo / animation intents still resolve', () => {
    assert.equal(detectQuoteKind('Ich möchte daraus ein Logo machen.'), 'logo');
    assert.equal(detectQuoteKind('Animier mein Logo'), 'animation');
    assert.equal(detectQuoteKind('Erstelle Musik für mein Intro'), 'music');
  });

  it('firestore rules deny all client writes on user documents', () => {
    const rules = repo('firestore.rules');
    const start = rules.indexOf('match /users/{userId}');
    const end = rules.indexOf('match /creator_dna/');
    assert.ok(start >= 0 && end > start);
    const usersBlock = rules.slice(start, end);
    assert.match(usersBlock, /allow create, update, delete: if false/);
    assert.match(usersBlock, /coinBalance/);
    assert.match(usersBlock, /balanceCents/);
    assert.match(usersBlock, /nexterPreferences/);
    assert.equal(usersBlock.includes('allow update: if request.auth'), false);
    assert.equal(usersBlock.includes('affectedKeys()'), false);
  });

  it('language architecture: de default, en supported, no invented voice ids in frontend', () => {
    const voicesUi = readFileSync(
      join(repoRoot, 'frontend/src/components/nexter/NexterPersonalizationFields.tsx'),
      'utf8'
    );
    assert.equal(voicesUi.includes('21m00Tcm4TlvDq8ikWAM'), false);
    assert.equal(voicesUi.toLowerCase().includes('elevenlabs'), false);
    const conv = src('src/services/nexter/conversation.service.ts');
    assert.match(conv, /nexterReplyLanguageInstruction/);
    assert.match(conv, /buildNexterGreeting/);
  });
});

describe('nexter personalized onboarding V2', () => {
  it('new user needs onboarding and personalization', async () => {
    const user = await getOrCreateUser(`np2-new-${randomUUID()}`, 'new@np2.test', 'Nia');
    assert.equal(user.onboardingCompleted, false);
    assert.equal(user.nexterPreferences.personalizationCompleted, false);
    assert.deepEqual(user.nexterPreferences.platforms, []);
    const gate = repo('frontend/src/components/auth/ProtectedRoute.tsx');
    const gates = repo('frontend/src/lib/auth-gates.ts');
    assert.match(gate, /resolveAuthGate/);
    assert.match(gates, /!user\.onboardingCompleted/);
    assert.match(gates, /personalizationCompleted !== true/);
    assert.match(gates, /\/nexter-setup/);
  });

  it('personalized user is not gated back into setup', async () => {
    const user = await getOrCreateUser(`np2-done-${randomUUID()}`, 'done@np2.test', 'Done');
    await updateUser(user.id, { onboardingCompleted: true });
    await updateNexterPreferencesForUser(user.id, {
      addressAs: 'Done',
      personalizationCompleted: true,
    });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.onboardingCompleted, true);
    assert.equal(loaded?.nexterPreferences.personalizationCompleted, true);
    const setup = repo('frontend/src/pages/onboarding/NexterSetupPage.tsx');
    assert.match(setup, /personalizationCompleted/);
    assert.match(setup, /navigate\('\/dashboard'/);
  });

  it('preferences are stored only for the owning user', async () => {
    const a = await getOrCreateUser(`np2-iso-a-${randomUUID()}`, 'a@iso2.test', 'Ava');
    const b = await getOrCreateUser(`np2-iso-b-${randomUUID()}`, 'b@iso2.test', 'Ben');
    await updateNexterPreferencesForUser(a.id, {
      platforms: ['twitch', 'youtube'],
      creationInterests: ['logo'],
      stylePreferences: ['neon'],
      creatorGoals: ['community'],
    });
    const a2 = await getUserById(a.id);
    const b2 = await getUserById(b.id);
    assert.deepEqual(a2?.nexterPreferences.platforms, ['twitch', 'youtube']);
    assert.deepEqual(b2?.nexterPreferences.platforms, []);
    assert.deepEqual(b2?.nexterPreferences.creationInterests, []);
    assert.equal(b2?.id, b.id);
  });

  it('rejects invalid theme colors', () => {
    assert.throws(() => assertSafePreferencesPatch({ customPrimary: 'javascript:alert(1)' }), /INVALID_COLOR/);
    assert.throws(() => assertSafePreferencesPatch({ customPrimary: 'rgb(255,0,0)' }), /INVALID_COLOR/);
    assert.throws(() => assertSafePreferencesPatch({ customAccent: '#gggggg' }), /INVALID_COLOR/);
    assert.throws(() => assertSafePreferencesPatch({ customPrimary: 'url(https://x)' }), /INVALID_COLOR/);
    const ok = assertSafePreferencesPatch({ customPrimary: '#1E40AF', customAccent: '#abc' });
    assert.equal(ok.customPrimary, '#1e40af');
    assert.equal(ok.customAccent, '#aabbcc');
  });

  it('validates voice preference against known catalog ids', async () => {
    assert.throws(() => assertSafePreferencesPatch({ voiceCatalogId: 'elevenlabs-fake-id' }), /UNKNOWN_VOICE/);
    const ok = assertSafePreferencesPatch({ voiceCatalogId: DEFAULT_NEXTER_VOICE_CATALOG_ID });
    assert.equal(ok.voiceCatalogId, DEFAULT_NEXTER_VOICE_CATALOG_ID);
    const user = await getOrCreateUser(`np2-voice-${randomUUID()}`, 'voice@np2.test', 'Vox');
    await updateNexterPreferencesForUser(user.id, { voiceCatalogId: 'nexter-voice-male' });
    assert.equal((await getUserById(user.id))?.nexterPreferences.voiceCatalogId, 'nexter-voice-male');
  });

  it('validates locale', () => {
    assert.throws(() => assertSafePreferencesPatch({ language: 'fr' }), /INVALID_LANGUAGE/);
    assert.throws(() => assertSafePreferencesPatch({ language: 'de-DE' }), /INVALID_LANGUAGE/);
    assert.equal(assertSafePreferencesPatch({ language: 'en' }).language, 'en');
    assert.equal(assertSafePreferencesPatch({ language: 'de' }).language, 'de');
  });

  it('validates platforms and related catalogs', () => {
    assert.throws(() => assertSafePreferencesPatch({ platforms: ['myspace'] }), /INVALID_PLATFORMS/);
    assert.throws(() => assertSafePreferencesPatch({ creationInterests: ['nft'] }), /INVALID_INTERESTS/);
    assert.throws(() => assertSafePreferencesPatch({ stylePreferences: ['ugly'] }), /INVALID_STYLES/);
    assert.throws(() => assertSafePreferencesPatch({ creatorGoals: ['world-domination'] }), /INVALID_GOALS/);
    const ok = assertSafePreferencesPatch({
      platforms: ['tiktok', 'discord'],
      creationInterests: ['logo', 'overlay'],
      stylePreferences: ['minimal', 'neon'],
      creatorGoals: ['hobby', 'brand'],
    });
    assert.deepEqual(ok.platforms, ['tiktok', 'discord']);
    assert.deepEqual(ok.creationInterests, ['logo', 'overlay']);
  });

  it('onboarding completion is explicit and persistable', async () => {
    const user = await getOrCreateUser(`np2-done2-${randomUUID()}`, 'done2@np2.test', 'Lia');
    await updateUser(user.id, { onboardingCompleted: true });
    assert.equal((await getUserById(user.id))?.nexterPreferences.personalizationCompleted, false);
    await updateNexterPreferencesForUser(user.id, {
      addressAs: 'Lia',
      language: 'de',
      personalizationCompleted: true,
    });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.nexterPreferences.personalizationCompleted, true);
    assert.equal(loaded?.nexterPreferences.addressAs, 'Lia');
    await updateNexterPreferencesForUser(user.id, { accentPreset: 'blue' });
    assert.equal((await getUserById(user.id))?.nexterPreferences.personalizationCompleted, true);
  });

  it('existing users without new preference fields still resolve', async () => {
    const user = await getOrCreateUser(`np2-legacy-${randomUUID()}`, 'legacy@np2.test', 'Old');
    await updateUser(user.id, {
      onboardingCompleted: true,
      nexterPreferences: {
        language: 'en',
        addressAs: 'OldNick',
        voiceCatalogId: null,
        uiTheme: 'dark',
        accentPreset: DEFAULT_NEXTER_ACCENT_PRESET,
      } as never,
    });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.nexterPreferences.language, 'en');
    assert.equal(loaded?.nexterPreferences.addressAs, 'OldNick');
    assert.equal(loaded?.nexterPreferences.customPrimary, null);
    assert.equal(loaded?.nexterPreferences.customAccent, null);
    assert.deepEqual(loaded?.nexterPreferences.platforms, []);
    assert.deepEqual(loaded?.nexterPreferences.creationInterests, []);
    assert.deepEqual(loaded?.nexterPreferences.stylePreferences, []);
    assert.deepEqual(loaded?.nexterPreferences.creatorGoals, []);
    assert.equal(loaded?.nexterPreferences.personalizationCompleted, false);
    assert.equal(loaded?.onboardingCompleted, true);
    const fallback = resolveNexterPreferences({ language: 'de' }, { displayName: 'X' });
    assert.equal(fallback.personalizationCompleted, false);
    assert.deepEqual(fallback.platforms, []);
  });

  it('frontend does not add direct Firestore client writes for users', () => {
    const api = repo('frontend/src/services/api.ts');
    const authCtx = repo('frontend/src/context/AuthContext.tsx');
    const firebase = repo('frontend/src/lib/firebase.ts');
    for (const srcFile of [api, authCtx, firebase]) {
      assert.equal(srcFile.includes('setDoc('), false);
      assert.equal(srcFile.includes('updateDoc('), false);
      assert.equal(srcFile.includes('collection(db'), false);
    }
    assert.match(api, /\/api\/v1\/auth\/me\/nexter-preferences/);
  });

  it('unauthenticated preference update is rejected by authenticate', () => {
    const routes = src('src/routes/auth.routes.ts');
    const start = routes.indexOf("'/me/nexter-preferences'");
    assert.ok(start > 0);
    const block = routes.slice(start - 80, start + 220);
    assert.match(block, /authenticate/);
    const authMw = src('src/middleware/auth.ts');
    assert.match(authMw, /AUTH_REQUIRED/);
    assert.match(authMw, /401/);
  });
});

describe('nexter preferences metadata compatibility', () => {
  it('reads stored preferences that include updatedAt', async () => {
    const user = await getOrCreateUser(`np-meta-read-${randomUUID()}`, 'meta-read@np.test', 'Reader');
    const stored = await getNexterPreferencesForUser(user.id);
    assert.equal(typeof stored.updatedAt, 'string');
    assert.ok(stored.updatedAt.length > 0);
    const resolved = resolveNexterPreferences({
      language: 'de',
      addressAs: 'Reader',
      updatedAt: '2024-06-01T12:00:00.000Z',
    });
    assert.equal(resolved.updatedAt, '2024-06-01T12:00:00.000Z');
    assert.equal(resolved.language, 'de');
  });

  it('ignores client updatedAt and other server metadata on write', async () => {
    const user = await getOrCreateUser(`np-meta-write-${randomUUID()}`, 'meta-write@np.test', 'Writer');
    const forged = '1999-01-01T00:00:00.000Z';
    const patch = assertSafePreferencesPatch({
      language: 'en',
      updatedAt: forged,
      createdAt: forged,
      version: 99,
      timestamps: forged,
    });
    assert.equal(patch.language, 'en');
    assert.equal('updatedAt' in patch, false);
    assert.equal('createdAt' in patch, false);
    assert.equal('version' in patch, false);
    assert.equal('timestamps' in patch, false);

    const saved = await updateNexterPreferencesForUser(user.id, {
      language: 'en',
      addressAs: 'Writer',
      updatedAt: forged,
      createdAt: forged,
      version: 99,
      timestamps: forged,
    });
    assert.equal(saved.nexterPreferences.language, 'en');
    assert.notEqual(saved.nexterPreferences.updatedAt, forged);
    assert.equal(Date.parse(saved.nexterPreferences.updatedAt) > Date.parse(forged), true);
    assert.equal('createdAt' in saved.nexterPreferences, false);
  });

  it('rejects a real unknown preference field', () => {
    assert.throws(
      () => assertSafePreferencesPatch({ favoriteAnimal: 'wolf' }),
      (err: unknown) => err instanceof Error && /UNKNOWN_FIELD/.test(String(err))
    );
    assert.throws(
      () => assertSafePreferencesPatch({ language: 'de', favoriteAnimal: 'wolf', updatedAt: '2024-01-01T00:00:00.000Z' }),
      /UNKNOWN_FIELD/
    );
  });

  it('accepts preferences without metadata fields', async () => {
    const user = await getOrCreateUser(`np-meta-none-${randomUUID()}`, 'meta-none@np.test', 'Bare');
    const patch = assertSafePreferencesPatch({ language: 'de', addressAs: 'Bare' });
    assert.equal(patch.language, 'de');
    assert.equal('updatedAt' in patch, false);
    const saved = await updateNexterPreferencesForUser(user.id, { language: 'de', addressAs: 'Bare' });
    assert.equal(saved.nexterPreferences.addressAs, 'Bare');
    assert.equal(typeof saved.nexterPreferences.updatedAt, 'string');
  });

  it('echoing a stored preference document including updatedAt does not fail', async () => {
    const user = await getOrCreateUser(`np-meta-echo-${randomUUID()}`, 'meta-echo@np.test', 'Echo');
    await updateUser(user.id, { onboardingCompleted: true });
    const stored = (await getUserById(user.id))!.nexterPreferences;
    const saved = await updateNexterPreferencesForUser(user.id, {
      ...stored,
      addressAs: 'TreffNix',
      personalizationCompleted: true,
    });
    assert.equal(saved.nexterPreferences.addressAs, 'TreffNix');
    assert.equal(saved.nexterPreferences.personalizationCompleted, true);
    const again = await updateNexterPreferencesForUser(user.id, {
      ...saved.nexterPreferences,
      updatedAt: '1999-01-01T00:00:00.000Z',
    });
    assert.notEqual(again.nexterPreferences.updatedAt, '1999-01-01T00:00:00.000Z');
    assert.equal(again.nexterPreferences.addressAs, 'TreffNix');
  });

  it('blocks identity fields and keeps coin/role/auth gates unchanged', async () => {
    const user = await getOrCreateUser(`np-meta-id-${randomUUID()}`, 'meta-id@np.test', 'Id');
    const beforeCoins = user.coinBalance;
    assert.throws(() => assertSafePreferencesPatch({ userId: 'other' }), /FORBIDDEN_FIELD/);
    assert.throws(() => assertSafePreferencesPatch({ uid: 'other' }), /FORBIDDEN_FIELD/);
    assert.throws(() => assertSafePreferencesPatch({ id: 'other' }), /FORBIDDEN_FIELD/);
    await assert.rejects(
      () => updateNexterPreferencesForUser(user.id, { uid: user.id, language: 'en' }),
      /FORBIDDEN_FIELD/
    );
    const after = await getUserById(user.id);
    assert.equal(after?.coinBalance, beforeCoins);
    assert.equal(after?.nexterPreferences.language, 'de');
  });

  it('onboarding setup and settings writes omit server metadata', () => {
    const setup = repo('frontend/src/pages/onboarding/NexterSetupPage.tsx');
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    const fields = repo('frontend/src/components/nexter/NexterPersonalizationFields.tsx');
    assert.match(setup, /toNexterPreferencesWriteBody/);
    assert.match(settings, /toNexterPreferencesWriteBody/);
    assert.match(setup, /personalizationDraftFromPrefs/);
    assert.match(settings, /personalizationDraftFromPrefs/);
    assert.match(fields, /Server metadata such as updatedAt is never copied/);
    assert.equal(setup.includes('...draft'), false);
    assert.equal(settings.includes('...draft'), false);
    const writeFn = fields.slice(fields.indexOf('export function toNexterPreferencesWriteBody'));
    assert.equal(writeFn.includes('updatedAt'), false);
  });
});
