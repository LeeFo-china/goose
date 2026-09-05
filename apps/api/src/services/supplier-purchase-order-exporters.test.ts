import { existsSync } from "node:fs";

import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";

import {
  exportPurchaseBatchXlsx,
  exportPurchaseOrderPdf,
  exportPurchaseOrderXlsx,
  toPurchaseOrderPrintPreview,
} from "@/services/supplier-purchase-order-exporters";
import type {
  SupplierPurchaseOrderExportSnapshot,
} from "@/repositories/supplier-purchase-order-sharing";

type ExcelLoadBuffer = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

describe("supplier purchase order exporters", () => {
  test("creates real xlsx and pdf files from one snapshot", async () => {
    const snapshot = sampleSnapshot();

    const xlsx = await exportPurchaseOrderXlsx(snapshot);
    const pdf = await exportPurchaseOrderPdf(snapshot);

    expect(xlsx.content_type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(xlsx.content.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.content_type).toBe("application/pdf");
    expect(pdf.content.subarray(0, 4).toString()).toBe("%PDF");
  });

  test("formats xlsx as a purchase order sheet instead of a field-value dump", async () => {
    const file = await exportPurchaseOrderXlsx(sampleSnapshot());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.content as unknown as ExcelLoadBuffer);
    const worksheet = workbook.getWorksheet("采购单");

    expect(worksheet).toBeDefined();
    if (!worksheet) return;

    expect(worksheet.getRow(1).values).not.toContain("字段");
    expect(worksheet.getRow(1).values).not.toContain("值");
    expect(worksheet.getCell("A1").value).toBe("采购单号：PO-20260904-00000001");
    expect(worksheet.getCell("G1").isMerged).toBe(true);
    expect(worksheet.getCell("A6").value).toBe("备注：deliver");
    expect(worksheet.getCell("G6").isMerged).toBe(true);

    expect(worksheet.getRow(8).values).toEqual([
      undefined,
      "序号",
      "材料",
      "规格/型号",
      "数量",
      "单位",
      "单价",
      "合计",
    ]);
    expect(worksheet.getRow(8).values).not.toContain("税额");
    expect(worksheet.getCell("A9").alignment).toMatchObject({
      horizontal: "center",
      vertical: "middle",
    });
    for (const address of ["A9", "B9", "C9", "D9", "E9", "F9", "G9"]) {
      expect(worksheet.getCell(address).alignment).toMatchObject({
        horizontal: "center",
        vertical: "middle",
      });
    }
    expect(worksheet.getCell("B9").value).toBe("Product A");
    expect(worksheet.getCell("C9").value).toBe("Sku A");
    expect(worksheet.getCell("G9").formula).toBe("D9*F9");
    expect(worksheet.getCell("G10").formula).toBe("SUM(G9:G9)");
  });

  test("creates pdf when configured Chinese font is a TrueType collection", async () => {
    const collectionFont = "/System/Library/Fonts/Supplemental/Songti.ttc";
    if (!existsSync(collectionFont)) return;

    const previousFontPath = process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH;
    const previousFontFamily =
      process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_FAMILY;
    process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH = collectionFont;
    delete process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_FAMILY;

    try {
      const pdf = await exportPurchaseOrderPdf(sampleSnapshot());

      expect(pdf.content_type).toBe("application/pdf");
      expect(pdf.content.subarray(0, 4).toString()).toBe("%PDF");
    } finally {
      if (previousFontPath === undefined) {
        delete process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH;
      } else {
        process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH = previousFontPath;
      }
      if (previousFontFamily === undefined) {
        delete process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_FAMILY;
      } else {
        process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_FAMILY =
          previousFontFamily;
      }
    }
  });

  test("creates a batch workbook with one worksheet per supplier order", async () => {
    const file = await exportPurchaseBatchXlsx([sampleSnapshot()], BATCH_ID);

    expect(file.filename).toBe(`purchase-batch-${BATCH_ID}.xlsx`);
    expect(file.content.subarray(0, 2).toString()).toBe("PK");
  });

  test("serializes print preview from the same export snapshot", () => {
    const preview = toPurchaseOrderPrintPreview(sampleSnapshot());

    expect(preview.order.order_no).toBe("PO-20260904-00000001");
    expect(preview.items).toHaveLength(1);
    expect(preview.totals.total_amount).toBe("120.00");
  });
});

const BATCH_ID = "62000000-0000-4000-8000-000000000099";

function sampleSnapshot(): SupplierPurchaseOrderExportSnapshot {
  return {
    order: {
      id: "62000000-0000-4000-8000-000000000001",
      tenant_id: "62000000-0000-4000-8000-000000000002",
      project_id: "62000000-0000-4000-8000-000000000003",
      tenant_supplier_id: "62000000-0000-4000-8000-000000000004",
      supplier_id: "62000000-0000-4000-8000-000000000005",
      order_no: "PO-20260904-00000001",
      status: "submitted",
      currency: "CNY",
      expected_delivery_date: "2026-09-10",
      remark: "deliver",
      priced_at: "2026-09-04T00:00:00+08:00",
      subtotal_amount: "100.00",
      tax_amount: "20.00",
      total_amount: "120.00",
      purchase_requisition_id: null,
      purchase_batch_id: BATCH_ID,
      version: 1,
      created_by_employee_id: "62000000-0000-4000-8000-000000000006",
      updated_by_employee_id: "62000000-0000-4000-8000-000000000006",
      submitted_by_employee_id: "62000000-0000-4000-8000-000000000006",
      submitted_at: "2026-09-04T00:00:00+08:00",
      cancelled_by_employee_id: null,
      cancelled_at: null,
      cancel_reason: null,
      created_at: "2026-09-04T00:00:00+08:00",
      updated_at: "2026-09-04T00:00:00+08:00",
      project: {
        id: "62000000-0000-4000-8000-000000000003",
        name: "Project A",
        address: "Address A",
        status: "active",
      },
      supplier: {
        id: "62000000-0000-4000-8000-000000000005",
        code: "SUP-A",
        name: "Supplier A",
        legal_name: "Supplier A Ltd",
        onboarding_status: "approved",
        operational_status: "active",
      },
      purchase_requisition: null,
    },
    items: [{
      id: "62000000-0000-4000-8000-000000000010",
      tenant_id: "62000000-0000-4000-8000-000000000002",
      supplier_id: "62000000-0000-4000-8000-000000000005",
      supplier_purchase_order_id: "62000000-0000-4000-8000-000000000001",
      line_no: 1,
      supplier_product_id: "62000000-0000-4000-8000-000000000011",
      supplier_sku_id: "62000000-0000-4000-8000-000000000012",
      supplier_price_list_id: "62000000-0000-4000-8000-000000000013",
      supplier_price_list_item_id: "62000000-0000-4000-8000-000000000014",
      product_code_snapshot: "P-1",
      product_name_snapshot: "Product A",
      sku_code_snapshot: "SKU-1",
      sku_name_snapshot: "Sku A",
      specification_snapshot: null,
      model_snapshot: null,
      purchase_unit_id: "62000000-0000-4000-8000-000000000015",
      purchase_unit_code_snapshot: "pcs",
      purchase_unit_name_snapshot: "Piece",
      purchase_unit_symbol_snapshot: "pcs",
      base_unit_id: "62000000-0000-4000-8000-000000000016",
      base_unit_code_snapshot: "pcs",
      base_unit_name_snapshot: "Piece",
      base_unit_symbol_snapshot: "pcs",
      base_unit_conversion: "1",
      price_list_code_snapshot: "PL-1",
      price_list_version_snapshot: 1,
      price_effective_from_snapshot: "2026-09-04T00:00:00+08:00",
      price_effective_until_snapshot: null,
      quantity: "2.0000",
      unit_price: "50.00",
      tax_rate: "0.200000",
      tax_inclusive: true,
      subtotal_amount: "100.00",
      tax_amount: "20.00",
      total_amount: "120.00",
      created_at: "2026-09-04T00:00:00+08:00",
      updated_at: "2026-09-04T00:00:00+08:00",
    }],
    share_link: null,
  };
}
