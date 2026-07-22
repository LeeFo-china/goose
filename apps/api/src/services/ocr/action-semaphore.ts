import type { OcrProviderAction } from "./capabilities";

type SemaphoreState = {
  active: number;
  waiters: Array<() => void>;
};

export class OcrActionSemaphore {
  private readonly states = new Map<OcrProviderAction, SemaphoreState>();

  async run<T>(
    action: OcrProviderAction,
    limit: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.acquire(action, Math.max(1, Math.floor(limit)));
    try {
      return await operation();
    } finally {
      this.release(action);
    }
  }

  private async acquire(action: OcrProviderAction, limit: number) {
    const state = this.states.get(action) ?? { active: 0, waiters: [] };
    this.states.set(action, state);
    if (state.active < limit) {
      state.active += 1;
      return;
    }
    await new Promise<void>((resolve) => state.waiters.push(resolve));
    state.active += 1;
  }

  private release(action: OcrProviderAction) {
    const state = this.states.get(action);
    if (!state) return;
    state.active = Math.max(0, state.active - 1);
    const next = state.waiters.shift();
    if (next) {
      next();
      return;
    }
    if (state.active === 0) this.states.delete(action);
  }
}

export const ocrActionSemaphore = new OcrActionSemaphore();
