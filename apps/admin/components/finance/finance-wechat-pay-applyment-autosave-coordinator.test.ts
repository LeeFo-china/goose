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

  test("retries the latest scheduled payload after an earlier save fails", async () => {
    const attempts: number[] = [];
    const failedPayload = { version: 1 };
    const scheduledPayload = { version: 2 };
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      const version = Number(payload.version);
      attempts.push(version);
      if (version === 1) throw new Error("save failed");
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 20);

    await expect(coordinator.checkpoint(failedPayload)).rejects.toThrow(
      "save failed",
    );
    coordinator.schedule(scheduledPayload);
    await coordinator.retry(failedPayload);
    await delay(25);
    await coordinator.flush();

    expect(attempts).toEqual([1, 2]);
    expect(coordinator.lastPayload).toBe(scheduledPayload);
  });

  test("keeps an edit scheduled while the latest retry is running", async () => {
    const attempts: number[] = [];
    let startRetry: (() => void) | undefined;
    let finishRetry: (() => void) | undefined;
    const retryStarted = new Promise<void>((resolve) => {
      startRetry = resolve;
    });
    const retryGate = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    const failedPayload = { version: 1 };
    const retryPayload = { version: 2 };
    const editedPayload = { version: 3 };
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      const version = Number(payload.version);
      attempts.push(version);
      if (version === 1) throw new Error("save failed");
      if (version === 2) {
        startRetry?.();
        await retryGate;
      }
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 5);

    await expect(coordinator.checkpoint(failedPayload)).rejects.toThrow(
      "save failed",
    );
    coordinator.schedule(retryPayload);
    const retry = coordinator.retry(failedPayload);
    await retryStarted;
    coordinator.schedule(editedPayload);

    expect(coordinator.isLatestPayload(retryPayload)).toBe(false);
    expect(coordinator.isLatestPayload(editedPayload)).toBe(true);
    finishRetry?.();
    await retry;
    await delay(15);
    await coordinator.flush();

    expect(attempts).toEqual([1, 2, 3]);
    expect(coordinator.lastPayload).toBe(editedPayload);
  });

  test("detach sends the latest scheduled payload before disposing", async () => {
    const saved: Array<{ version: number; detaching: boolean }> = [];
    let coordinator: ApplymentDraftAutosaveCoordinator;
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push({
        version: Number(payload.version),
        detaching: Boolean(Reflect.get(coordinator, "isDetaching")),
      });
    });
    coordinator = new ApplymentDraftAutosaveCoordinator(queue, 800);

    coordinator.schedule({ version: 1 });
    coordinator.schedule({ version: 2 });
    const detach = Reflect.get(coordinator, "detach");
    if (typeof detach === "function") await detach.call(coordinator);

    expect(saved).toEqual([{ version: 2, detaching: true }]);
  });

  test("StrictMode detach does not revive a scheduled payload from an old generation", async () => {
    const saved: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload) => {
      saved.push(String(payload.id));
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 800);

    coordinator.schedule({ id: "strict-mode-old" });
    coordinator.reset();
    const detach = Reflect.get(coordinator, "detach");
    if (typeof detach === "function") await detach.call(coordinator);

    expect(saved).toEqual([]);
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

  test("preserves create capabilities and allows immediate submit", async () => {
    type Draft = { id: string; updated_at: string };
    type Detail = {
      applyment: Draft | null;
      can_edit: boolean;
      can_submit: boolean;
    };
    let currentDetail: Detail = {
      applyment: null,
      can_edit: true,
      can_submit: false,
    };
    const submitted: string[] = [];
    const queue = new ApplymentDraftSaveQueue(async (payload, context) => {
      await saveApplymentDraftWithCreateRecovery<Draft, Detail>({
        getCurrent: () => currentDetail.applyment,
        payload,
        isCurrent: context.isCurrent,
        commitCurrent: (applyment) => {
          currentDetail = { ...currentDetail, applyment };
        },
        commitDetail: (detail) => {
          currentDetail = detail;
        },
        request: async () => ({
          applyment: { id: "created-draft", updated_at: "after-create" },
          can_edit: true,
          can_submit: true,
        }),
      });
    });
    const coordinator = new ApplymentDraftAutosaveCoordinator(queue, 800);

    await coordinator.checkpoint({ merchant_short_name: "实时创建" });

    expect(currentDetail).toMatchObject({
      applyment: { id: "created-draft" },
      can_edit: true,
      can_submit: true,
    });

    if (currentDetail.can_submit) {
      await submitApplymentAfterDraftFlush({
        validate: () => true,
        buildPayload: () => ({ merchant_short_name: "提交最新值" }),
        save: (payload) => coordinator.checkpoint(payload),
        flush: () => coordinator.flush(),
        getCurrent: () => currentDetail.applyment,
        submit: async (id) => {
          submitted.push(id);
        },
      });
    }

    expect(submitted).toEqual(["created-draft"]);
  });

  test("marks detached draft requests as keepalive", async () => {
    let requestKeepalive = false;

    await saveApplymentDraftWithCreateRecovery({
      getCurrent: () => ({ id: "draft-1" }),
      payload: { merchant_short_name: "离开前最新值" },
      isCurrent: () => true,
      keepalive: () => true,
      commitCurrent: () => undefined,
      request: async (_path, init) => {
        requestKeepalive = init?.keepalive === true;
        return { applyment: { id: "draft-1" } };
      },
    });

    expect(requestKeepalive).toBe(true);
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
