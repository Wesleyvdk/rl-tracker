/**
 * Async request queue that serializes web scraping requests
 * with a cooldown between them to avoid triggering Cloudflare.
 */

const COOLDOWN_MS = 4000; // 4 seconds between requests
const MAX_QUEUE_WAIT_MS = 14 * 60 * 1000; // 14 minutes — drop before Discord's 15min token expiry

class RequestQueue {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    enqueuedAt: number;
  }> = [];
  private running = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, enqueuedAt: Date.now() });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running || this.queue.length === 0) return;

    this.running = true;
    const entry = this.queue.shift()!;
    const { fn, resolve, reject, enqueuedAt } = entry;

    // Drop entries that have been waiting too long (interaction token would be expired)
    const waited = Date.now() - enqueuedAt;
    if (waited > MAX_QUEUE_WAIT_MS) {
      console.log(`Queue entry dropped — waited ${Math.round(waited / 1000)}s (max ${MAX_QUEUE_WAIT_MS / 1000}s)`);
      reject(new Error("Request waited too long in queue"));
      this.running = false;
      this.processNext();
      return;
    }

    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      // Cooldown before allowing the next request
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
      this.running = false;
      this.processNext();
    }
  }
}

export const requestQueue = new RequestQueue();
