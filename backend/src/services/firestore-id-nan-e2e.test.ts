import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  LEGAL_TEXT_STATUS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
} from '@ucbs/shared';
import { assertValidFirestoreDocumentId, FirestoreWriteGuardError } from '../lib/firestore-payload.js';
import { dsSet } from '../lib/data-store.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { getOrCreateUser, updateCoinBalance } from './user.service.js';
import { deductAmount, getCoinBalance, getTransactions, refundOnce } from './coins.service.js';
import { createQuote } from './nexter/quotes.service.js';
import { createInviteCode } from './invite.service.js';
import { getLegalPage } from './legal.service.js';
import { ServiceError } from '../lib/errors.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

async function seed(tag: string) {
  return getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.fs-h.test`, tag);
}

describe('Block H — Firestore empty-id / NaN hardening', () => {
  it('rejects invalid document IDs and non-finite payloads on dsSet', async () => {
    await assert.rejects(() => dsSet('files', '', { name: 'x' }), FirestoreWriteGuardError);
    await assert.rejects(() => dsSet('files', '   ', { name: 'x' }), FirestoreWriteGuardError);
    await assert.rejects(() => dsSet('files', 'users/abc', { name: 'x' }), FirestoreWriteGuardError);
    await assert.rejects(() => dsSet('files', randomUUID(), { size: Number.NaN }), FirestoreWriteGuardError);
    await assert.rejects(
      () => dsSet('generationJobs', randomUUID(), { progress: Number.POSITIVE_INFINITY }),
      FirestoreWriteGuardError
    );
    const id = randomUUID();
    await dsSet('files', id, { id, bio: '', size: 0, delta: -1 });
  });

  it('coin debit/refund NaN or Infinity does not mutate; corrupt balance is not overwritten', async () => {
    const user = await seed('coins');
    const before = await getCoinBalance(user.id);
    const txsBefore = (await getTransactions(user.id)).length;
    await assert.rejects(() => deductAmount(user.id, Number.NaN, 'nan debit'));
    await assert.rejects(() => deductAmount(user.id, Number.POSITIVE_INFINITY, 'inf debit'));
    await assert.rejects(() =>
      refundOnce({
        userId: user.id,
        chargeTransactionId: randomUUID(),
        amount: Number.NaN,
        description: 'nan refund',
      })
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await getTransactions(user.id)).length, txsBefore);

    await assert.rejects(() => updateCoinBalance(user.id, Number.NaN), FirestoreWriteGuardError);
    await assert.rejects(() => updateCoinBalance(user.id, Number.POSITIVE_INFINITY), FirestoreWriteGuardError);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('quote NaN and invite maxUses NaN are rejected; job/file non-finite cannot persist', async () => {
    const user = await seed('quote');
    await assert.rejects(() => createQuote(user.id, 'logo', undefined, undefined, Number.NaN), ServiceError);
    await assert.rejects(
      () => createInviteCode({ description: 'bad', maximumUses: Number.NaN }, 'admin'),
      ServiceError
    );
    const okInvite = await createInviteCode({ description: 'ok' }, 'admin');
    assert.equal(okInvite.maximumUses, 1);
    await assert.rejects(
      () => dsSet('generationJobs', randomUUID(), { userId: user.id, progress: Number.NaN }),
      FirestoreWriteGuardError
    );
    await assert.rejects(
      () => dsSet('files', randomUUID(), { userId: user.id, size: Number.POSITIVE_INFINITY }),
      FirestoreWriteGuardError
    );
  });

  it('preserves welcome 50, pricing, legal draft, oauth/email id shapes, and write guards', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.equal(getLegalPage('impressum')?.draft, true);
    assert.doesNotThrow(() => assertValidFirestoreDocumentId('welcome:uid-1'));
    assert.doesNotThrow(() => assertValidFirestoreDocumentId('discord:99'));
    assert.doesNotThrow(() => assertValidFirestoreDocumentId('charge:' + randomUUID()));
    const coins = src('coins.service.ts');
    assert.match(coins, /omitUndefinedFields/);
    assert.match(coins, /transaction\.set/);
    assert.match(coins, /firestoreDocId/);
    const dna = src('dna.service.ts');
    assert.match(dna, /batch\.set/);
    assert.match(dna, /firestoreDocId/);
    const session = src('session-store.service.ts');
    assert.match(session, /t\.set\(ref, omitUndefinedFields/);
    assert.match(session, /firestoreDocId/);
  });
});
