import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_NEXTER_ACCENT_PRESET,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  UserRole,
} from '@ucbs/shared';
import {
  getOrCreateUser,
  getUserById,
  sanitizeDisplayName,
  updateOwnProfile,
  updateUser,
} from './user.service.js';
import { upsertDna, getActiveDna } from './dna.service.js';
import {
  assertSafePreferencesPatch,
  getNexterPreferencesForUser,
  updateNexterPreferencesForUser,
} from './nexter/preferences.service.js';
import { listPublicNexterVoices } from './nexter/voice-catalog.service.js';
import { buildNexterContext } from './nexter/context.service.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { ServiceError } from '../lib/errors.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

async function seed(prefix: string) {
  return getOrCreateUser(`${prefix}-${randomUUID()}`, `${randomUUID()}@settings.test`, prefix, {
    role: UserRole.USER,
  });
}

describe('settings hub local closure — profile, prefs, ownership', () => {
  it('loads own preferences and blocks foreign profile/prefs writes', async () => {
    const a = await seed('Ada');
    const b = await seed('Ben');
    await updateNexterPreferencesForUser(a.id, {
      language: 'en',
      addressAs: 'Ada',
      platforms: ['twitch'],
      creationInterests: ['logo'],
      stylePreferences: ['neon'],
      creatorGoals: ['brand'],
      uiTheme: 'light',
      accentPreset: 'blue',
      voiceCatalogId: DEFAULT_NEXTER_VOICE_CATALOG_ID,
      voiceOutputEnabled: false,
    });
    const own = await getNexterPreferencesForUser(a.id);
    assert.equal(own.language, 'en');
    assert.equal(own.voiceOutputEnabled, false);
    assert.deepEqual(own.platforms, ['twitch']);
    const other = await getNexterPreferencesForUser(b.id);
    assert.equal(other.language, 'de');
    assert.deepEqual(other.platforms, []);
    await updateOwnProfile(a.id, { displayName: 'Ada Night' });
    assert.equal((await getUserById(a.id))?.displayName, 'Ada Night');
    assert.equal((await getUserById(b.id))?.displayName, 'Ben');
    const routes = repo('backend/src/routes/auth.routes.ts');
    const meBlock = routes.slice(routes.indexOf("'/me'"), routes.indexOf("'/me/nexter-preferences'"));
    assert.match(meBlock, /authenticate/);
    assert.match(meBlock, /updateOwnProfile\(req\.user!\.uid/);
    const prefBlock = routes.slice(routes.indexOf("'/me/nexter-preferences'"), routes.indexOf("'/onboarding/complete'"));
    assert.match(prefBlock, /authenticate/);
    assert.match(prefBlock, /updateNexterPreferencesForUser\(req\.user!\.uid/);
  });

  it('saves preferences and display name with server validation', async () => {
    const user = await seed('Lia');
    await updateOwnProfile(user.id, { displayName: 'Lia Wolf' });
    await updateNexterPreferencesForUser(user.id, {
      language: 'de',
      addressAs: 'Lia',
      voiceCatalogId: 'nexter-voice-female',
      voiceOutputEnabled: true,
      uiTheme: 'dark',
      accentPreset: 'purple',
      customPrimary: '#1E40AF',
      customAccent: '#22d3ee',
      platforms: ['youtube', 'tiktok'],
      creationInterests: ['video', 'music'],
      stylePreferences: ['minimal'],
      creatorGoals: ['hobby'],
    });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.displayName, 'Lia Wolf');
    assert.equal(loaded?.nexterPreferences.addressAs, 'Lia');
    assert.equal(loaded?.nexterPreferences.voiceCatalogId, 'nexter-voice-female');
    assert.equal(loaded?.nexterPreferences.accentPreset, 'purple');
    assert.equal(loaded?.nexterPreferences.customPrimary, '#1e40af');
    assert.deepEqual(loaded?.nexterPreferences.creationInterests, ['video', 'music']);
    assert.throws(() => sanitizeDisplayName('   '), /INVALID_DISPLAY_NAME/);
    assert.throws(() => sanitizeDisplayName(''), /INVALID_DISPLAY_NAME/);
    assert.throws(() => sanitizeDisplayName('x'.repeat(101)), /INVALID_DISPLAY_NAME/);
    assert.equal(sanitizeDisplayName('  Night\u0000Wolf  '), 'NightWolf');
    await assert.rejects(() => updateOwnProfile(user.id, { displayName: '   ' }), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'INVALID_DISPLAY_NAME';
    });
    await assert.rejects(() => updateOwnProfile(user.id, { email: 'hack@x.test' }), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'FORBIDDEN_FIELD';
    });
    await assert.rejects(() => updateOwnProfile(user.id, { coinBalance: 9999 }), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'FORBIDDEN_FIELD';
    });
    assert.throws(() => assertSafePreferencesPatch({ language: 'fr' }), /INVALID_LANGUAGE/);
    assert.throws(() => assertSafePreferencesPatch({ voiceCatalogId: 'not-a-voice' }), /UNKNOWN_VOICE/);
    assert.throws(() => assertSafePreferencesPatch({ uiTheme: 'neon' }), /INVALID_THEME/);
    assert.throws(() => assertSafePreferencesPatch({ platforms: ['myspace'] }), /INVALID_PLATFORMS/);
    assert.throws(() => assertSafePreferencesPatch({ accentPreset: 'rainbow-unicorn' }), /INVALID_ACCENT/);
  });

  it('existing users get defaults; new users share onboarding fields', async () => {
    const legacy = await seed('Old');
    await updateUser(legacy.id, {
      onboardingCompleted: true,
      nexterPreferences: {
        language: 'en',
        addressAs: 'OldNick',
        voiceCatalogId: null,
        uiTheme: 'dark',
        accentPreset: DEFAULT_NEXTER_ACCENT_PRESET,
      } as never,
    });
    const loaded = await getUserById(legacy.id);
    assert.equal(loaded?.nexterPreferences.voiceOutputEnabled, true);
    assert.deepEqual(loaded?.nexterPreferences.platforms, []);
    assert.equal(loaded?.nexterPreferences.personalizationCompleted, false);
    const fresh = await seed('New');
    assert.equal(fresh.nexterPreferences.language, 'de');
    assert.equal(fresh.nexterPreferences.personalizationCompleted, false);
    const setup = repo('frontend/src/pages/onboarding/NexterSetupPage.tsx');
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    assert.match(setup, /NexterPersonalizationFields/);
    assert.match(settings, /NexterPersonalizationFields/);
    assert.match(setup, /api\.auth\.updateNexterPreferences/);
    assert.match(settings, /api\.auth\.updateNexterPreferences/);
    assert.match(settings, /api\.auth\.updateProfile/);
    assert.equal(settings.includes('assistantName'), false);
    assert.equal(setup.includes('assistantName'), false);
  });
});

describe('settings hub — theme, voice, dna safety, nexter context', () => {
  it('theme and style prefs do not mutate Creator DNA', async () => {
    const user = await seed('Gena');
    const dna = await upsertDna({
      userId: user.id,
      name: 'NightWolf',
      mascot: 'Cyber-Wolf',
      styleDirection: 'neon',
      primaryColors: ['#112233'],
      accentColors: ['#778899'],
      fonts: [{ name: 'Orbitron', role: 'primary', source: 'google' }],
    });
    await updateNexterPreferencesForUser(user.id, {
      uiTheme: 'light',
      accentPreset: 'red',
      customPrimary: '#00ffaa',
      customAccent: '#aa00ff',
      stylePreferences: ['minimal', 'comic'],
    });
    const after = await getActiveDna(user.id);
    assert.deepEqual(after?.primaryColors, dna.primaryColors);
    assert.deepEqual(after?.accentColors, dna.accentColors);
    assert.equal(after?.styleDirection, 'neon');
    assert.equal(after?.name, 'NightWolf');
    const prefs = await getNexterPreferencesForUser(user.id);
    assert.equal(prefs.uiTheme, 'light');
    assert.deepEqual(prefs.stylePreferences, ['minimal', 'comic']);
  });

  it('settings changes refresh Nexter context and keep DNA in context', async () => {
    const user = await seed('Ctx');
    await upsertDna({
      userId: user.id,
      name: 'NightWolf',
      mascot: 'Wolf',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF'],
    });
    await updateNexterPreferencesForUser(user.id, {
      addressAs: 'NightWolf',
      language: 'en',
      platforms: ['twitch'],
      creationInterests: ['logo'],
      stylePreferences: ['neon'],
      creatorGoals: ['community'],
      voiceOutputEnabled: false,
    });
    const ctx = await buildNexterContext(user.id);
    assert.equal(ctx.addressAs, 'NightWolf');
    assert.equal(ctx.language, 'en');
    assert.deepEqual(ctx.preferredPlatforms, ['twitch']);
    assert.deepEqual(ctx.creationInterests, ['logo']);
    assert.deepEqual(ctx.creatorGoals, ['community']);
    assert.equal(ctx.hasDna, true);
    assert.equal(ctx.dnaName, 'NightWolf');
    assert.deepEqual(ctx.primaryColors.slice(0, 1), ['#1E40AF']);
    const none = await seed('NoDna');
    const empty = await buildNexterContext(none.id);
    assert.equal(empty.hasDna, false);
    assert.equal(empty.dnaName, undefined);
  });

  it('voice catalog is central; enable/disable persists; invalid voice blocked', async () => {
    const catalog = await listPublicNexterVoices();
    assert.ok(catalog.some((v) => v.catalogId === DEFAULT_NEXTER_VOICE_CATALOG_ID));
    assert.equal(
      catalog.some((v) => Object.keys(v).some((k) => k.toLowerCase().includes('provider'))),
      false
    );
    const user = await seed('Vox');
    await updateNexterPreferencesForUser(user.id, { voiceCatalogId: 'nexter-voice-male', voiceOutputEnabled: false });
    let prefs = await getNexterPreferencesForUser(user.id);
    assert.equal(prefs.voiceCatalogId, 'nexter-voice-male');
    assert.equal(prefs.voiceOutputEnabled, false);
    await updateNexterPreferencesForUser(user.id, { voiceOutputEnabled: true });
    prefs = await getNexterPreferencesForUser(user.id);
    assert.equal(prefs.voiceOutputEnabled, true);
    await assert.rejects(
      () => updateNexterPreferencesForUser(user.id, { voiceCatalogId: 'elevenlabs-fake' }),
      /UNKNOWN_VOICE/
    );
    assert.equal((await getNexterPreferencesForUser(user.id)).voiceCatalogId, 'nexter-voice-male');
  });

  it('language persists across reload and invalid language is blocked', async () => {
    const user = await seed('Lang');
    await updateNexterPreferencesForUser(user.id, { language: 'en' });
    assert.equal((await getUserById(user.id))?.locale, 'en');
    assert.equal((await getNexterPreferencesForUser(user.id)).language, 'en');
    await assert.rejects(() => updateNexterPreferencesForUser(user.id, { language: 'de-DE' }), /INVALID_LANGUAGE/);
    assert.equal((await getNexterPreferencesForUser(user.id)).language, 'en');
  });
});

describe('settings hub — frontend contracts, isolation, safety', () => {
  it('settings UI covers real sections, dirty state, loading, errors, a11y', () => {
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    const fields = repo('frontend/src/components/nexter/NexterPersonalizationFields.tsx');
    const appearance = repo('frontend/src/lib/nexter-appearance.ts');
    const auth = repo('frontend/src/context/AuthContext.tsx');
    const api = repo('frontend/src/services/api.ts');
    const input = repo('frontend/src/components/ui/Input.tsx');
    assert.match(settings, /id="profile"/);
    assert.match(settings, /id="nexter-personalization"/);
    assert.match(settings, /id="language-voice"/);
    assert.match(settings, /id="appearance"/);
    assert.match(settings, /id="creator-preferences"/);
    assert.match(settings, /id="creator-dna"/);
    assert.match(settings, /id="account-security"/);
    assert.match(settings, /Account-E-Mail/);
    assert.match(settings, /readOnly/);
    assert.match(settings, /Anzeigename/);
    assert.match(settings, /Creator DNA einrichten/);
    assert.match(settings, /Passwort-Reset senden/);
    assert.match(settings, /requestPasswordReset/);
    assert.match(settings, /logout/);
    assert.match(settings, /beforeunload/);
    assert.match(settings, /Ungespeicherte Änderungen/);
    assert.match(settings, /Verwerfen/);
    assert.match(settings, /Speichern/);
    assert.match(settings, /aria-busy/);
    assert.match(settings, /role="status"/);
    assert.match(settings, /Skeleton/);
    assert.match(settings, /voiceCatalogError/);
    assert.match(settings, /applyNexterAppearance\(draft\)/);
    assert.match(settings, /applyNexterAppearance\(user\?\.nexterPreferences\)/);
    assert.match(settings, /api\.nexter/);
    assert.match(settings, /voices\(\)/);
    assert.match(fields, /nexter-voice-output/);
    assert.match(fields, /NEXTER_ACCENT_PRESETS/);
    assert.match(appearance, /applyNexterAppearance/);
    assert.match(auth, /applyNexterAppearance\(me\.user\.nexterPreferences\)/);
    assert.match(auth, /resetNexterAppearance/);
    assert.match(api, /\/api\/v1\/auth\/me\/nexter-preferences/);
    assert.match(api, /updateProfile/);
    assert.match(api, /voiceOutputEnabled/);
    assert.match(input, /aria-invalid/);
    assert.match(input, /aria-describedby/);
    assert.equal(settings.includes('Push Notifications'), false);
    assert.equal(settings.includes('E-Mail bei neuen Followern'), false);
    assert.equal(settings.toLowerCase().includes('github'), false);
    assert.equal(settings.toLowerCase().includes('apple'), false);
    assert.equal(settings.includes('updatePassword'), false);
    assert.equal(settings.includes('updateEmail'), false);
    assert.match(settings, /changeAccountPassword/);
    assert.match(settings, /Neues Passwort/);
    assert.match(settings, /Eigene Daten exportieren/);
    assert.match(settings, /Konto löschen/);
  });

  it('email is read-only; password change uses Firebase reauth; reset uses Firebase', () => {
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    const routes = repo('backend/src/routes/auth.routes.ts');
    const firebase = repo('frontend/src/lib/firebase.ts');
    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    const profilePatch = routes.slice(routes.indexOf("'/me'"), routes.indexOf("'/me/nexter-preferences'"));
    assert.match(settings, /disabled/);
    assert.equal(/updateEmail|changeEmail|verifyBeforeUpdateEmail/.test(settings), false);
    assert.equal(profilePatch.includes('email:'), false);
    assert.match(profilePatch, /updateOwnProfile/);
    assert.match(firebase, /sendPasswordResetEmail/);
    assert.match(login, /requestPasswordReset/);
    assert.match(firebase, /updatePassword\(/);
    assert.match(firebase, /reauthenticateWithCredential/);
    assert.match(settings, /Neues Passwort/);
    assert.equal(settings.includes('updatePassword'), false);
  });

  it('multi-user isolation and backend source of truth, not localStorage', async () => {
    const a = await seed('IsoA');
    const b = await seed('IsoB');
    await updateNexterPreferencesForUser(a.id, { uiTheme: 'light', language: 'en', platforms: ['discord'] });
    await updateOwnProfile(a.id, { displayName: 'Iso A' });
    const a2 = await getUserById(a.id);
    const b2 = await getUserById(b.id);
    assert.equal(a2?.nexterPreferences.uiTheme, 'light');
    assert.equal(b2?.nexterPreferences.uiTheme, 'dark');
    assert.equal(a2?.displayName, 'Iso A');
    assert.equal(b2?.displayName, 'IsoB');
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    assert.equal(settings.includes('localStorage.setItem'), false);
    assert.equal(settings.includes('localStorage.getItem'), false);
    assert.match(settings, /api\.auth\.updateNexterPreferences/);
    assert.match(settings, /refreshUser/);
  });

  it('no secrets, no client Firestore/Storage writes, no automatic provider or payment calls', () => {
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    const api = repo('frontend/src/services/api.ts');
    const auth = repo('frontend/src/context/AuthContext.tsx');
    const firebase = repo('frontend/src/lib/firebase.ts');
    const fields = repo('frontend/src/components/nexter/NexterPersonalizationFields.tsx');
    for (const srcFile of [settings, api, auth, firebase, fields]) {
      assert.equal(srcFile.includes('setDoc('), false);
      assert.equal(srcFile.includes('updateDoc('), false);
      assert.equal(srcFile.includes('uploadBytes('), false);
      assert.equal(srcFile.includes('getStorage('), false);
      assert.equal(srcFile.includes('collection(db'), false);
    }
    assert.equal(/OPENAI_API_KEY|ELEVENLABS_API_KEY|STRIPE_SECRET|sk_live|whsec_/.test(settings), false);
    const saveFn = settings.slice(settings.indexOf('async function save()'), settings.indexOf('async function sendFeedback()'));
    assert.equal(saveFn.includes('voicePreview'), false);
    assert.equal(saveFn.includes('generateSpeech'), false);
    assert.equal(saveFn.includes('openai'), false);
    assert.equal(saveFn.includes('stripe'), false);
    assert.equal(saveFn.includes('paypal'), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
  });

  it('dashboard and projects hub consume the same appearance engine', () => {
    const appearance = repo('frontend/src/lib/nexter-appearance.ts');
    const dashboard = repo('frontend/src/v2/pages/DashboardV2Page.tsx');
    const projects = repo('frontend/src/v2/pages/ProjectsHubPage.tsx');
    const auth = repo('frontend/src/context/AuthContext.tsx');
    assert.match(appearance, /--ucbs-accent-cyan/);
    assert.match(auth, /applyNexterAppearance/);
    assert.match(dashboard, /ucbs-accent-cyan|var\(--ucbs/);
    assert.match(projects, /ucbs-accent-cyan|var\(--ucbs/);
  });
});
