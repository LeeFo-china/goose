import { describe, expect, mock, test } from "bun:test";

import { ApplymentDraftSaveCancelledError } from "./finance-wechat-pay-applyment-autosave";
import {
  ApplymentDraftRevisionAllocator,
  saveApplymentDraftWithCreateRecovery,
} from "./finance-wechat-pay-applyment-autosave-coordinator";
import { ApplymentDraftFencingSession } from "./finance-wechat-pay-applyment-draft-session";

describe("ApplymentDraftRevisionAllocator", () => {
  test("allocates one monotonic sequence across all save sources", () => {
    const revisions = new ApplymentDraftRevisionAllocator(4);

    expect(revisions.allocate({
      merchant_short_name: "autosave",
      draft_update_source: "autosave",
    })).toMatchObject({ draft_revision: 5 });
    expect(revisions.allocate({
      attachments: [],
      draft_update_source: "attachment_change",
    })).toMatchObject({ draft_revision: 6 });
    expect(revisions.allocate({
      license_name: "OCR",
      draft_update_source: "ocr_confirm",
    })).toMatchObject({ draft_revision: 7 });
    expect(revisions.allocate({
      remark: "提交前保存",
      draft_update_source: "manual_save",
    })).toMatchObject({ draft_revision: 8 });
  });

  test("absorbs server revision, preserves retry revision and resets for a new draft", () => {
    const revisions = new ApplymentDraftRevisionAllocator(2);
    const failed = revisions.allocate({
      remark: "失败值",
      draft_update_source: "autosave",
    });

    expect(revisions.preserve(failed)).toBe(failed);
    revisions.absorb(9);
    expect(revisions.allocate({
      remark: "恢复后的值",
      draft_update_source: "autosave",
    })).toMatchObject({ draft_revision: 10 });

    revisions.reset(1);
    expect(revisions.allocate({
      remark: "新草稿",
      draft_update_source: "autosave",
    })).toMatchObject({ draft_revision: 2 });
  });
});

describe("ApplymentDraftFencingSession", () => {
  test("claims a new epoch before updating a recovered create", async () => {
    type Draft = {
      id: string;
      draft_epoch: number;
      draft_revision: number;
    };
    let current: Draft | null = null;
    const claims: string[] = [];
    const updates: Array<Record<string, unknown>> = [];
    const session = new ApplymentDraftFencingSession(async (id) => {
      claims.push(id);
      return { id, draft_epoch: 5, draft_revision: 0 };
    });
    session.reset(null);
    const rawPayload = { merchant_short_name: "恢复值" };
    const createPayload = await session.allocate(rawPayload);

    await saveApplymentDraftWithCreateRecovery<Draft>({
      getCurrent: () => current,
      payload: createPayload,
      isCurrent: () => true,
      adoptRecovered: (draft) => session.reset(draft),
      prepareRecoveredPayload: () => session.allocate(rawPayload),
      commitCurrent: (draft) => {
        current = draft;
      },
      request: async (path, init) => {
        if (path === "/finance/wechat-pay/applyments") {
          throw Object.assign(new Error("exists"), {
            code: "WECHAT_PAY_APPLYMENT_EXISTS",
          });
        }
        if (path === "/finance/wechat-pay/applyment/current") {
          return {
            applyment: {
              id: "draft-1",
              draft_epoch: 4,
              draft_revision: 20,
            },
          };
        }
        updates.push(JSON.parse(init?.body ?? "{}"));
        return {
          applyment: {
            id: "draft-1",
            draft_epoch: 5,
            draft_revision: 1,
          },
        };
      },
    });

    expect(claims).toEqual(["draft-1"]);
    expect(updates).toEqual([{
      merchant_short_name: "恢复值",
      draft_epoch: 5,
      draft_revision: 1,
    }]);
  });

  test("claims a database epoch before allocating an existing draft revision", async () => {
    const claims: string[] = [];
    const session = new ApplymentDraftFencingSession(async (applymentId) => {
      claims.push(applymentId);
      return { id: applymentId, draft_epoch: 12, draft_revision: 0 };
    });
    session.reset({ id: "draft-1", draft_epoch: 11, draft_revision: 99 });

    await expect(session.allocate({
      merchant_short_name: "new-page",
      draft_update_source: "autosave",
    })).resolves.toMatchObject({
      draft_epoch: 12,
      draft_revision: 1,
    });
    expect(claims).toEqual(["draft-1"]);
  });

  test("keeps the database-issued create epoch without claiming it again", async () => {
    const claim = mock(async () => {
      throw new Error("created draft must not be claimed again");
    });
    const session = new ApplymentDraftFencingSession(claim);
    session.reset(null);
    const createPayload = await session.allocate({
      merchant_short_name: "created",
      draft_update_source: "autosave",
    });

    expect(createPayload).toMatchObject({ draft_revision: 1 });
    expect(createPayload).not.toHaveProperty("draft_epoch");
    session.adoptCreated({
      id: "draft-created",
      draft_epoch: 1,
      draft_revision: 1,
    });
    await expect(session.allocate({
      merchant_short_name: "updated",
      draft_update_source: "autosave",
    })).resolves.toMatchObject({
      draft_epoch: 1,
      draft_revision: 2,
    });
    expect(claim).not.toHaveBeenCalled();
  });

  test("preserves an already issued fence for an idempotent retry", async () => {
    const session = new ApplymentDraftFencingSession(async (id) => ({
      id,
      draft_epoch: 4,
      draft_revision: 0,
    }));
    session.reset({ id: "draft-1", draft_epoch: 3, draft_revision: 8 });
    const first = await session.allocate({ remark: "retry-value" });

    await expect(session.allocate(first)).resolves.toEqual(first);
    await expect(session.allocate({ remark: "new-value" })).resolves
      .toMatchObject({
        draft_epoch: 4,
        draft_revision: 2,
      });
  });

  test("invalidates a late claim when switching applyments", async () => {
    let resolveOld!: (value: {
      id: string;
      draft_epoch: number;
      draft_revision: number;
    }) => void;
    const session = new ApplymentDraftFencingSession((id) =>
      id === "old"
        ? new Promise((resolve) => {
          resolveOld = resolve;
        })
        : Promise.resolve({ id, draft_epoch: 7, draft_revision: 0 })
    );
    session.reset({ id: "old", draft_epoch: 2, draft_revision: 9 });
    const oldAllocation = session.allocate({ remark: "old" });
    session.reset({ id: "new", draft_epoch: 6, draft_revision: 4 });
    resolveOld({ id: "old", draft_epoch: 3, draft_revision: 0 });

    await expect(oldAllocation).rejects.toBeInstanceOf(
      ApplymentDraftSaveCancelledError,
    );
    await expect(session.allocate({ remark: "new" })).resolves.toMatchObject({
      draft_epoch: 7,
      draft_revision: 1,
    });
  });
});
