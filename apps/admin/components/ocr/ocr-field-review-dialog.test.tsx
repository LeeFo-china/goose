import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { OcrFieldSuggestion } from "@gooes/domain";
import {
  buildOcrFieldReviewRows,
  mapApplymentOcrFields,
} from "./ocr-field-review-dialog";

function field(key: string, value: string): OcrFieldSuggestion {
  return {
    key,
    label: key,
    value,
    normalized: true,
    sensitive: false,
    confidence: null,
  };
}

describe("OCR field review dialog", () => {
  test("selects only suggestions for empty current values by default", () => {
    const rows = buildOcrFieldReviewRows([
      field("license_name", "晴天装饰"),
      field("license_code", "91410000"),
      field("license_address", "河南省信阳市"),
    ], {
      license_name: "",
      license_code: "91410000",
      license_address: "河南省固始县",
    });

    expect(rows.map((row) => ({
      key: row.field.key,
      selected: row.selected,
      state: row.state,
    }))).toEqual([
      { key: "license_name", selected: true, state: "empty" },
      { key: "license_code", selected: false, state: "consistent" },
      { key: "license_address", selected: false, state: "conflict" },
    ]);
  });

  test("maps contact identity suggestions to contact applyment fields", () => {
    expect(mapApplymentOcrFields("contact_id_card_front", [
      field("identity_name", "李四"),
      field("identity_number", "41000019900101001x"),
      field("identity_address", "河南省信阳市"),
    ])).toEqual([
      expect.objectContaining({ key: "super_admin_name", value: "李四" }),
      expect.objectContaining({
        key: "contact_identity_number",
        value: "41000019900101001x",
      }),
      expect.objectContaining({
        key: "contact_identity_address",
        value: "河南省信阳市",
      }),
    ]);
  });

  test("uses shadcn review controls and never saves or submits applyment", () => {
    const source = readFileSync(new URL(
      "./ocr-field-review-dialog.tsx",
      import.meta.url,
    ), "utf8");

    expect(source).toContain("Dialog");
    expect(source).toContain("Checkbox");
    expect(source).toContain("应用所选字段");
    expect(source).toContain("currentValues");
    expect(source).toContain("warnings");
    expect(source).not.toContain("/finance/wechat-pay/applyments");
    expect(source).not.toContain("workflow-tasks");
    expect(source).not.toContain("requestBackendJson");
  });
});
