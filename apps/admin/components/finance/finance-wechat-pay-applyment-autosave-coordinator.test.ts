import { describe, expect, test } from "bun:test";

import { ApplymentDraftSaveQueue } from "./finance-wechat-pay-applyment-autosave";
import {
  ApplymentDraftAutosaveCoordinator,
  saveApplymentDraftWithCreateRecovery,
  submitApplymentAfterDraftFlush,
} from "./finance-wechat-pay-applyment-autosave-coordinator";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe("ApplymentDraftAutosaveCoordinator", () => {
  test("debounces saves and keeps the latest payload", async () => {
    const saved: number[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(Number(payload.version));
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 5);

    coordinator.schedule({ version: 1 });
    coordinator.schedule({ version: 2 });
    await delay(15);
    await coordinator.flush();

    expect(saved).toEqual([2]);
    expect(coordinator.lastPayload).toEqual({ version: 2 });
  });

  test("an immediate checkpoint replaces a scheduled autosave", async () => {
    const saved: number[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(Number(payload.version));
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 20);

    coordinator.schedule({ version: 1 });
    await coordinator.checkpoint({ version: 2 });
    await delay(25);
    await coordinator.flush();

    expect(saved).toEqual([2]);
  });

  test("flush immediately drains the pending debounce payload", async () => {
    const saved: number[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(Number(payload.version));
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 800);

    coordinator.schedule({ version: 1 });
    await coordinator.flush();

    expect(saved).toEqual([1]);
  });

  test("reset drops a scheduled payload from the previous draft", async () => {
    const saved: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(String(payload.id));
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 5);

    coordinator.schedule({ id: "old" });
    coordinator.reset();
    coordinator.schedule({ id: "new" });
    await delay(15);
    await coordinator.flush();

    expect(saved).toEqual(["new"]);
  });
});

describe("saveApplymentDraftWithCreateRecovery", () => {
  test("recovers a lost create response through current then update", async () => {
    type Draft = { id: string; updated_at: string };
    const calls: Array<{ path: string; method?: string }> = [];
    let current: Draft | null = null;
    const getCurrent = (): Draft | null => current;

    const result = await saveApplymentDraftWithCreateRecovery<Draft>({
      getCurrent,
      payload: { merchant_short_name: "实时草稿" },
      isCurrent: () => true,
      commitCurrent: (draft) => {
        current = draft;
      },
      request: async (path, init) => {
        calls.push({ path, method: init?.method });
        if (
          path === "/finance/wechat-pay/applyments" &&
          init?.method === "POST"
        ) {
          throw Object.assign(new Error("exists"), {
            code: "WECHAT_PAY_APPLYMENT_EXISTS",
          });
        }
        if (path === "/finance/wechat-pay/applyment/current") {
          return {
            applyment: { id: "draft-1", updated_at: "before-update" },
          };
        }
        return {
          applyment: { id: "draft-1", updated_at: "after-update" },
        };
      },
    });

    expect(calls).toEqual([
      { path: "/finance/wechat-pay/applyments", method: "POST" },
      { path: "/finance/wechat-pay/applyment/current", method: undefined },
      {
        path: "/finance/wechat-pay/applyments/draft-1",
        method: "PUT",
      },
    ]);
    expect(getCurrent()).toEqual({
      id: "draft-1",
      updated_at: "after-update",
    });
    expect(result.applyment?.updated_at).toBe("after-update");
  });
});

describe("submitApplymentAfterDraftFlush", () => {
  test("validates, saves, flushes, then submits the latest draft id", async () => {
    const events: string[] = [];

    const submitted = await submitApplymentAfterDraftFlush({
      validate: () => {
        events.push("validate");
        return true;
      },
      buildPayload: () => {
        events.push("build");
        return { remark: "最终备注" };
      },
      save: async (payload) => {
        events.push(`save:${String(payload.draft_update_source)}`);
      },
      flush: async () => {
        events.push("flush");
      },
      getCurrent: () => ({ id: "latest-draft" }),
      submit: async (id, body) => {
        events.push(`submit:${id}:${body.idempotency_key}:${body.remark}`);
      },
    });

    expect(submitted).toBe(true);
    expect(events).toEqual([
      "validate",
      "build",
      "save:manual_save",
      "flush",
      "submit:latest-draft:latest-draft:最终备注",
    ]);
  });

  test("does not submit when flush fails", async () => {
    let submitted = false;

    await expect(submitApplymentAfterDraftFlush({
      validate: () => true,
      buildPayload: () => ({}),
      save: async () => undefined,
      flush: async () => {
        throw new Error("save failed");
      },
      getCurrent: () => ({ id: "draft-1" }),
      submit: async () => {
        submitted = true;
      },
    })).rejects.toThrow("save failed");

    expect(submitted).toBe(false);
  });

  test("does not save or submit when validation fails", async () => {
    let saved = false;
    let submitted = false;

    const result = await submitApplymentAfterDraftFlush({
      validate: () => false,
      buildPayload: () => {
        throw new Error("must not build");
      },
      save: async () => {
        saved = true;
      },
      flush: async () => undefined,
      getCurrent: () => ({ id: "draft-1" }),
      submit: async () => {
        submitted = true;
      },
    });

    expect(result).toBe(false);
    expect(saved).toBe(false);
    expect(submitted).toBe(false);
  });
});
