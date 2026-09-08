import { AsyncLocalStorage } from 'node:async_hooks';

const chains = new Map<string, Promise<void>>();
const heldKeys = new AsyncLocalStorage<Set<string>>();

/**
 * Process-local mutex for Dev-Store mutations (JSON files have no transactions).
 * Production Firestore uses runTransaction instead.
 * Same-key nested acquires on the same async stack are reentrant.
 */
export function withDevLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const held = heldKeys.getStore();
  if (held?.has(key)) {
    return Promise.resolve().then(fn);
  }

  const prev = chains.get(key) ?? Promise.resolve();
  const run = (): Promise<T> => {
    const nextHeld = new Set(held);
    nextHeld.add(key);
    return heldKeys.run(nextHeld, fn);
  };
  const next = prev.then(run, run);
  chains.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

export function coinsLockKey(userId: string): string {
  return `coins:${userId}`;
}

export function paymentLockKey(provider: string, paymentId: string): string {
  return `payment:${provider}:${paymentId}`;
}

export function inviteLockKey(inviteId: string): string {
  return `invite:${inviteId}`;
}

export function userLockKey(userId: string): string {
  return `user:${userId}`;
}

export function quoteLockKey(quoteId: string) {
  return `quote:${quoteId}`;
}

export function streamsetRetryLockKey(batchId: string, assetKey: string) {
  return `streamset-retry:${batchId}:${assetKey}`;
}
