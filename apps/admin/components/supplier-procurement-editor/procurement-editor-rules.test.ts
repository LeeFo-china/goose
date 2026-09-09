import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  procurementSummary,
  synchronizePurposeCustomState,
  shouldConfirmContextChange,
  shouldRequestPurposeChange,
} from "./procurement-editor-rules";
import { ProcurementPurposeField } from "./procurement-purpose-field";
import { ProcurementRemarkField } from "./procurement-remark-field";

describe("procurement editor rules", () => {
  test("summarizes decimal quantities without Number precision loss", () => {
    expect(procurementSummary([
      {
        supplierId: "supplier-a",
        quantity: "2.5",
        unitPrice: "88.00",
        costCategoryId: "category-a",
      },
      {
        supplierId: "supplier-b",
        quantity: "1",
        unitPrice: "139.00",
        costCategoryId: "",
      },
    ])).toEqual({
      itemCount: 2,
      supplierCount: 2,
      missingCategoryCount: 1,
      referenceAmount: "359.00",
    });
  });

  test("rounds reference line value to cents and tolerates missing catalog facts", () => {
    expect(procurementSummary([
      {
        supplierId: "supplier-a",
        quantity: "0.3333",
        unitPrice: "10.00",
        costCategoryId: "category-a",
      },
      {
        quantity: "1",
        unitPrice: null,
        costCategoryId: "category-b",
      },
    ]).referenceAmount).toBe("3.33");
  });

  test("ignores decimal inputs beyond storage precision before calculating", () => {
    expect(procurementSummary([
      {
        quantity: "123456789012345",
        unitPrice: "1.00",
        costCategoryId: "category-a",
      },
      {
        quantity: "1",
        unitPrice: "1234567890123.00",
        costCategoryId: "category-b",
      },
      {
        quantity: "9".repeat(64),
        unitPrice: "1.00",
        costCategoryId: "category-c",
      },
    ]).referenceAmount).toBe("0.00");
  });

  test("normalizes quantity leading zeroes before checking integer digits", () => {
    expect(procurementSummary([
      {
        quantity: "012345678901234",
        unitPrice: "1.00",
        costCategoryId: "category-a",
      },
    ]).referenceAmount).toBe("12345678901234.00");
  });

  test("only asks before changing context when products are selected", () => {
    expect(shouldConfirmContextChange(0)).toBe(false);
    expect(shouldConfirmContextChange(1)).toBe(true);
  });

  test("does not request a controlled purpose value that is already selected", () => {
    expect(shouldRequestPurposeChange("项目备料", "项目备料")).toBe(false);
    expect(shouldRequestPurposeChange("项目备料", "现场补料")).toBe(true);
  });

  test("preserves custom mode for a matching local echo", () => {
    expect(synchronizePurposeCustomState({
      currentCustom: true,
      value: "",
      isPreset: false,
      requestedValue: "",
    })).toEqual({
      custom: true,
      requestedValue: null,
    });
  });

  test("clears a stale request before synchronizing an external purpose value", () => {
    expect(synchronizePurposeCustomState({
      currentCustom: false,
      value: "临时采购",
      isPreset: false,
      requestedValue: "项目备料",
    })).toEqual({
      custom: true,
      requestedValue: null,
    });
  });
});

describe("procurement editor field accessibility", () => {
  test("keeps ids unique and their labels and descriptions connected", () => {
    const markup = renderToStaticMarkup(createElement(
      "div",
      null,
      createElement(ProcurementPurposeField, {
        destinationType: "project",
        value: "自定义用途一",
        disabled: false,
        error: "请填写采购用途",
        onChange: () => {},
      }),
      createElement(ProcurementPurposeField, {
        destinationType: "warehouse",
        value: "自定义用途二",
        disabled: false,
        error: "请填写采购用途",
        onChange: () => {},
      }),
      createElement(ProcurementRemarkField, {
        value: "备注一",
        disabled: false,
        onChange: () => {},
      }),
      createElement(ProcurementRemarkField, {
        value: "备注二",
        disabled: false,
        onChange: () => {},
      }),
    ));
    const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((match) =>
      match[1]
    );
    const referencedIds = [
      ...markup.matchAll(/(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g),
    ].flatMap((match) => match[1]?.split(" ") ?? []);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const referencedId of referencedIds) {
      expect(ids).toContain(referencedId);
    }
  });
});
