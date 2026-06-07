const userChains = new Map<string, Promise<unknown>>();

/** Serialisiert Coin-Operationen pro User (Race Conditions vermeiden). */
export function withUserCoinLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const tail = userChains.get(userId) ?? Promise.resolve();
  const run = tail.catch(() => undefined).then(work);
  userChains.set(userId, run);
  return run.finally(() => {
    if (userChains.get(userId) === run) userChains.delete(userId);
  });
}
