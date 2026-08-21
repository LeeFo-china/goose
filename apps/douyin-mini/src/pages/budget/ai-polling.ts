import type { DouyinBudgetAiExplanationResponse } from "../../models";

const POLL_INTERVAL_MS = 2_000;
const AI_RUN_WINDOW_MS = 55_000;
const MAX_POLL_ATTEMPTS = 10;
const POLL_REQUEST_TIMEOUT_MS = 3_000;
const INITIAL_REQUEST_TIMEOUT_MS = 35_000;

export interface BudgetAiPollingScheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

export type BudgetAiPollingRun = Readonly<{
  id: number;
  deadlineAt: number;
}>;

const defaultScheduler: BudgetAiPollingScheduler = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export class BudgetAiPollingCoordinator {
  private nextId = 0;
  private currentId = 0;
  private attempts = 0;
  private cancelScheduled: (() => void) | null = null;

  constructor(private readonly scheduler: BudgetAiPollingScheduler = defaultScheduler) {}

  begin(): BudgetAiPollingRun {
    this.cancel();
    const run = { id: ++this.nextId, deadlineAt: this.scheduler.now() + AI_RUN_WINDOW_MS };
    this.currentId = run.id;
    this.attempts = 0;
    return run;
  }

  isCurrent(run: BudgetAiPollingRun): boolean {
    return run.id === this.currentId;
  }

  remainingMs(run: BudgetAiPollingRun): number {
    return this.isCurrent(run) ? Math.max(0, run.deadlineAt - this.scheduler.now()) : 0;
  }

  scheduleNext(run: BudgetAiPollingRun, callback: () => void): boolean {
    if (!this.isCurrent(run) || this.attempts >= MAX_POLL_ATTEMPTS
      || this.scheduler.now() + POLL_INTERVAL_MS >= run.deadlineAt) return false;
    this.cancelScheduled?.();
    this.attempts += 1;
    this.cancelScheduled = this.scheduler.schedule(() => {
      this.cancelScheduled = null;
      if (this.isCurrent(run)) callback();
    }, POLL_INTERVAL_MS);
    return true;
  }

  cancel() {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
    this.currentId = 0;
  }
}

type BudgetAiRequest = (
  estimateId: string,
  retry: boolean,
  timeoutMs: number,
) => Promise<DouyinBudgetAiExplanationResponse>;

export type BudgetAiAnalysisCallbacks = {
  onResponse(response: DouyinBudgetAiExplanationResponse): void;
  onUncertain(): void;
  onExhausted(): void;
};

export class BudgetAiAnalysisRunner {
  private generation = 0;

  constructor(
    private readonly request: BudgetAiRequest,
    private readonly polling = new BudgetAiPollingCoordinator(),
  ) {}

  start(
    estimateId: string,
    retry: boolean,
    callbacks: BudgetAiAnalysisCallbacks,
  ) {
    this.cancel();
    const generation = ++this.generation;
    const run = this.polling.begin();
    void this.runInitial(generation, run, estimateId, retry, callbacks);
  }

  cancel() {
    this.generation += 1;
    this.polling.cancel();
  }

  private async runInitial(
    generation: number,
    run: BudgetAiPollingRun,
    estimateId: string,
    retry: boolean,
    callbacks: BudgetAiAnalysisCallbacks,
  ) {
    try {
      const timeoutMs = Math.min(INITIAL_REQUEST_TIMEOUT_MS, this.polling.remainingMs(run));
      const response = await this.request(estimateId, retry, timeoutMs);
      if (!this.isCurrent(generation) || !this.polling.isCurrent(run)) return;
      callbacks.onResponse(response);
      if (response.estimate.ai_status !== "pending") return;
    } catch {
      if (!this.isCurrent(generation) || !this.polling.isCurrent(run)) return;
      callbacks.onUncertain();
    }
    this.queuePoll(generation, run, estimateId, callbacks);
  }

  private queuePoll(
    generation: number,
    run: BudgetAiPollingRun,
    estimateId: string,
    callbacks: BudgetAiAnalysisCallbacks,
  ) {
    const scheduled = this.polling.scheduleNext(run, () => {
      void this.runPoll(generation, run, estimateId, callbacks);
    });
    if (scheduled || !this.isCurrent(generation) || !this.polling.isCurrent(run)) return;
    this.polling.cancel();
    callbacks.onExhausted();
  }

  private async runPoll(
    generation: number,
    run: BudgetAiPollingRun,
    estimateId: string,
    callbacks: BudgetAiAnalysisCallbacks,
  ) {
    try {
      const timeoutMs = Math.max(
        1,
        Math.min(POLL_REQUEST_TIMEOUT_MS, this.polling.remainingMs(run)),
      );
      const response = await this.request(estimateId, false, timeoutMs);
      if (!this.isCurrent(generation) || !this.polling.isCurrent(run)) return;
      callbacks.onResponse(response);
      if (response.estimate.ai_status !== "pending") {
        this.polling.cancel();
        return;
      }
    } catch {
      if (!this.isCurrent(generation) || !this.polling.isCurrent(run)) return;
    }
    this.queuePoll(generation, run, estimateId, callbacks);
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}
