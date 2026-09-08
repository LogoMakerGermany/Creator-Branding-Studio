import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMusicDuration, parseMusicIntent, MUSIC_PROVIDERS } from '@ucbs/shared';
import { getMusicProviderLimits, assertMusicDurationSupported } from '../../lib/media-providers.js';
import { ServiceError } from '../../lib/errors.js';

describe('music settings / prompt builder', () => {
  it('parses epic 30s gaming stream-intro instrumental', () => {
    const s = parseMusicIntent(
      'Erstelle mir einen 30 Sekunden langen epischen Gaming-Song für mein Stream-Intro ohne Gesang.'
    );
    assert.equal(s.type, 'music');
    assert.equal(s.duration, 30);
    assert.equal(s.assumedDuration, false);
    assert.equal(s.mood, 'epic');
    assert.equal(s.purpose, 'stream-intro');
    assert.equal(s.instrumental, true);
    assert.equal(s.theme, 'gaming');
    assert.match(s.prompt, /Instrumental/i);
    assert.match(s.prompt, /30 second/i);
  });

  it('parses YouTube background music', () => {
    const s = parseMusicIntent('Mach Hintergrundmusik für mein YouTube Video.');
    assert.equal(s.purpose, 'youtube');
    assert.equal(s.duration, undefined);
    assert.equal(s.assumedDuration, true);
  });
});

describe('music duration validation', () => {
  const max = MUSIC_PROVIDERS['replicate-musicgen'].maxDurationSec;

  it('accepts 30 seconds for MusicGen', () => {
    assert.deepEqual(checkMusicDuration(30, max), { ok: true });
  });

  it('E: rejects 120 seconds without truncating', () => {
    const result = checkMusicDuration(120, max);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /120/);
      assert.match(result.message, /30/);
      assert.match(result.message, /nicht stillschweigend gekürzt/);
    }
  });

  it('assertMusicDurationSupported throws MUSIC_DURATION_UNSUPPORTED over max', () => {
    const prevToken = process.env.REPLICATE_API_TOKEN;
    const prevProv = process.env.MUSIC_PROVIDER;
    process.env.REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || 'test-token';
    delete process.env.MUSIC_PROVIDER;
    try {
      assert.throws(
        () => assertMusicDurationSupported(120),
        (err: unknown) => err instanceof ServiceError && err.code === 'MUSIC_DURATION_UNSUPPORTED'
      );
    } finally {
      if (prevToken === undefined) delete process.env.REPLICATE_API_TOKEN;
      else process.env.REPLICATE_API_TOKEN = prevToken;
      if (prevProv === undefined) delete process.env.MUSIC_PROVIDER;
      else process.env.MUSIC_PROVIDER = prevProv;
    }
  });
});

describe('unofficial Suno disabled', () => {
  it('MUSIC_PROVIDER=suno is rejected and does not call sunoapi.org', () => {
    const prev = process.env.MUSIC_PROVIDER;
    process.env.MUSIC_PROVIDER = 'suno';
    try {
      const limits = getMusicProviderLimits();
      assert.equal(limits.ok, false);
      if (!limits.ok) {
        assert.equal(limits.code, 'MUSIC_PROVIDER_DISABLED');
        assert.match(limits.message, /inoffizielle Suno/i);
      }
    } finally {
      if (prev === undefined) delete process.env.MUSIC_PROVIDER;
      else process.env.MUSIC_PROVIDER = prev;
    }
  });
});
