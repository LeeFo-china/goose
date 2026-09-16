import { existsSync } from "node:fs";

import ExcelJS from "exceljs";

import type {
  SupplierPurchaseOrderExportSnapshot,
} from "@/repositories/supplier-purchase-order-sharing";
import {
  buildPurchaseOrderDocumentModel,
} from "@/services/supplier-purchase-order-document";
import {
  renderPurchaseOrderPdf,
  type PurchaseOrderPdfFont,
} from "@/services/supplier-purchase-order-pdf";

export { buildPurchaseOrderDocumentModel } from
  "@/services/supplier-purchase-order-document";

export type SupplierPurchaseOrderExportFile = {
  filename: string;
  content_type: string;
  content: Buffer;
};

const PDF_CONTENT_TYPE = "application/pdf";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXCEL_FONT = "Microsoft YaHei";
const EXCEL_MONEY_FORMAT = '"¥"#,##0.00';
const EXCEL_QUANTITY_FORMAT = "#,##0.####";

export function toPurchaseOrderPrintPreview(
  snapshot: SupplierPurchaseOrderExportSnapshot,
) {
  return {
    order: serializeOrder(snapshot),
    items: snapshot.items.map((item) => ({
      line_no: item.line_no,
      product_name: item.product_name_snapshot,
      sku_name: item.sku_name_snapshot,
      specification: item.specification_snapshot,
      model: item.model_snapshot,
      quantity: item.quantity,
      unit: item.purchase_unit_symbol_snapshot,
      unit_price: item.unit_price,
      subtotal_amount: item.subtotal_amount,
      tax_amount: item.tax_amount,
      total_amount: item.total_amount,
    })),
    totals: {
      subtotal_amount: snapshot.order.subtotal_amount,
      tax_amount: snapshot.order.tax_amount,
      total_amount: snapshot.order.total_amount,
      currency: snapshot.order.currency,
    },
  };
}

export async function exportPurchaseOrderXlsx(
  snapshot: SupplierPurchaseOrderExportSnapshot,
): Promise<SupplierPurchaseOrderExportFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gooes";
  workbook.created = new Date();
  appendOrderWorksheet(workbook, snapshot, "采购单");
  const content = await workbook.xlsx.writeBuffer();
  return {
    filename: `${safeFilename(snapshot.order.order_no)}.xlsx`,
    content_type: XLSX_CONTENT_TYPE,
    content: Buffer.from(content),
  };
}

export async function exportPurchaseBatchXlsx(
  snapshots: readonly SupplierPurchaseOrderExportSnapshot[],
  batchId: string,
): Promise<SupplierPurchaseOrderExportFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gooes";
  workbook.created = new Date();

  if (snapshots.length === 0) {
    const worksheet = workbook.addWorksheet("采购单");
    worksheet.addRow(["采购批次没有已生成的采购单"]);
  } else {
    for (const snapshot of snapshots) {
      appendOrderWorksheet(
        workbook,
        snapshot,
        sheetName(snapshot.order.supplier.name, snapshot.order.order_no),
      );
    }
  }

  const content = await workbook.xlsx.writeBuffer();
  return {
    filename: `purchase-batch-${safeFilename(batchId)}.xlsx`,
    content_type: XLSX_CONTENT_TYPE,
    content: Buffer.from(content),
  };
}

export async function exportPurchaseOrderPdf(
  snapshot: SupplierPurchaseOrderExportSnapshot,
): Promise<SupplierPurchaseOrderExportFile> {
  return {
    filename: `${safeFilename(snapshot.order.order_no)}.pdf`,
    content_type: PDF_CONTENT_TYPE,
    content: await renderPurchaseOrderPdf(
      buildPurchaseOrderDocumentModel(snapshot),
      resolveChineseFont(),
    ),
  };
}

function appendOrderWorksheet(
  workbook: ExcelJS.Workbook,
  snapshot: SupplierPurchaseOrderExportSnapshot,
  name: string,
) {
  const model = buildPurchaseOrderDocumentModel(snapshot);
  const worksheet = workbook.addWorksheet(name.slice(0, 31));
  workbook.calcProperties.fullCalcOnLoad = true;
  worksheet.properties.defaultRowHeight = 22;
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.6,
      bottom: 0.6,
      header: 0.2,
      footer: 0.2,
    },
  };
  model.columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.excelWidth;
  });

  model.headings.forEach(({ label, value }, index) => {
    const rowNumber = index + 1;
    worksheet.mergeCells(rowNumber, 1, rowNumber, model.columns.length);
    const cell = worksheet.getCell(rowNumber, 1);
    cell.value = `${label}：${value}`;
    cell.font = { name: EXCEL_FONT, size: 11 };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  worksheet.addRow([]);
  const headerRow = worksheet.addRow(
    model.columns.map((column) => column.label),
  );
  headerRow.eachCell((cell) => {
    cell.font = { name: EXCEL_FONT, size: 11, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    cell.border = thinBorder();
  });

  const firstItemRow = headerRow.number + 1;
  for (const item of model.rows) {
    const row = worksheet.addRow([
      item.lineNumber,
      item.productName,
      item.specification,
      item.quantity,
      item.unit,
      item.unitPrice,
      {
        formula: `D${worksheet.rowCount + 1}*F${worksheet.rowCount + 1}`,
        result: item.amount,
      },
    ]);
    styleItemRow(row);
  }
  const lastItemRow = worksheet.rowCount;
  const summaryFormula = model.rows.length > 0
    ? `SUM(G${firstItemRow}:G${lastItemRow})`
    : "0";
  const summaryRow = worksheet.addRow([
    model.summary.label,
    "",
    "",
    "",
    "",
    "",
    {
      formula: summaryFormula,
      result: model.summary.amount,
    },
  ]);
  worksheet.mergeCells(summaryRow.number, 1, summaryRow.number, 6);
  summaryRow.eachCell((cell) => {
    cell.font = { name: EXCEL_FONT, size: 11, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  });
  summaryRow.getCell(7).numFmt = EXCEL_MONEY_FORMAT;
}

function styleItemRow(row: ExcelJS.Row) {
  row.eachCell((cell, columnNumber) => {
    cell.font = { name: EXCEL_FONT, size: 11 };
    cell.border = thinBorder();
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: columnNumber === 2 || columnNumber === 3,
    };
  });
  row.getCell(4).numFmt = EXCEL_QUANTITY_FORMAT;
  row.getCell(6).numFmt = EXCEL_MONEY_FORMAT;
  row.getCell(7).numFmt = EXCEL_MONEY_FORMAT;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  };
}

function serializeOrder(snapshot: SupplierPurchaseOrderExportSnapshot) {
  return {
    id: snapshot.order.id,
    order_no: snapshot.order.order_no,
    status: snapshot.order.status,
    currency: snapshot.order.currency,
    expected_delivery_date: snapshot.order.expected_delivery_date,
    remark: snapshot.order.remark,
    subtotal_amount: snapshot.order.subtotal_amount,
    tax_amount: snapshot.order.tax_amount,
    total_amount: snapshot.order.total_amount,
    destination_type: snapshot.order.destination_type,
    warehouse_id: snapshot.order.warehouse_id,
    warehouse: snapshot.order.warehouse,
    project: snapshot.order.project ? {
      id: snapshot.order.project.id,
      name: snapshot.order.project.name,
      address: snapshot.order.project.address ?? null,
    } : null,
    supplier: {
      id: snapshot.order.supplier.id,
      code: snapshot.order.supplier.code,
      name: snapshot.order.supplier.name,
      legal_name: snapshot.order.supplier.legal_name,
    },
    share_link: snapshot.share_link
      ? {
        id: snapshot.share_link.id,
        expires_at: snapshot.share_link.expires_at,
        confirmed_at: snapshot.share_link.confirmed_at,
        confirm_remark: snapshot.share_link.confirm_remark,
      }
      : null,
  };
}

function sheetName(supplierName: string, orderNo: string) {
  return safeFilename(`${supplierName}-${orderNo}`).slice(0, 31) || "采购单";
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

function resolveChineseFont(): PurchaseOrderPdfFont | null {
  const configured = process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH;
  const configuredFamily =
    process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_FAMILY;

  if (configured && existsSync(configured)) {
    const configuredFont = fontCandidate(configured, configuredFamily);
    if (configuredFont) return configuredFont;
  }

  const candidates: PurchaseOrderPdfFont[] = [
    { path: "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf" },
    { path: "/usr/share/fonts/truetype/noto/NotoSansCJKsc-Regular.ttf" },
    {
      path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      family: "NotoSansCJKsc-Regular",
    },
    {
      path: "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
      family: "NotoSansCJKsc-Regular",
    },
    {
      path: "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
      family: "NotoSerifCJKsc-Regular",
    },
    {
      path: "/System/Library/Fonts/Supplemental/Songti.ttc",
      family: "STSongti-SC-Regular",
    },
    { path: "/Library/Fonts/Arial Unicode.ttf" },
  ];
  return candidates.find((candidate) => existsSync(candidate.path)) ?? null;
}

function fontCandidate(
  path: string,
  family?: string,
): PurchaseOrderPdfFont | null {
  if (family) return { path, family };
  if (!path.toLowerCase().endsWith(".ttc")) return { path };

  const inferredFamily = inferChineseFontFamily(path);
  if (!inferredFamily) return null;
  return { path, family: inferredFamily };
}

function inferChineseFontFamily(path: string): string | null {
  if (path.endsWith("NotoSansCJK-Regular.ttc")) {
    return "NotoSansCJKsc-Regular";
  }
  if (path.endsWith("NotoSerifCJK-Regular.ttc")) {
    return "NotoSerifCJKsc-Regular";
  }
  if (path.endsWith("Songti.ttc")) {
    return "STSongti-SC-Regular";
  }
  return null;
}
