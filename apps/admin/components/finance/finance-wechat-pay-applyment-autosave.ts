export type ApplymentDraftSavePayload = Record<string, unknown>;

export type ApplymentDraftSaveState =
  | "idle"
  | "saving"
  | "saved"
  | "failed";

export type ApplymentDraftSaveContext = {
  generation: number;
  isCurrent: () => boolean;
};

type SaveWaiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

type SaveBatch = {
  generation: number;
  payload: ApplymentDraftSavePayload;
  sequence: number;
  waiters: SaveWaiter[];
};

export class ApplymentDraftSaveCancelledError extends Error {
  constructor() {
    super("进件草稿保存已失效");
    this.name = "ApplymentDraftSaveCancelledError";
  }
}

export function isApplymentDraftSaveCancelledError(
  error: unknown,
): error is ApplymentDraftSaveCancelledError {
  return error instanceof ApplymentDraftSaveCancelledError;
}

export class ApplymentDraftSaveQueue {
  private pending: SaveBatch | null = null;
  private active: SaveBatch | null = null;
  private drainPromise: Promise<void> | null = null;
  private generation = 0;
  private sequence = 0;
  private disposed = false;
  private lastFailure: { sequence: number; error: unknown } | null = null;

  constructor(
    private readonly save: (
      payload: ApplymentDraftSavePayload,
      context: ApplymentDraftSaveContext,
    ) => Promise<unknown>,
  ) {}

  enqueue(payload: ApplymentDraftSavePayload): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new ApplymentDraftSaveCancelledError());
    }

    const sequence = ++this.sequence;
    const promise = new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      if (this.pending?.generation === this.generation) {
        this.pending.payload = payload;
        this.pending.sequence = sequence;
        this.pending.waiters.push(waiter);
        return;
      }
      this.pending = {
        generation: this.generation,
        payload,
        sequence,
        waiters: [waiter],
      };
    });
    this.ensureDrain();
    return promise;
  }

  async flush(): Promise<void> {
    while (this.pending || this.drainPromise) {
      const drain = this.ensureDrain();
      if (drain) await drain;
    }
    if (this.lastFailure) throw this.lastFailure.error;
  }

  reset(): void {
    this.generation += 1;
    this.lastFailure = null;
    this.cancelBatch(this.pending);
    this.pending = null;
    this.cancelBatch(this.active);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
  }

  private ensureDrain(): Promise<void> | null {
    if (this.drainPromise || !this.pending) return this.drainPromise;
    const drain = this.drain().finally(() => {
      if (this.drainPromise === drain) this.drainPromise = null;
      if (this.pending) this.ensureDrain();
    });
    this.drainPromise = drain;
    return drain;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const batch = this.pending;
      this.pending = null;
      this.active = batch;
      const context: ApplymentDraftSaveContext = {
        generation: batch.generation,
        isCurrent: () => this.isBatchCurrent(batch),
      };

      try {
        if (!context.isCurrent()) throw new ApplymentDraftSaveCancelledError();
        await this.save(batch.payload, context);
        if (!context.isCurrent()) throw new ApplymentDraftSaveCancelledError();
        this.lastFailure = null;
        batch.waiters.forEach((waiter) => waiter.resolve());
      } catch (error) {
        const reportedError = context.isCurrent()
          ? error
          : new ApplymentDraftSaveCancelledError();
        if (context.isCurrent()) {
          this.lastFailure = {
            sequence: batch.sequence,
            error: reportedError,
          };
        }
        batch.waiters.forEach((waiter) => waiter.reject(reportedError));
      } finally {
        if (this.active === batch) this.active = null;
      }
    }
  }

  private isBatchCurrent(batch: SaveBatch): boolean {
    return !this.disposed && batch.generation === this.generation;
  }

  private cancelBatch(batch: SaveBatch | null): void {
    if (!batch) return;
    const error = new ApplymentDraftSaveCancelledError();
    batch.waiters.forEach((waiter) => waiter.reject(error));
  }
}
