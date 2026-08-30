import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_BATCH_COMMAND_STATUS_VALUES,
  SUPPLIER_PURCHASE_BATCH_COMMAND_TYPE_VALUES,
  SUPPLIER_PURCHASE_BATCH_STATUS_VALUES,
} from "./index";

describe("supplier purchase batch domain contract", () => {
  test("keeps aggregate lifecycle statuses stable", () => {
    expect(SUPPLIER_PURCHASE_BATCH_STATUS_VALUES).toEqual([
      "draft",
      "pending_approval",
      "rejected",
      "cancelled",
      "ordered",
    ]);
  });

  test("keeps command result statuses stable", () => {
    expect(SUPPLIER_PURCHASE_BATCH_COMMAND_STATUS_VALUES).toEqual([
      "saved",
      "submitted",
      "rejected",
      "cancelled",
      "ordered",
      "revision_required",
      "withdrawn",
    ]);
  });

  test("exports the shared command type values", () => {
    expect(SUPPLIER_PURCHASE_BATCH_COMMAND_TYPE_VALUES).toEqual([
      "save_draft",
      "submit",
      "review",
      "cancel",
      "withdraw",
    ]);
  });
});
