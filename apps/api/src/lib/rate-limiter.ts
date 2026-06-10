export interface RateLimiter {
  schedule<T>(task: () => Promise<T>): Promise<T>;
}

interface QueuedTask {
  run: () => void;
}

export function createRateLimiter(intervalMs: number): RateLimiter {
  const queue: QueuedTask[] = [];
  let lastRunAt = 0;
  let draining = false;

  function drain(): void {
    if (draining) {
      return;
    }
    const next = queue.shift();
    if (!next) {
      return;
    }
    draining = true;
    const wait = Math.max(0, lastRunAt + intervalMs - Date.now());
    setTimeout(() => {
      lastRunAt = Date.now();
      draining = false;
      next.run();
      drain();
    }, wait);
  }

  return {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push({
          run: () => {
            task().then(resolve, reject);
          },
        });
        drain();
      });
    },
  };
}
