import { CoinSpendCategory, COIN_COSTS, COIN_PACKAGE_DEFINITIONS } from '@ucbs/shared';
import type { CoinSourceType, CoinTransaction, CoinTransactionType } from '@ucbs/shared';
import { getStripePriceId } from '../config/env.js';
import { isDevMode } from '../config/env.js';
import { devStore } from '../lib/dev-store.js';
import { coinsLockKey, withDevLock } from '../lib/dev-mutex.js';
import { getUserById, updateCoinBalance } from './user.service.js';
import { randomUUID } from 'node:crypto';

export const COIN_PACKAGES = COIN_PACKAGE_DEFINITIONS.map((pkg) => ({
  ...pkg,
  stripePriceId: getStripePriceId(pkg.id),
}));

const TX_COLLECTION = 'coin_transactions';
const IDEMP_COLLECTION = 'coin_idempotency';

export interface CoinTxOptions {
  idempotencyKey?: string;
  sourceType?: CoinSourceType | string;
  sourceId?: string;
  jobId?: string;
  quoteId?: string;
  paymentProvider?: 'stripe' | 'paypal';
  paymentReference?: string;
  refundOfTransactionId?: string;
  adminActorId?: string;
  reason?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  stripeSessionId?: string;
  paypalOrderId?: string;
  packageId?: string;
  provider?: 'stripe' | 'paypal';
  persistCharge?: {
    id: string;
    category?: string;
    description: string;
    jobId?: string;
    quoteId?: string;
  };
}

export interface CoinMutationResult {
  success: boolean;
  duplicate: boolean;
  newBalance: number;
  previousBalance: number;
  amount: number;
  transactionId?: string;
}

function sanitizeDocId(key: string): string {
  return key.replace(/[/#[\]]/g, '_').slice(0, 700);
}

function buildTransaction(params: {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  options?: CoinTxOptions;
}): CoinTransaction {
  const { id, userId, type, amount, balanceBefore, balanceAfter, description, options } = params;
  const tx: CoinTransaction = {
    id,
    userId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    description,
    createdAt: new Date().toISOString(),
  };
  if (options?.category) tx.category = options.category;
  if (options?.reason) tx.reason = options.reason;
  if (options?.sourceType) tx.sourceType = options.sourceType;
  if (options?.sourceId) tx.sourceId = options.sourceId;
  if (options?.jobId) tx.jobId = options.jobId;
  if (options?.quoteId) tx.quoteId = options.quoteId;
  if (options?.paymentProvider) tx.paymentProvider = options.paymentProvider;
  if (options?.paymentReference) tx.paymentReference = options.paymentReference;
  if (options?.refundOfTransactionId) tx.refundOfTransactionId = options.refundOfTransactionId;
  if (options?.idempotencyKey) tx.idempotencyKey = options.idempotencyKey;
  if (options?.adminActorId) tx.adminActorId = options.adminActorId;
  if (options?.stripeSessionId) tx.stripePaymentIntentId = options.stripeSessionId;
  if (options?.paypalOrderId) tx.paypalOrderId = options.paypalOrderId;
  if (options?.packageId || options?.provider || options?.metadata) {
    tx.metadata = {
      ...(options.metadata ?? {}),
      ...(options.packageId ? { packageId: options.packageId } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
    };
  }
  return tx;
}

async function readIdempotency(
  key: string
): Promise<{ transactionId: string; newBalance: number; previousBalance: number; amount: number } | null> {
  const id = sanitizeDocId(key);
  if (isDevMode()) {
    const row = devStore.getFromCollection(IDEMP_COLLECTION, id);
    if (!row?.transactionId) return null;
    return {
      transactionId: String(row.transactionId),
      newBalance: Number(row.newBalance ?? 0),
      previousBalance: Number(row.previousBalance ?? 0),
      amount: Number(row.amount ?? 0),
    };
  }
  const { getFirestore } = await import('../config/firebase.js');
  const snap = await getFirestore().collection(IDEMP_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    transactionId: String(data.transactionId),
    newBalance: Number(data.newBalance ?? 0),
    previousBalance: Number(data.previousBalance ?? 0),
    amount: Number(data.amount ?? 0),
  };
}

function duplicateResult(
  hit: { transactionId: string; newBalance: number; previousBalance: number; amount: number },
  successIfCredit: boolean
): CoinMutationResult {
  const success = hit.amount >= 0 ? true : successIfCredit;
  return {
    success: hit.amount < 0 ? hit.amount !== 0 : success,
    duplicate: true,
    newBalance: hit.newBalance,
    previousBalance: hit.previousBalance,
    amount: hit.amount,
    transactionId: hit.transactionId,
  };
}

async function applyMutationDev(input: {
  userId: string;
  delta: number;
  type: CoinTransactionType;
  description: string;
  options?: CoinTxOptions;
}): Promise<CoinMutationResult> {
  return withDevLock(coinsLockKey(input.userId), async () => {
    if (input.options?.idempotencyKey) {
      const hit = await readIdempotency(input.options.idempotencyKey);
      if (hit) {
        return {
          success: hit.amount >= 0 || true,
          duplicate: true,
          newBalance: hit.newBalance,
          previousBalance: hit.previousBalance,
          amount: hit.amount,
          transactionId: hit.transactionId,
        };
      }
    }

    const user = await getUserById(input.userId);
    if (!user) throw new Error('User not found');
    const previousBalance = user.coinBalance ?? 0;
    if (input.delta < 0 && previousBalance < Math.abs(input.delta)) {
      return {
        success: false,
        duplicate: false,
        newBalance: previousBalance,
        previousBalance,
        amount: input.delta,
      };
    }

    const newBalance = previousBalance + input.delta;
    await updateCoinBalance(input.userId, newBalance);
    const tx = buildTransaction({
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      amount: input.delta,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      description: input.description,
      options: input.options,
    });
    const txRecord = tx as unknown as Record<string, unknown>;
    devStore.addTransaction(txRecord);
    devStore.saveToCollection(TX_COLLECTION, tx.id, txRecord);
    if (input.options?.idempotencyKey) {
      devStore.saveToCollection(IDEMP_COLLECTION, sanitizeDocId(input.options.idempotencyKey), {
        transactionId: tx.id,
        userId: input.userId,
        newBalance,
        previousBalance,
        amount: input.delta,
        createdAt: tx.createdAt,
      });
    }
    if (input.options?.persistCharge && input.delta < 0) {
      const now = tx.createdAt;
      const pc = input.options.persistCharge;
      devStore.saveToCollection('billable_charges', pc.id, {
        id: pc.id,
        userId: input.userId,
        amount: Math.abs(input.delta),
        chargeTransactionId: tx.id,
        status: 'charged',
        category: pc.category,
        description: pc.description,
        jobId: pc.jobId,
        quoteId: pc.quoteId,
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      success: true,
      duplicate: false,
      newBalance,
      previousBalance,
      amount: input.delta,
      transactionId: tx.id,
    };
  });
}

async function applyMutationFirestore(input: {
  userId: string;
  delta: number;
  type: CoinTransactionType;
  description: string;
  options?: CoinTxOptions;
}): Promise<CoinMutationResult> {
  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const userRef = db.collection('users').doc(input.userId);
  const txId = randomUUID();
  const txRef = db.collection(TX_COLLECTION).doc(txId);
  const idempRef = input.options?.idempotencyKey
    ? db.collection(IDEMP_COLLECTION).doc(sanitizeDocId(input.options.idempotencyKey))
    : null;

  return db.runTransaction(async (transaction) => {
    if (idempRef) {
      const existing = await transaction.get(idempRef);
      if (existing.exists) {
        const data = existing.data()!;
        return {
          success: true,
          duplicate: true,
          newBalance: Number(data.newBalance ?? 0),
          previousBalance: Number(data.previousBalance ?? 0),
          amount: Number(data.amount ?? 0),
          transactionId: String(data.transactionId),
        };
      }
    }

    const snap = await transaction.get(userRef);
    if (!snap.exists) throw new Error('User not found');
    const previousBalance = Number(snap.data()?.coinBalance ?? 0);
    if (input.delta < 0 && previousBalance < Math.abs(input.delta)) {
      return {
        success: false,
        duplicate: false,
        newBalance: previousBalance,
        previousBalance,
        amount: input.delta,
      };
    }

    const newBalance = previousBalance + input.delta;
    const now = new Date().toISOString();
    transaction.update(userRef, { coinBalance: newBalance, updatedAt: now });
    const tx = buildTransaction({
      id: txId,
      userId: input.userId,
      type: input.type,
      amount: input.delta,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      description: input.description,
      options: input.options,
    });
    transaction.set(txRef, tx);
    if (idempRef) {
      transaction.set(idempRef, {
        transactionId: txId,
        userId: input.userId,
        newBalance,
        previousBalance,
        amount: input.delta,
        createdAt: now,
      });
    }
    if (input.options?.persistCharge && input.delta < 0) {
      const pc = input.options.persistCharge;
      const chargeRef = db.collection('billable_charges').doc(pc.id);
      transaction.set(chargeRef, {
        id: pc.id,
        userId: input.userId,
        amount: Math.abs(input.delta),
        chargeTransactionId: txId,
        status: 'charged',
        category: pc.category,
        description: pc.description,
        jobId: pc.jobId,
        quoteId: pc.quoteId,
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      success: true,
      duplicate: false,
      newBalance,
      previousBalance,
      amount: input.delta,
      transactionId: txId,
    };
  });
}

export async function applyCoinMutation(input: {
  userId: string;
  delta: number;
  type: CoinTransactionType;
  description: string;
  options?: CoinTxOptions;
}): Promise<CoinMutationResult> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error('Delta must be a non-zero integer');
  }
  if (isDevMode()) {
    return applyMutationDev(input);
  }
  return applyMutationFirestore(input);
}

export async function getCoinBalance(userId: string): Promise<number> {
  const user = await getUserById(userId);
  return user?.coinBalance ?? 0;
}

export async function deductCoins(
  userId: string,
  category: CoinSpendCategory,
  description: string,
  options?: CoinTxOptions
): Promise<{ success: boolean; newBalance: number; cost: number; transactionId?: string; duplicate?: boolean }> {
  const cost = COIN_COSTS[category];
  const result = await applyCoinMutation({
    userId,
    delta: -cost,
    type: 'spend',
    description,
    options: {
      ...options,
      category,
      sourceType: options?.sourceType ?? 'generation',
    },
  });
  if (!result.success) {
    return { success: false, newBalance: result.newBalance, cost, duplicate: result.duplicate };
  }
  return {
    success: true,
    newBalance: result.newBalance,
    cost,
    transactionId: result.transactionId,
    duplicate: result.duplicate,
  };
}

export async function deductAmount(
  userId: string,
  amount: number,
  description: string,
  options?: CoinTxOptions
): Promise<{ success: boolean; newBalance: number; cost: number; transactionId?: string; duplicate?: boolean }> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  const result = await applyCoinMutation({
    userId,
    delta: -amount,
    type: 'spend',
    description,
    options: {
      ...options,
      category: options?.category ?? CoinSpendCategory.MARKETPLACE_PURCHASE,
      sourceType: options?.sourceType ?? 'marketplace',
    },
  });
  if (!result.success) {
    return { success: false, newBalance: result.newBalance, cost: amount, duplicate: result.duplicate };
  }
  return {
    success: true,
    newBalance: result.newBalance,
    cost: amount,
    transactionId: result.transactionId,
    duplicate: result.duplicate,
  };
}

export interface AddCoinsOptions extends CoinTxOptions {}

export async function addCoins(
  userId: string,
  amount: number,
  description: string,
  type: 'purchase' | 'bonus' | 'refund' = 'purchase',
  options?: AddCoinsOptions
): Promise<number> {
  const result = await addCoinsResult(userId, amount, description, type, options);
  if (!result.success) {
    throw new Error('Failed to credit coins');
  }
  return result.newBalance;
}

export async function addCoinsResult(
  userId: string,
  amount: number,
  description: string,
  type: 'purchase' | 'bonus' | 'refund' = 'purchase',
  options?: AddCoinsOptions
): Promise<CoinMutationResult> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
  return applyCoinMutation({
    userId,
    delta: amount,
    type,
    description,
    options: {
      ...options,
      sourceType:
        options?.sourceType ??
        (type === 'refund' ? 'refund' : type === 'bonus' ? 'welcome' : 'purchase'),
      paymentProvider: options?.paymentProvider ?? options?.provider,
      paymentReference: options?.paymentReference ?? options?.stripeSessionId ?? options?.paypalOrderId,
    },
  });
}

export async function refundOnce(params: {
  userId: string;
  chargeTransactionId: string;
  amount: number;
  description: string;
  jobId?: string;
  quoteId?: string;
  idempotencyKey?: string;
}): Promise<CoinMutationResult> {
  if (params.amount <= 0) {
    throw new Error('Refund amount must be positive');
  }
  return applyCoinMutation({
    userId: params.userId,
    delta: params.amount,
    type: 'refund',
    description: params.description,
    options: {
      idempotencyKey: params.idempotencyKey ?? `refund:${params.chargeTransactionId}`,
      refundOfTransactionId: params.chargeTransactionId,
      sourceType: 'refund',
      sourceId: params.chargeTransactionId,
      jobId: params.jobId,
      quoteId: params.quoteId,
    },
  });
}

export async function recordWelcomeGrant(params: {
  userId: string;
  amount: number;
  createdAt: string;
}): Promise<void> {
  if (params.amount <= 0) return;
  await applyCoinMutation({
    userId: params.userId,
    delta: params.amount,
    type: 'bonus',
    description: 'Willkommensbonus',
    options: {
      idempotencyKey: `welcome:${params.userId}`,
      sourceType: 'welcome',
      sourceId: params.userId,
    },
  });
}

/** Write welcome ledger without adding coins again (balance already set on create). */
export async function writeWelcomeLedgerOnly(params: {
  userId: string;
  amount: number;
  createdAt: string;
}): Promise<void> {
  if (params.amount <= 0) return;
  const key = `welcome:${params.userId}`;
  const existing = await readIdempotency(key);
  if (existing) return;

  const tx = buildTransaction({
    id: randomUUID(),
    userId: params.userId,
    type: 'bonus',
    amount: params.amount,
    balanceBefore: 0,
    balanceAfter: params.amount,
    description: 'Willkommensbonus',
    options: { idempotencyKey: key, sourceType: 'welcome', sourceId: params.userId },
  });
  tx.createdAt = params.createdAt;

  if (isDevMode()) {
    await withDevLock(coinsLockKey(params.userId), async () => {
      const again = await readIdempotency(key);
      if (again) return;
      const rec = tx as unknown as Record<string, unknown>;
      devStore.addTransaction(rec);
      devStore.saveToCollection(TX_COLLECTION, tx.id, rec);
      devStore.saveToCollection(IDEMP_COLLECTION, sanitizeDocId(key), {
        transactionId: tx.id,
        userId: params.userId,
        newBalance: params.amount,
        previousBalance: 0,
        amount: params.amount,
        createdAt: params.createdAt,
      });
    });
    return;
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const idempRef = db.collection(IDEMP_COLLECTION).doc(sanitizeDocId(key));
  const txRef = db.collection(TX_COLLECTION).doc(tx.id);
  await db.runTransaction(async (t) => {
    const snap = await t.get(idempRef);
    if (snap.exists) return;
    t.set(txRef, tx);
    t.set(idempRef, {
      transactionId: tx.id,
      userId: params.userId,
      newBalance: params.amount,
      previousBalance: 0,
      amount: params.amount,
      createdAt: params.createdAt,
    });
  });
}

export async function getTransactionById(id: string): Promise<CoinTransaction | null> {
  if (isDevMode()) {
    const row = devStore.getFromCollection(TX_COLLECTION, id);
    if (row) return row as unknown as CoinTransaction;
    const fromList = (devStore.getTransactions() as CoinTransaction[]).find((t) => t.id === id);
    return fromList ?? null;
  }
  const { getFirestore } = await import('../config/firebase.js');
  const snap = await getFirestore().collection(TX_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CoinTransaction;
}

function sortTransactionsNewestFirst(txs: CoinTransaction[]): CoinTransaction[] {
  return txs.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

export const TX_LIST_DEFAULT = 20;
export const TX_LIST_MAX = 100;

function clampTxPage(limit?: number, offset?: number): { limit: number; offset: number } {
  const lim = Number.isFinite(limit) ? Math.floor(limit as number) : TX_LIST_DEFAULT;
  const off = Number.isFinite(offset) ? Math.floor(offset as number) : 0;
  return {
    limit: Math.min(TX_LIST_MAX, Math.max(1, lim)),
    offset: Math.max(0, off),
  };
}

export interface CoinTransactionPage {
  transactions: CoinTransaction[];
  total: number;
  limit: number;
  offset: number;
}

/** Own ledger only. Newest first. Used by the Coins UI. */
export async function listOwnedTransactions(
  userId: string,
  opts?: { limit?: number; offset?: number }
): Promise<CoinTransactionPage> {
  const { limit, offset } = clampTxPage(opts?.limit, opts?.offset);

  if (isDevMode()) {
    const all = sortTransactionsNewestFirst(
      (devStore.getTransactionsByUser(userId) as CoinTransaction[]).filter((tx) => tx.userId === userId)
    );
    return {
      transactions: all.slice(offset, offset + limit),
      total: all.length,
      limit,
      offset,
    };
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const base = db.collection(TX_COLLECTION).where('userId', '==', userId);
  const [countSnap, snap] = await Promise.all([
    base.count().get(),
    base.orderBy('createdAt', 'desc').offset(offset).limit(limit).get(),
  ]);

  return {
    transactions: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CoinTransaction),
    total: countSnap.data().count,
    limit,
    offset,
  };
}

export async function getTransactions(userId: string, limit = 50): Promise<CoinTransaction[]> {
  if (isDevMode()) {
    return sortTransactionsNewestFirst(
      (devStore.getTransactionsByUser(userId) as CoinTransaction[]).filter((tx) => tx.userId === userId)
    ).slice(0, limit);
  }

  const { getFirestore } = await import('../config/firebase.js');
  const db = getFirestore();
  const snap = await db
    .collection(TX_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CoinTransaction);
}

export type CoinPricingMode = 'fixed' | 'quote';

export interface PublicCoinCatalogItem {
  id: string;
  category?: CoinSpendCategory;
  label: string;
  coins: number | null;
  pricing: CoinPricingMode;
  note?: string;
}

const STUDIO_CATALOG: Array<{
  id: string;
  category: CoinSpendCategory;
  label: string;
  pricing: CoinPricingMode;
  note?: string;
}> = [
  { id: 'logo', category: CoinSpendCategory.LOGO_GENERATION, label: 'Logo-Generierung', pricing: 'fixed' },
  { id: 'banner', category: CoinSpendCategory.BANNER_GENERATION, label: 'Banner-Generierung', pricing: 'fixed' },
  { id: 'facecam', category: CoinSpendCategory.FACECAM_GENERATION, label: 'Facecam-Generierung', pricing: 'fixed' },
  { id: 'overlay', category: CoinSpendCategory.OVERLAY_GENERATION, label: 'Overlay-Generierung', pricing: 'fixed' },
  { id: 'sticker', category: CoinSpendCategory.STICKER_GENERATION, label: 'Sticker-Generierung', pricing: 'fixed' },
  {
    id: 'mockup',
    category: CoinSpendCategory.MOCKUP_GENERATION,
    label: 'Lifestyle-Mockup',
    pricing: 'fixed',
    note: 'Lokales Composite ist kostenlos.',
  },
  { id: 'animation', category: CoinSpendCategory.ANIMATION_GENERATION, label: 'Animation-Generierung', pricing: 'fixed' },
  { id: 'music', category: CoinSpendCategory.AI_MUSIC, label: 'Musik-Generierung', pricing: 'fixed' },
  { id: 'voice', category: CoinSpendCategory.AI_VOICE, label: 'Stimmen-Generierung', pricing: 'fixed' },
  { id: 'nexter_voice', category: CoinSpendCategory.NEXTER_VOICE, label: 'Nexter-Stimme', pricing: 'fixed' },
  { id: 'text', category: CoinSpendCategory.TEXT_GENERATION, label: 'Text-Generierung', pricing: 'fixed' },
  { id: 'video', category: CoinSpendCategory.AI_VIDEO, label: 'Video-Generierung (Provider)', pricing: 'fixed' },
  { id: 'video_edit', category: CoinSpendCategory.VIDEO_EDIT, label: 'Video-Captions (Provider)', pricing: 'fixed' },
  { id: 'shorts', category: CoinSpendCategory.SHORTS_CLIP, label: 'Shorts-Clip', pricing: 'fixed' },
  {
    id: 'komplettset',
    category: CoinSpendCategory.STREAMSET_PACK,
    label: 'Komplettset',
    pricing: 'fixed',
    note: '12 Streamset-Assets (Screens, Overlays, Banner, Facecam, Sticker).',
  },
  {
    id: 'streamset_three_part',
    category: CoinSpendCategory.STREAMSET_THREE_PART,
    label: 'Streamset – 3 Teile',
    pricing: 'fixed',
    note: 'Facecam, Startscreen und Banner.',
  },
  { id: 'branding_pack', category: CoinSpendCategory.BRANDING_PACK, label: 'Branding-Paket', pricing: 'fixed' },
  { id: 'ultimate', category: CoinSpendCategory.ULTIMATE_CREATOR_PACK, label: 'Ultimate-Creator-Paket', pricing: 'fixed' },
];

const FREE_ACTION_CATALOG: PublicCoinCatalogItem[] = [
  { id: 'file_preview', label: 'Datei-Vorschau', coins: 0, pricing: 'fixed' },
  { id: 'file_download', label: 'Download', coins: 0, pricing: 'fixed' },
  { id: 'project', label: 'Projektverwaltung', coins: 0, pricing: 'fixed' },
  { id: 'local_mockup', label: 'Lokales Mockup-Composite', coins: 0, pricing: 'fixed' },
  { id: 'local_ffmpeg', label: 'Lokale FFmpeg-Funktionen', coins: 0, pricing: 'fixed' },
  { id: 'settings', label: 'Einstellungen', coins: 0, pricing: 'fixed' },
  { id: 'calendar', label: 'Kalenderplanung', coins: 0, pricing: 'fixed' },
];

/** Central COIN_COSTS catalog for the Coins UI. No second price list. */
export function getPublicCoinCatalog(): {
  currency: 'Coins';
  items: PublicCoinCatalogItem[];
  freeActions: PublicCoinCatalogItem[];
} {
  const items: PublicCoinCatalogItem[] = [
    ...STUDIO_CATALOG.map((row) => ({
      id: row.id,
      category: row.category,
      label: row.label,
      coins: COIN_COSTS[row.category],
      pricing: row.pricing,
      note: row.note,
    })),
    {
      id: 'change_request',
      label: 'Änderungswunsch',
      coins: null,
      pricing: 'quote',
      note: 'Preis wird vor Generierung berechnet (Modulpreis der Original-Generierung).',
    },
    {
      id: 'streamset_custom',
      label: 'Streamset – Auswahl',
      coins: null,
      pricing: 'quote',
      note: 'Andere Zusammenstellungen werden vor Generierung aus den Einzelpreisen berechnet.',
    },
  ];
  return { currency: 'Coins', items, freeActions: FREE_ACTION_CATALOG };
}
