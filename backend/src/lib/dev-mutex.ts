const chains = new Map<string, Promise<void>>();

/**
 * Process-local mutex for Dev-Store mutations (JSON files have no transactions).
 * Production Firestore uses runTransaction instead.
 */
export function withDevLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
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
