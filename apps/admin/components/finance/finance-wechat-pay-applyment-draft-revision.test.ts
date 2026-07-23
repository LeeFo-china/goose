import { describe, expect, test } from "bun:test";

import { ApplymentDraftRevisionAllocator } from "./finance-wechat-pay-applyment-autosave-coordinator";

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
