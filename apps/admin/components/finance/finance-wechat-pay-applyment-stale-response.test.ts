import { describe, expect, mock, test } from "bun:test";

import { ApplymentDraftSaveQueue } from "./finance-wechat-pay-applyment-autosave";
import {
  ApplymentDraftAutosaveCoordinator,
  classifyApplymentDraftSaveError,
  saveApplymentDraftWithCreateRecovery,
} from "./finance-wechat-pay-applyment-autosave-coordinator";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe("wechat pay applyment stale autosave responses", () => {
  test("classifies a stale draft epoch as a taken-over session", () => {
    const error = Object.assign(new Error("草稿会话已失效"), {
      code: "WECHAT_PAY_APPLYMENT_DRAFT_SESSION_STALE",
    });

    expect(classifyApplymentDraftSaveError(error)).toEqual({
      isSessionStale: true,
      message: "其他页面已接管当前草稿，请刷新页面后继续。",
    });
  });

  test("does not commit current draft or detail after a stale epoch response", async () => {
    const commitCurrent = mock();
    const commitDetail = mock();
    const staleError = Object.assign(new Error("草稿会话已失效"), {
      code: "WECHAT_PAY_APPLYMENT_DRAFT_SESSION_STALE",
    });

    await expect(
      saveApplymentDraftWithCreateRecovery({
        getCurrent: () => ({ id: "draft-1" }),
        payload: { draft_epoch: 2, draft_revision: 99 },
        isCurrent: () => true,
        commitCurrent,
        commitDetail,
        request: async () => {
          throw staleError;
        },
      }),
    ).rejects.toBe(staleError);
    expect(commitCurrent).not.toHaveBeenCalled();
    expect(commitDetail).not.toHaveBeenCalled();
  });

  test("absorbs a stale create id without publishing stale controlled fields", async () => {
    type Draft = {
      id: string;
      merchant_short_name: string;
      settlement_account_type: string;
    };
    type Detail = {
      applyment: Draft | null;
      can_edit: boolean;
      can_submit: boolean;
    };
    const started: Array<() => void> = [];
    const releases: Array<() => void> = [];
    const waitForStart = (index: number) =>
      new Promise<void>((resolve) => {
        started[index] = resolve;
      });
    const waitForRelease = (index: number) =>
      new Promise<void>((resolve) => {
        releases[index] = resolve;
      });
    const aStarted = waitForStart(0);
    const bStarted = waitForStart(1);
    const aRelease = waitForRelease(0);
    const bRelease = waitForRelease(1);
    const calls: Array<{ path: string; payload: Record<string, unknown> }> = [];
    const published: Draft[] = [];
    let internalCurrent: Draft | null = null;
    const getInternalCurrent = (): Draft | null => internalCurrent;
    let uiValues = {
      merchant_short_name: "A",
      settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    };
    let serverDraft: Draft | null = null;
    let coordinator: ApplymentDraftAutosaveCoordinator;
    const queue = new ApplymentDraftSaveQueue(async (payload, context) => {
      await saveApplymentDraftWithCreateRecovery<Draft, Detail>({
        getCurrent: () => internalCurrent,
        payload,
        isCurrent: context.isCurrent,
        commitCurrent: (draft) => {
          internalCurrent = draft;
        },
        shouldCommitDetail: () => coordinator.isLatestPayload(payload),
        commitDetail: (detail) => {
          if (!detail.applyment) return;
          published.push(detail.applyment);
          uiValues = {
            merchant_short_name: detail.applyment.merchant_short_name,
            settlement_account_type:
              detail.applyment.settlement_account_type,
          };
        },
        request: async (path, init) => {
          const requestPayload = JSON.parse(init?.body || "{}") as Record<
            string,
            unknown
          >;
          const index = calls.length;
          calls.push({ path, payload: requestPayload });
          started[index]?.();
          if (index === 0) await aRelease;
          if (index === 1) await bRelease;
          serverDraft = {
            id: "created-draft",
            merchant_short_name: String(
              requestPayload.merchant_short_name ??
                serverDraft?.merchant_short_name ??
                "",
            ),
            settlement_account_type: String(
              requestPayload.settlement_account_type ??
                serverDraft?.settlement_account_type ??
                "",
            ),
          };
          return {
            applyment: serverDraft,
            can_edit: true,
            can_submit: true,
          };
        },
      });
    });
    coordinator = new ApplymentDraftAutosaveCoordinator(queue, 5);

    const saveA = coordinator.checkpoint({
      merchant_short_name: "A",
      settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    });
    await aStarted;
    uiValues.settlement_account_type = "BANK_ACCOUNT_TYPE_PERSONAL";
    coordinator.schedule({
      merchant_short_name: "A",
      settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
    });
    await delay(10);
    releases[0]?.();
    await bStarted;

    expect(getInternalCurrent()?.id).toBe("created-draft");
    expect(calls[1]?.path).toBe(
      "/finance/wechat-pay/applyments/created-draft",
    );
    expect(uiValues.settlement_account_type).toBe(
      "BANK_ACCOUNT_TYPE_PERSONAL",
    );

    uiValues.merchant_short_name = "C";
    coordinator.schedule({
      merchant_short_name: "C",
      settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
    });
    await delay(10);
    releases[1]?.();
    await saveA;
    await coordinator.flush();

    expect(published).toEqual([
      expect.objectContaining({
        merchant_short_name: "C",
        settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
      }),
    ]);
    expect(uiValues).toEqual({
      merchant_short_name: "C",
      settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
    });
    expect(serverDraft).toMatchObject({
      merchant_short_name: "C",
      settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
    });
  });
});
