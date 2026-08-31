import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  applyDnaLocks,
  applyLockedDnaToGeneration,
  mergeAnalysisIntoDna,
  pickDnaForRequest,
  type CreatorDNA,
} from '@ucbs/shared';

function oldDna(overrides: Partial<CreatorDNA> = {}): CreatorDNA {
  return {
    id: 'dna-old',
    userId: 'user-a',
    name: 'LegacyBrand',
    type: 'creator',
    primaryColors: ['#112233'],
    secondaryColors: [],
    accentColors: [],
    styleDirection: 'gaming',
    favoriteGenres: [],
    gamingStyle: '',
    brandingStyle: '',
    promptStyle: '',
    visualLanguage: '',
    animations: [],
    personalGuidelines: '',
    fonts: [],
    brandingRules: [],
    platformOptimization: [],
    targetAudience: { ageRange: '', interests: [], platforms: [], tone: '', description: '' },
    designLanguage: { mood: [], keywords: [], visualElements: [], doNotUse: [] },
    sourceAssets: [],
    version: 1,
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('phase C — old DNA remains readable', () => {
  it('missing phase-C fields do not break lock/merge helpers', () => {
    const dna = oldDna();
    assert.equal(dna.character, undefined);
    assert.equal(dna.slogan, undefined);
    const patched = applyDnaLocks(dna, { primaryColors: ['#ff0000'], name: 'Hacked' });
    assert.deepEqual(patched.primaryColors, ['#ff0000']);
    assert.equal(patched.name, 'Hacked');
  });
});

describe('phase C — locks are server-side', () => {
  it('locked colors cannot be overwritten', () => {
    const dna = oldDna({ locks: { colors: true }, primaryColors: ['#1E40AF'] });
    const next = applyDnaLocks(dna, { primaryColors: ['#ff0000'], secondaryColors: ['#00ff00'] });
    assert.deepEqual(next.primaryColors, ['#1E40AF']);
    assert.deepEqual(next.secondaryColors, []);
  });

  it('locked character cannot be swapped', () => {
    const dna = oldDna({
      locks: { character: true },
      mascot: 'Cyber-Wolf',
      character: { present: true, description: 'Cyber-Wolf' },
    });
    const next = applyDnaLocks(dna, {
      mascot: 'Dragon',
      character: { present: true, description: 'Dragon' },
    });
    assert.equal(next.mascot, 'Cyber-Wolf');
    assert.equal(next.character?.description, 'Cyber-Wolf');
  });

  it('locked style cannot be overwritten', () => {
    const dna = oldDna({ locks: { style: true }, styleDirection: 'gaming' });
    const next = applyDnaLocks(dna, { styleDirection: 'cartoon' });
    assert.equal(next.styleDirection, 'gaming');
  });

  it('analysis never overwrites locked fields or lock flags', () => {
    const dna = oldDna({
      locks: { colors: true, character: true },
      primaryColors: ['#1E40AF'],
      mascot: 'Cyber-Wolf',
    });
    const merged = mergeAnalysisIntoDna(dna, {
      primaryColors: ['#ff0000'],
      mascot: 'Robot',
      locks: { colors: false },
    });
    assert.deepEqual(merged.primaryColors, ['#1E40AF']);
    assert.equal(merged.mascot, 'Cyber-Wolf');
    assert.equal(merged.locks, undefined);
  });

  it('owner can unlock and then change colors in the same write', () => {
    const dna = oldDna({ locks: { colors: true }, primaryColors: ['#1E40AF'] });
    const next = applyDnaLocks(dna, {
      locks: { colors: false },
      primaryColors: ['#DC2626'],
    });
    assert.deepEqual(next.primaryColors, ['#DC2626']);
    assert.equal(next.locks?.colors, false);
  });

  it('first lock captures the values saved in that write', () => {
    const dna = oldDna({ locks: { colors: false }, primaryColors: ['#7C3AED'] });
    const next = applyDnaLocks(dna, {
      locks: { colors: true },
      primaryColors: ['#1E40AF'],
    });
    assert.deepEqual(next.primaryColors, ['#1E40AF']);
    assert.equal(next.locks?.colors, true);
  });

  it('generator helper forces locked DNA onto logo options', () => {
    const dna = oldDna({
      locks: { colors: true, name: true, character: true },
      name: 'NightWolf',
      primaryColors: ['#1E40AF'],
      mascot: 'Cyber-Wolf',
    });
    const forced = applyLockedDnaToGeneration(dna, {
      logoName: 'RedBrand',
      primaryColor: '#ff0000',
      selectedColors: ['#ff0000'],
      magikCharacter: 'Dragon',
    });
    assert.equal(forced.logoName, 'NightWolf');
    assert.equal(forced.primaryColor, '#1E40AF');
    assert.deepEqual(forced.selectedColors, ['#1E40AF']);
    assert.equal(forced.magikCharacter, 'Cyber-Wolf');
  });
});

describe('phase C — project DNA resolution', () => {
  it('uses the project dnaId when the project is owned', () => {
    const projectDna = oldDna({ id: 'dna-project', name: 'ProjectDNA', userId: 'user-a' });
    const activeDna = oldDna({ id: 'dna-active', name: 'ActiveDNA', userId: 'user-a' });
    const picked = pickDnaForRequest({
      userId: 'user-a',
      project: { ownerId: 'user-a', dnaId: 'dna-project' },
      projectDna,
      activeDna,
    });
    assert.equal(picked.source, 'project');
    assert.equal(picked.dna?.name, 'ProjectDNA');
  });

  it('falls back to active user DNA when no project is active', () => {
    const activeDna = oldDna({ id: 'dna-active', name: 'ActiveDNA', userId: 'user-a' });
    const picked = pickDnaForRequest({ userId: 'user-a', activeDna });
    assert.equal(picked.source, 'active');
    assert.equal(picked.dna?.name, 'ActiveDNA');
  });

  it('does not use another user\'s project DNA', () => {
    const picked = pickDnaForRequest({
      userId: 'user-a',
      project: { ownerId: 'user-b', dnaId: 'dna-b' },
      projectDna: oldDna({ id: 'dna-b', userId: 'user-b', name: 'Foreign' }),
      activeDna: oldDna({ id: 'dna-a', userId: 'user-a', name: 'Mine' }),
    });
    assert.equal(picked.source, 'active');
    assert.equal(picked.dna?.name, 'Mine');
  });
});

process.env.DEV_AUTH_BYPASS = 'true';
if (process.env.NODE_ENV === 'production') process.env.NODE_ENV = 'test';

describe('phase C — dna service persistence', () => {
  it('saves full DNA, isolates users, versions, restore, and project binding', async () => {
    const {
      normalizeDna,
      upsertDna,
      updateDna,
      getDnaById,
      listDnaVersions,
      restoreDnaVersion,
      resolveDnaForRequest,
    } = await import('./dna.service.js');
    const { createProject } = await import('./project.service.js');

    const legacy = normalizeDna({
      id: 'x',
      userId: 'u',
      name: 'Old',
      primaryColors: ['#abc'],
      secondaryColors: [],
      accentColors: [],
      styleDirection: 'gaming',
      version: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as CreatorDNA);
    assert.equal(legacy.slogan, '');
    assert.deepEqual(legacy.backgroundColors, []);
    assert.equal(legacy.character?.present, false);

    const userA = `user-a-${randomUUID()}`;
    const userB = `user-b-${randomUUID()}`;

    const created = await upsertDna({
      userId: userA,
      name: 'NightWolf',
      slogan: 'Hunt the night',
      usagePurpose: 'Twitch',
      mascot: 'Cyber-Wolf',
      styleDirection: 'gaming',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      accentColors: ['#22D3EE'],
      backgroundColors: ['#0B0B12'],
      character: {
        present: true,
        type: 'animal',
        description: 'Cyber-Wolf with violet eyes',
        clothing: 'tactical armor',
        hair: 'dark mane',
        face: 'half mask',
        accessories: 'ear comms',
        traits: ['violet eyes', 'wolf ears'],
      },
      typography: { character: 'bold sans', weight: 'black', direction: 'geometric', nameTreatment: 'NightWolf stacked' },
      atmosphere: { lighting: 'neon glow', mood: 'cinematic', effects: ['particles'], particles: true, glow: true, smoke: false },
      outputPrefs: { platform: 'twitch', aspectRatios: ['16:9', '9:16'], outputKinds: ['logo'] },
      locks: { colors: true, character: true, style: true },
    });

    assert.equal(created.name, 'NightWolf');
    assert.equal(created.character?.description, 'Cyber-Wolf with violet eyes');
    assert.equal(created.locks?.colors, true);

    const stolen = await getDnaById(created.id, userB);
    assert.equal(stolen, null);

    const lockedWrite = await updateDna(created.id, userA, {
      userId: userA,
      primaryColors: ['#ff0000'],
      mascot: 'Dragon',
      styleDirection: 'cartoon',
      character: { present: true, description: 'Dragon' },
    });
    assert.deepEqual(lockedWrite.primaryColors, ['#1E40AF']);
    assert.equal(lockedWrite.mascot, 'Cyber-Wolf');
    assert.equal(lockedWrite.styleDirection, 'gaming');
    assert.equal(lockedWrite.character?.description, 'Cyber-Wolf with violet eyes');

    const project = await createProject(userA, {
      name: 'NightWolf Launch',
      type: 'branding',
      dnaId: created.id,
    });
    const fromProject = await resolveDnaForRequest(userA, project.id);
    assert.equal(fromProject.source, 'project');
    assert.equal(fromProject.dna?.id, created.id);

    const fallback = await resolveDnaForRequest(userA);
    assert.equal(fallback.source, 'active');
    assert.equal(fallback.dna?.id, created.id);

    const beforeRestore = lockedWrite.version;
    const versions = await listDnaVersions(created.id, userA);
    assert.ok(versions.length >= 2);
    const oldest = versions[versions.length - 1];
    const restored = await restoreDnaVersion(created.id, oldest.id, userA);
    assert.ok(restored.version > beforeRestore);
    const reloaded = await getDnaById(created.id, userA);
    assert.equal(reloaded?.id, created.id);
    assert.equal(reloaded?.name, 'NightWolf');
    assert.deepEqual(reloaded?.primaryColors, ['#1E40AF']);

    const nexterCtx = await (await import('./nexter/context.service.js')).buildNexterContext(userA, project.id);
    assert.equal(nexterCtx.dnaSource, 'project');
    assert.equal(nexterCtx.dnaId, created.id);
    assert.match(nexterCtx.characterDescription ?? '', /Cyber-Wolf/);
    assert.equal(nexterCtx.locks?.colors, true);
  });
});
