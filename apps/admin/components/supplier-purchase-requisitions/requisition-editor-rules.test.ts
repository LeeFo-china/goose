import { expect, test } from "bun:test";

import {
  toRequisitionDraftPayload,
  validateRequisitionDraft,
} from "./requisition-page-utils";

const validLine = {
  supplierSkuId: "sku-1",
  costCategoryId: "category-1",
  quantity: "1",
};

test("采购用途拒绝空值和超过五百字符的文本", () => {
  const draft = {
    projectId: "project-1",
    tenantSupplierId: "supplier-1",
    reason: "",
    expectedVersion: 0,
    items: [validLine],
  };

  expect(validateRequisitionDraft(draft).reason).toBe("请选择或填写采购用途");
  expect(validateRequisitionDraft({
    ...draft,
    reason: ` ${"用".repeat(501)} `,
  }).reason).toBe("采购用途不能超过 500 个字符");
});

test("自由采购用途去除首尾空白后仍沿用 reason 契约", () => {
  const payload = toRequisitionDraftPayload({
    projectId: "project-1",
    tenantSupplierId: "supplier-1",
    reason: "  展厅样板补充  ",
    expectedVersion: 0,
    items: [validLine],
  });

  expect(payload.reason).toBe("展厅样板补充");
  expect("purpose" in payload).toBe(false);
});
