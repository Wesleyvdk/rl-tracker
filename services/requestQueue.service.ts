interface Options {
  key?: string;
  priority?: "interactive" | "background";
}
interface Entry {
  fn: () => Promise<unknown>;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  expires: number;
  priority: number;
}
export class RequestQueue {
  private queue: Entry[] = [];
  private running = false;
  private pending = new Map<string, Promise<any>>();
  constructor(
    private cooldownMs = 4000,
    private maxWaitMs = 60000,
  ) {}
  enqueue<T>(fn: () => Promise<T>, options: Options = {}): Promise<T> {
    if (options.key && this.pending.has(options.key))
      return this.pending.get(options.key)!;
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
        expires: Date.now() + this.maxWaitMs,
        priority: options.priority === "background" ? 1 : 0,
      });
      this.queue.sort((a, b) => a.priority - b.priority);
    });
    if (options.key) {
      this.pending.set(options.key, promise);
      const cleanup = () => {
        this.pending.delete(options.key!);
      };
      void promise.then(cleanup, cleanup);
    }
    void this.processNext();
    return promise;
  }
  private async processNext(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const entry = this.queue.shift()!;
        if (Date.now() > entry.expires) {
          entry.reject(new Error("Request waited too long in queue"));
          continue;
        }
        try {
          entry.resolve(await entry.fn());
        } catch (error) {
          entry.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
        if (this.cooldownMs)
          await new Promise((resolve) => setTimeout(resolve, this.cooldownMs));
      }
    } finally {
      this.running = false;
    }
  }
}
export const requestQueue = new RequestQueue(
  Number(process.env.SCRAPE_COOLDOWN_MS || 4000),
);
