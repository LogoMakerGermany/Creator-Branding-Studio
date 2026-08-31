import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

describe('nexter conversation safety', () => {
  it('chat never confirms a paid quote (no start without UI confirm)', () => {
    const src = readFileSync(join(dir, 'conversation.service.ts'), 'utf8');
    assert.equal(src.includes('confirmQuote'), false);
    assert.match(src, /createQuote/);
    assert.match(src, /detectLockedTraitOverride/);
    assert.match(src, /detectFakeDetectionRequest/);
    assert.match(src, /detectExternalPublishIntent/);
    assert.match(src, /detectChangeIntent/);
    assert.ok(src.indexOf('detectChangeIntent') < src.indexOf('createQuote('));
    assert.ok(src.indexOf('detectLockedTraitOverride') < src.indexOf('createQuote('));
    assert.ok(src.indexOf('detectFakeDetectionRequest') < src.indexOf('createQuote('));
    assert.ok(src.indexOf('detectExternalPublishIntent') < src.indexOf('createQuote('));
    assert.match(src, /dsList\(COLLECTION, \{ userId/);
  });
});
