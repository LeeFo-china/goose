import { existsSync } from "node:fs";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import type {
  SupplierPurchaseOrderExportSnapshot,
} from "@/repositories/supplier-purchase-order-sharing";

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
const PURCHASE_ORDER_COLUMNS = [
  { width: 8 },
  { width: 28 },
  { width: 24 },
  { width: 12 },
  { width: 10 },
  { width: 14 },
  { width: 14 },
] as const;

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
  const doc = new PDFDocument({ margin: 48, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const font = resolveChineseFont();
  if (font) {
    if (font.family) {
      doc.font(font.path, font.family);
    } else {
      doc.font(font.path);
    }
  }

  doc.fontSize(18).text("供应商采购单", { align: "center" });
  doc.moveDown();
  doc.fontSize(10);
  writePair(doc, "采购单号", snapshot.order.order_no);
  writePair(doc, "供应商", snapshot.order.supplier.name);
  writePair(doc, "项目", snapshot.order.project.name);
  writePair(doc, "项目地址", snapshot.order.project.address ?? "-");
  writePair(doc, "预计到货", snapshot.order.expected_delivery_date ?? "-");
  writePair(doc, "备注", snapshot.order.remark ?? "-");
  doc.moveDown();

  doc.fontSize(11).text("商品明细");
  doc.moveDown(0.5);
  const columns = ["序号", "商品", "SKU/规格", "数量", "单价", "金额"];
  doc.fontSize(9).text(columns.join("    "));
  doc.moveDown(0.3);
  for (const item of snapshot.items) {
    const specification = [
      item.sku_name_snapshot,
      item.specification_snapshot,
      item.model_snapshot,
    ].filter(Boolean).join(" / ");
    doc.text([
      String(item.line_no),
      item.product_name_snapshot,
      specification || "-",
      `${item.quantity}${item.purchase_unit_symbol_snapshot}`,
      money(item.unit_price),
      money(item.total_amount),
    ].join("    "));
  }

  doc.moveDown();
  doc.fontSize(10)
    .text(`小计：${money(snapshot.order.subtotal_amount)} CNY`)
    .text(`税额：${money(snapshot.order.tax_amount)} CNY`)
    .text(`合计：${money(snapshot.order.total_amount)} CNY`);
  doc.end();

  return {
    filename: `${safeFilename(snapshot.order.order_no)}.pdf`,
    content_type: PDF_CONTENT_TYPE,
    content: await finished,
  };
}

function appendOrderWorksheet(
  workbook: ExcelJS.Workbook,
  snapshot: SupplierPurchaseOrderExportSnapshot,
  name: string,
) {
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
  PURCHASE_ORDER_COLUMNS.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
  });

  [
    ["采购单号", snapshot.order.order_no],
    ["供应商", snapshot.order.supplier.name],
    ["项目", snapshot.order.project.name],
    ["项目地址", snapshot.order.project.address ?? ""],
    ["预计到货", snapshot.order.expected_delivery_date ?? ""],
    ["备注", snapshot.order.remark ?? ""],
  ].forEach(([label, value], index) => {
    const rowNumber = index + 1;
    worksheet.mergeCells(rowNumber, 1, rowNumber, 7);
    const cell = worksheet.getCell(rowNumber, 1);
    cell.value = `${label}：${value || "-"}`;
    cell.font = { name: EXCEL_FONT, size: 11 };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  worksheet.addRow([]);
  const headerRow = worksheet.addRow([
    "序号",
    "材料",
    "规格/型号",
    "数量",
    "单位",
    "单价",
    "合计",
  ]);
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
  for (const item of snapshot.items) {
    const row = worksheet.addRow([
      item.line_no,
      item.product_name_snapshot,
      specificationText(item),
      Number(item.quantity),
      item.purchase_unit_symbol_snapshot,
      Number(item.unit_price),
      {
        formula: `D${worksheet.rowCount + 1}*F${worksheet.rowCount + 1}`,
        result: Number(item.quantity) * Number(item.unit_price),
      },
    ]);
    styleItemRow(row);
  }
  const lastItemRow = worksheet.rowCount;
  const summaryFormula = snapshot.items.length > 0
    ? `SUM(G${firstItemRow}:G${lastItemRow})`
    : "0";
  const summaryRow = worksheet.addRow([
    "汇总",
    "",
    "",
    "",
    "",
    "",
    {
      formula: summaryFormula,
      result: snapshot.items.reduce(
        (total, item) => total + Number(item.quantity) * Number(item.unit_price),
        0,
      ),
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

function specificationText(
  item: SupplierPurchaseOrderExportSnapshot["items"][number],
) {
  return [
    item.sku_name_snapshot,
    item.specification_snapshot,
    item.model_snapshot,
  ].filter(Boolean).join(" / ") || "-";
}

function styleItemRow(row: ExcelJS.Row) {
  row.eachCell((cell, columnNumber) => {
    cell.font = { name: EXCEL_FONT, size: 11 };
    cell.border = thinBorder();
    cell.alignment = {
      horizontal: columnNumber === 1 ? "center" : undefined,
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
    project: {
      id: snapshot.order.project.id,
      name: snapshot.order.project.name,
      address: snapshot.order.project.address ?? null,
    },
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

function writePair(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.text(`${label}：${value}`);
}

function money(value: string) {
  return Number(value).toFixed(2);
}

function sheetName(supplierName: string, orderNo: string) {
  return safeFilename(`${supplierName}-${orderNo}`).slice(0, 31) || "采购单";
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

type ChineseFont = {
  path: string;
  family?: string;
};

function resolveChineseFont(): ChineseFont | null {
  const configured = process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_PATH;
  const configuredFamily =
    process.env.SUPPLIER_PURCHASE_ORDER_PDF_FONT_FAMILY;

  if (configured && existsSync(configured)) {
    const configuredFont = fontCandidate(configured, configuredFamily);
    if (configuredFont) return configuredFont;
  }

  const candidates: ChineseFont[] = [
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

function fontCandidate(path: string, family?: string): ChineseFont | null {
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
