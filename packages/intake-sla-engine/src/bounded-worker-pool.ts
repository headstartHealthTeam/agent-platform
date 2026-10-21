import { setTimeout as delay } from 'node:timers/promises';

export interface WorkerProgress {
  readonly completed: number;
  readonly required: number;
  readonly retries: number;
  readonly concurrencyLimit: number;
  readonly elapsedMs: number;
}
export interface BoundedWorkerOptions<T, R> {
  readonly items: readonly T[];
  readonly work: (
    item: T,
    context: { readonly signal: AbortSignal | undefined; readonly attempt: number }
  ) => Promise<R>;
  readonly persist: (item: T, result: R) => Promise<unknown>;
  readonly concurrency?: number;
  readonly maxAttempts?: number;
  readonly signal?: AbortSignal;
  readonly sleep?: (ms: number) => Promise<unknown>;
  readonly random?: () => number;
  readonly onProgress?: (progress: WorkerProgress) => void;
}

function errorField(error: unknown, field: string): unknown {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function'))
    return undefined;
  const value: unknown = Reflect.get(error, field);
  return value;
}
function transient(error: unknown): boolean {
  const status = errorField(error, 'status');
  return status === 429 || (Number(status) >= 500 && Number(status) <= 599);
}

class WorkerPool<T, R> {
  private next = 0;
  private completed = 0;
  private failure: unknown;
  private active = 0;
  private limit: number;
  private retries = 0;
  private writer: Promise<unknown> = Promise.resolve();
  private readonly results: R[];
  private readonly queue: ArrayIterator<[number, T]>;
  private readonly startedAt = Date.now();
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<unknown>;
  private readonly random: () => number;
  private hasFailure(): boolean {
    return Boolean(this.failure);
  }
  constructor(private readonly options: BoundedWorkerOptions<T, R>) {
    this.concurrency = options.concurrency ?? 2;
    this.maxAttempts = options.maxAttempts ?? 3;
    if (
      !Number.isInteger(this.concurrency) ||
      this.concurrency < 1 ||
      this.concurrency > 4 ||
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 3
    )
      throw new Error('Invalid bounded worker limits');
    this.limit = this.concurrency;
    this.results = new Array<R>(options.items.length);
    this.queue = options.items.entries();
    this.sleep =
      options.sleep ?? ((ms): Promise<void> => delay(ms, undefined, { signal: options.signal }));
    this.random = options.random ?? Math.random;
  }

  private async attempt(item: T): Promise<R> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.options.work(item, { signal: this.options.signal, attempt });
      } catch (error) {
        if (!transient(error) || attempt >= this.maxAttempts || this.options.signal?.aborted)
          throw error;
        this.retries++;
        if (errorField(error, 'status') === 429) this.limit = 1;
        const retryMs = Math.max(
          Number(errorField(error, 'retryAfterMs')) || 0,
          250 * 2 ** (attempt - 1) + Math.floor(this.random() * 250)
        );
        if (retryMs > 60000)
          throw new Error('Provider retry window exceeds bounded execution; resume later', {
            cause: error,
          });
        await this.sleep(retryMs);
      }
    }
  }

  private async save(index: number, item: T, result: R): Promise<void> {
    const saved = this.writer.then(() => this.options.persist(item, result));
    this.writer = saved;
    await saved;
    this.results.splice(index, 1, result);
    this.completed++;
    this.options.onProgress?.({
      completed: this.completed,
      required: this.options.items.length,
      retries: this.retries,
      concurrencyLimit: this.limit,
      elapsedMs: Date.now() - this.startedAt,
    });
  }

  private async worker(): Promise<void> {
    while (
      !this.hasFailure() &&
      !this.options.signal?.aborted &&
      this.next < this.options.items.length
    ) {
      if (this.active >= this.limit) {
        await this.sleep(10);
        continue;
      }
      const entry = this.queue.next();
      if (entry.done) return;
      const [index, item] = entry.value;
      this.next++;
      this.active++;
      try {
        const result = await this.attempt(item);
        await this.save(index, item, result);
      } catch (error) {
        this.failure ??= error;
      } finally {
        this.active--;
      }
    }
  }

  async run(): Promise<R[]> {
    const workers = await Promise.allSettled(
      Array.from({ length: this.concurrency }, async () => this.worker())
    );
    for (const result of workers) if (result.status === 'rejected') this.failure ??= result.reason;
    await this.writer.catch((error: unknown) => {
      this.failure ??= error;
    });
    if (this.hasFailure())
      throw this.failure instanceof Error
        ? this.failure
        : new Error('Bounded worker failed', { cause: this.failure });
    if (this.options.signal?.aborted)
      throw new Error('Interpretation cancelled; completed checkpoints retained');
    return this.results;
  }
}

/** Intake's reviewed retry/concurrency limits; successful in-flight work is durably saved before failure. */
export async function runBoundedWorkers<T, R>(options: BoundedWorkerOptions<T, R>): Promise<R[]> {
  return new WorkerPool(options).run();
}
