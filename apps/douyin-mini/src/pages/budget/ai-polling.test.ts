import { describe, expect, mock, test } from "bun:test";

import type { DouyinBudgetAiExplanationResponse } from "../../models";

import {
  BudgetAiAnalysisRunner,
  BudgetAiPollingCoordinator,
  type BudgetAiPollingScheduler,
} from "./ai-polling";

function harness() {
  let now = 1_000;
  const callbacks: Array<() => void> = [];
  let canceled = 0;
  const scheduler: BudgetAiPollingScheduler = {
    now: () => now,
    schedule(callback, delayMs) {
      callbacks.push(() => {
        now += delayMs;
        callback();
      });
      return () => { canceled += 1; };
    },
  };
  return {
    scheduler,
    callbacks,
    setNow: (value: number) => { now = value; },
    canceled: () => canceled,
  };
}

describe("budget AI polling coordinator", () => {
  test("polls pending claims with stable run authority and a shared fifty-five-second bound", () => {
    const fake = harness();
    const polling = new BudgetAiPollingCoordinator(fake.scheduler);
    const run = polling.begin();
    let invoked = 0;
    expect(polling.scheduleNext(run, () => { invoked += 1; })).toBe(true);
    fake.callbacks.shift()?.();
    expect(invoked).toBe(1);
    expect(polling.isCurrent(run)).toBe(true);

    fake.setNow(run.deadlineAt - 1_999);
    expect(polling.scheduleNext(run, () => {})).toBe(false);
  });

  test("caps polling at ten attempts and makes old runs stale", () => {
    const fake = harness();
    const polling = new BudgetAiPollingCoordinator(fake.scheduler);
    const run = polling.begin();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(polling.scheduleNext(run, () => {})).toBe(true);
      fake.callbacks.shift()?.();
    }
    expect(polling.scheduleNext(run, () => {})).toBe(false);

    const next = polling.begin();
    expect(polling.isCurrent(run)).toBe(false);
    expect(polling.isCurrent(next)).toBe(true);
  });

  test("form edits and unload can cancel a scheduled poll", () => {
    const fake = harness();
    const polling = new BudgetAiPollingCoordinator(fake.scheduler);
    const run = polling.begin();
    expect(polling.scheduleNext(run, () => {})).toBe(true);
    polling.cancel();
    expect(fake.canceled()).toBe(1);
    expect(polling.isCurrent(run)).toBe(false);
  });
});

const pending = {
  estimate: {
    id: "22222222-2222-4222-8222-222222222222",
    ai_status: "pending",
  },
  ai_analysis: null,
} as DouyinBudgetAiExplanationResponse;
const succeeded = {
  estimate: { ...pending.estimate, ai_status: "succeeded" },
  ai_analysis: {
    summary: "已生成",
    allocation_advice: [],
    risk_factors: [],
    onsite_questions: [],
  },
} as DouyinBudgetAiExplanationResponse;

describe("budget AI analysis runner", () => {
  test("turns an uncertain initial timeout into non-retry polling and success", async () => {
    const fake = harness();
    const responses: Array<DouyinBudgetAiExplanationResponse | Error> = [
      new Error("transport timeout"), pending, succeeded,
    ];
    const request = mock(async (
      _estimateId: string,
      _retry: boolean,
      _timeoutMs: number,
    ) => {
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response!;
    });
    const onResponse = mock(() => {});
    const onUncertain = mock(() => {});
    const onExhausted = mock(() => {});
    const runner = new BudgetAiAnalysisRunner(request, new BudgetAiPollingCoordinator(fake.scheduler));

    runner.start(pending.estimate.id, false, { onResponse, onUncertain, onExhausted });
    await Bun.sleep(0);
    expect(onUncertain).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]).toEqual([pending.estimate.id, false, 35_000]);

    fake.callbacks.shift()?.();
    await Bun.sleep(0);
    expect(onResponse).toHaveBeenLastCalledWith(pending);
    expect(request.mock.calls[1]).toEqual([pending.estimate.id, false, 3_000]);

    fake.callbacks.shift()?.();
    await Bun.sleep(0);
    expect(onResponse).toHaveBeenLastCalledWith(succeeded);
    expect(request.mock.calls[2]).toEqual([pending.estimate.id, false, 3_000]);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  test("bounds pending polling and exposes exhaustion without changing retry semantics", async () => {
    const fake = harness();
    const request = mock(async (
      _estimateId: string,
      _retry: boolean,
      _timeoutMs: number,
    ) => pending);
    const onExhausted = mock(() => {});
    const runner = new BudgetAiAnalysisRunner(request, new BudgetAiPollingCoordinator(fake.scheduler));
    runner.start(pending.estimate.id, false, {
      onResponse: () => {}, onUncertain: () => {}, onExhausted,
    });
    await Bun.sleep(0);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      fake.callbacks.shift()?.();
      await Bun.sleep(0);
    }
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(11);
    expect(request.mock.calls.every((call) => call[1] === false)).toBe(true);
  });

  test("counts initial request time against the hard deadline and never polls at sixty seconds", async () => {
    const fake = harness();
    const requestTimes: number[] = [];
    const request = mock(async () => {
      requestTimes.push(fake.scheduler.now());
      if (requestTimes.length === 1) {
        fake.setNow(36_000);
        throw new Error("initial 35s timeout");
      }
      return pending;
    });
    const onExhausted = mock(() => {});
    const runner = new BudgetAiAnalysisRunner(request, new BudgetAiPollingCoordinator(fake.scheduler));
    runner.start(pending.estimate.id, false, {
      onResponse: () => {}, onUncertain: () => {}, onExhausted,
    });
    await Bun.sleep(0);
    while (fake.callbacks.length) {
      fake.callbacks.shift()?.();
      await Bun.sleep(0);
    }

    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(requestTimes.every((calledAt) => calledAt < 56_000)).toBe(true);
    expect(fake.scheduler.now()).toBeLessThan(60_000);
  });

  test("cancel makes late requests and scheduled polls inert", async () => {
    const fake = harness();
    let resolveRequest: (value: DouyinBudgetAiExplanationResponse) => void = () => {};
    const request = mock((
      _estimateId: string,
      _retry: boolean,
      _timeoutMs: number,
    ) => new Promise<DouyinBudgetAiExplanationResponse>((resolve) => {
      resolveRequest = resolve;
    }));
    const onResponse = mock(() => {});
    const runner = new BudgetAiAnalysisRunner(request, new BudgetAiPollingCoordinator(fake.scheduler));
    runner.start(pending.estimate.id, false, {
      onResponse, onUncertain: () => {}, onExhausted: () => {},
    });
    runner.cancel();
    resolveRequest(succeeded);
    await Bun.sleep(0);
    expect(onResponse).not.toHaveBeenCalled();
    expect(fake.callbacks).toHaveLength(0);
  });

  test("ignores a poll response that resolves after form edit or unload cancellation", async () => {
    const fake = harness();
    let resolvePoll: (value: DouyinBudgetAiExplanationResponse) => void = () => {};
    let calls = 0;
    const request = mock((_id: string, _retry: boolean, _timeout: number) => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(pending)
        : new Promise<DouyinBudgetAiExplanationResponse>((resolve) => { resolvePoll = resolve; });
    });
    const onResponse = mock(() => {});
    const runner = new BudgetAiAnalysisRunner(request, new BudgetAiPollingCoordinator(fake.scheduler));
    runner.start(pending.estimate.id, false, {
      onResponse, onUncertain: () => {}, onExhausted: () => {},
    });
    await Bun.sleep(0);
    fake.callbacks.shift()?.();
    await Bun.sleep(0);
    runner.cancel();
    resolvePoll(succeeded);
    await Bun.sleep(0);

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenLastCalledWith(pending);
  });
});
