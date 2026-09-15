import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { omitUndefinedFields } from './firestore-payload.js';

function undefinedPaths(value: unknown, path = ''): string[] {
  if (value === undefined) return [path || '(root)'];
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => undefinedPaths(item, `${path}[${i}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    undefinedPaths(nested, path ? `${path}.${key}` : key)
  );
}

class ChargePayload {
  id = 'charge-1';
  jobId: string | undefined = undefined;
  quoteId = 'quote-1';
}

class Timestamp {
  constructor(public seconds: number, public nanoseconds = 0) {}
}

class ServerTimestampTransform {
  isEqual() {
    return true;
  }
}

describe('omitUndefinedFields — optional jobId', () => {
  it('omits top-level jobId when undefined and keeps a real jobId', () => {
    const missing = omitUndefinedFields({
      id: 'doc-1',
      userId: 'user-1',
      jobId: undefined,
      quoteId: undefined,
      amount: 15,
    });
    assert.equal('jobId' in missing, false);
    assert.equal('quoteId' in missing, false);
    assert.equal(missing.amount, 15);
    assert.deepEqual(undefinedPaths(missing), []);

    const present = omitUndefinedFields({
      id: 'doc-2',
      jobId: 'job-abc',
      quoteId: 'quote-xyz',
    });
    assert.equal(present.jobId, 'job-abc');
    assert.equal(present.quoteId, 'quote-xyz');
  });

  it('strips nested optional undefined including class-instance payloads', () => {
    const nested = omitUndefinedFields({
      payload: { changeRequest: true, jobId: undefined, request: 'Mach es dunkler' },
      metadata: { extra: undefined, locked: false },
      items: [{ jobId: undefined, ok: true }, undefined, { jobId: 'keep-me' }],
    });
    assert.equal('jobId' in nested.payload, false);
    assert.equal(nested.payload.request, 'Mach es dunkler');
    assert.equal('extra' in nested.metadata, false);
    assert.equal(nested.metadata.locked, false);
    assert.equal(nested.items.length, 2);
    assert.equal('jobId' in nested.items[0], false);
    assert.equal(nested.items[1].jobId, 'keep-me');
    assert.deepEqual(undefinedPaths(nested), []);

    const fromClass = omitUndefinedFields(new ChargePayload());
    assert.equal('jobId' in fromClass, false);
    assert.equal(fromClass.quoteId, 'quote-1');
    assert.equal(fromClass.id, 'charge-1');
  });

  it('keeps false / 0 / empty string / null and Firestore-native values', () => {
    const when = new Date('2026-01-01T00:00:00.000Z');
    const ts = new Timestamp(1_700_000_000);
    const sentinel = new ServerTimestampTransform();
    const buf = Buffer.from('ok');
    const safe = omitUndefinedFields({
      present: false,
      count: 0,
      mascot: '',
      note: null,
      skip: undefined,
      when,
      ts,
      sentinel,
      buf,
    });
    assert.equal(safe.present, false);
    assert.equal(safe.count, 0);
    assert.equal(safe.mascot, '');
    assert.equal(safe.note, null);
    assert.equal('skip' in safe, false);
    assert.equal(safe.when, when);
    assert.equal(safe.ts, ts);
    assert.equal(safe.sentinel, sentinel);
    assert.equal(safe.buf, buf);
  });
});
