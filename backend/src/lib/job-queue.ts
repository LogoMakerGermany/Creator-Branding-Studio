type QueueTask<T> = () => Promise<T>;

const queue: Array<{ run: QueueTask<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void; attempts: number }> = [];
let draining = false;
const MAX_ATTEMPTS = 2;

export async function enqueueJob<T>(run: QueueTask<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: run as QueueTask<unknown>,
      resolve: (v) => resolve(v as T),
      reject,
      attempts: 0,
    });
    void drain();
  });
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    try {
      const result = await item.run();
      item.resolve(result);
    } catch (err) {
      item.attempts += 1;
      if (item.attempts < MAX_ATTEMPTS) {
        queue.unshift(item);
      } else {
        item.reject(err);
      }
    }
  }
  draining = false;
}

export function queueLength(): number {
  return queue.length;
}
