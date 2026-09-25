import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isConfiguredVariablePresent } from '../config/env.js';
import { buildReadinessReport, readinessReportLeaksSecrets, type ReadinessRow } from './readiness.service.js';

const dir = dirname(fileURLToPath(import.meta.url));
const SENTINEL = 'readiness-sentinel-do-not-print';
const DISCORD_SENTINEL = 'discord-sentinel-do-not-print';

const TOUCHED = [
  'TEXT_GENERATIONS_ENABLED',
  'CAPTIONS_GENERATIONS_ENABLED',
  'NEXTER_CHAT_ENABLED',
  'IMAGE_GENERATIONS_ENABLED',
  'IMAGE_EDITS_ENABLED',
  'VIDEO_GENERATIONS_ENABLED',
  'MUSIC_GENERATIONS_ENABLED',
  'TTS_GENERATION_ENABLED',
  'PAYMENTS_ENABLED',
  'GENERATIONS_ENABLED',
  'OPENAI_API_KEY',
  'REPLICATE_API_TOKEN',
  'RUNWAY_API_KEY',
  'ELEVENLABS_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
] as const;

function snapshot(): Record<string, string | undefined> {
  return Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));
}

function restore(prev: Record<string, string | undefined>): void {
  for (const key of TOUCHED) {
    const value = prev[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function apply(patch: Partial<Record<(typeof TOUCHED)[number], string | undefined>>): void {
  for (const key of TOUCHED) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function findRow(feature: string): ReadinessRow {
  const row = buildReadinessReport('2026-09-25T00:00:00.000Z').rows.find((item) => item.feature === feature);
  assert.ok(row, feature);
  return row;
}

describe('readiness report', () => {
  it('reports flag and secret names without values, fragments, or lengths', () => {
    const prev = snapshot();
    try {
      apply({
        TEXT_GENERATIONS_ENABLED: 'false',
        CAPTIONS_GENERATIONS_ENABLED: 'false',
        NEXTER_CHAT_ENABLED: 'yes',
        IMAGE_GENERATIONS_ENABLED: undefined,
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: SENTINEL,
        DISCORD_CLIENT_ID: 'discord-client',
        DISCORD_CLIENT_SECRET: DISCORD_SENTINEL,
        STRIPE_SECRET_KEY: 'stripe-sentinel-value',
        PAYMENTS_ENABLED: 'false',
      });
      const report = buildReadinessReport('2026-09-25T00:00:00.000Z');
      assert.equal(report.liveChecked, false);
      assert.equal(readinessReportLeaksSecrets(report, [SENTINEL, DISCORD_SENTINEL, 'stripe-sentinel-value']), false);
      const dumped = JSON.stringify(report);
      assert.equal(dumped.includes(String(SENTINEL.length)), false);
      for (const row of report.rows) {
        assert.ok(row.status === 'READY' || row.status === 'NOT READY');
        for (const item of row.variables) {
          assert.equal(typeof item.name, 'string');
          assert.equal(typeof item.present, 'boolean');
          assert.deepEqual(Object.keys(item).sort(), ['name', 'present']);
        }
      }
      const text = findRow('Text generation');
      assert.equal(text.flag, 'TEXT_GENERATIONS_ENABLED');
      assert.equal(text.flagEnabled, false);
      assert.equal(text.status, 'NOT READY');
      assert.equal(text.variables.find((item) => item.name === 'OPENAI_API_KEY')?.present, true);
      const captions = findRow('Automatic captions');
      assert.equal(captions.flag, 'CAPTIONS_GENERATIONS_ENABLED');
      assert.equal(captions.flagEnabled, false);
      assert.equal(captions.status, 'NOT READY');
      assert.equal(captions.variables.find((item) => item.name === 'OPENAI_API_KEY')?.present, true);
      const chat = findRow('Nexter chat');
      assert.equal(chat.flagEnabled, false);
      assert.equal(chat.status, 'NOT READY');
      const payments = findRow('Payments');
      assert.equal(payments.flagEnabled, false);
      assert.equal(payments.status, 'NOT READY');
      const discord = findRow('Discord login');
      assert.equal(discord.variables.find((item) => item.name === 'DISCORD_CLIENT_ID')?.present, true);
      assert.equal(discord.variables.find((item) => item.name === 'DISCORD_CLIENT_SECRET')?.present, true);
      assert.equal(isConfiguredVariablePresent('OPENAI_API_KEY'), false);
    } finally {
      restore(prev);
    }
  });

  it('is READY only when the exact flag and a required provider variable are both present', () => {
    const prev = snapshot();
    try {
      apply({
        GENERATIONS_ENABLED: 'true',
        TEXT_GENERATIONS_ENABLED: 'true',
        IMAGE_GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: undefined,
        REPLICATE_API_TOKEN: 'replicate-sentinel-do-not-print',
        NEXTER_CHAT_ENABLED: 'false',
        PAYMENTS_ENABLED: 'false',
      });
      const text = findRow('Text generation');
      assert.equal(text.flagEnabled, true);
      assert.equal(text.status, 'NOT READY');
      const images = findRow('Live images');
      assert.equal(images.flagEnabled, true);
      assert.equal(images.status, 'READY');
      assert.equal(images.variables.find((item) => item.name === 'OPENAI_API_KEY')?.present, false);
      assert.equal(images.variables.find((item) => item.name === 'REPLICATE_API_TOKEN')?.present, true);
      assert.equal(
        readinessReportLeaksSecrets(buildReadinessReport(), ['replicate-sentinel-do-not-print']),
        false
      );
    } finally {
      restore(prev);
    }
  });

  it('stays off the public status payload and is mounted for admins', () => {
    const status = readFileSync(join(dir, '../routes/status.routes.ts'), 'utf8');
    const admin = readFileSync(join(dir, '../routes/admin.routes.ts'), 'utf8');
    const page = readFileSync(join(dir, '../../../frontend/src/pages/admin/AdminPage.tsx'), 'utf8');
    assert.doesNotMatch(status, /buildReadinessReport/);
    assert.match(admin, /\/readiness/);
    assert.match(admin, /authenticate, requireRole/);
    assert.match(page, /item.present \? 'JA' : 'NEIN'/);
    assert.match(page, /keine Keys/);
  });
});
