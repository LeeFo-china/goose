import PDFDocument from "pdfkit";

import type {
  PurchaseOrderDocumentColumn,
  PurchaseOrderDocumentModel,
  PurchaseOrderDocumentRow,
} from "@/services/supplier-purchase-order-document";

export type PurchaseOrderPdfFont = {
  path: string;
  family?: string;
};

const PAGE_MARGIN = 36;
const TABLE_HEADER_HEIGHT = 26;
const MINIMUM_ROW_HEIGHT = 26;
const CELL_PADDING = 4;

export async function renderPurchaseOrderPdf(
  model: PurchaseOrderDocumentModel,
  font: PurchaseOrderPdfFont | null,
): Promise<Buffer> {
  const doc = new PDFDocument({
    margin: PAGE_MARGIN,
    size: "A4",
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  applyFont(doc, font);
  drawDocumentHeader(doc, model);
  let tableY = drawTableHeader(doc, model.columns, doc.y);

  for (const row of model.rows) {
    const rowHeight = measureRowHeight(doc, model.columns, row);
    if (tableY + rowHeight > pageBottom(doc)) {
      doc.addPage();
      applyFont(doc, font);
      tableY = drawTableHeader(doc, model.columns, PAGE_MARGIN);
    }
    drawTableRow(doc, model.columns, row, tableY, rowHeight);
    tableY += rowHeight;
  }

  if (tableY + MINIMUM_ROW_HEIGHT > pageBottom(doc)) {
    doc.addPage();
    applyFont(doc, font);
    tableY = drawTableHeader(doc, model.columns, PAGE_MARGIN);
  }
  drawSummaryRow(doc, model, tableY);
  doc.end();

  return finished;
}

function drawDocumentHeader(
  doc: PDFKit.PDFDocument,
  model: PurchaseOrderDocumentModel,
) {
  doc.fontSize(18).fillColor("#111827").text(model.title, {
    align: "center",
  });
  doc.moveDown(0.8).fontSize(10);
  for (const heading of model.headings) {
    doc.text(`${heading.label}：${heading.value}`, {
      width: tableWidth(model.columns),
    });
  }
  doc.moveDown(0.8).fontSize(11).text("商品明细");
  doc.moveDown(0.4);
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: readonly PurchaseOrderDocumentColumn[],
  y: number,
) {
  let x = PAGE_MARGIN;
  for (const column of columns) {
    drawCell(doc, column.label, x, y, column.pdfWidth, TABLE_HEADER_HEIGHT, {
      align: "center",
      bold: true,
      background: "#E5E7EB",
    });
    x += column.pdfWidth;
  }
  doc.y = y + TABLE_HEADER_HEIGHT;
  return doc.y;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  columns: readonly PurchaseOrderDocumentColumn[],
  row: PurchaseOrderDocumentRow,
  y: number,
  height: number,
) {
  let x = PAGE_MARGIN;
  for (const column of columns) {
    drawCell(
      doc,
      formatCellValue(row[column.key], column.format),
      x,
      y,
      column.pdfWidth,
      height,
      { align: column.align },
    );
    x += column.pdfWidth;
  }
  doc.y = y + height;
}

function drawSummaryRow(
  doc: PDFKit.PDFDocument,
  model: PurchaseOrderDocumentModel,
  y: number,
) {
  const amountColumn = model.columns.at(-1);
  if (!amountColumn) return;
  const labelWidth = tableWidth(model.columns) - amountColumn.pdfWidth;
  drawCell(
    doc,
    model.summary.label,
    PAGE_MARGIN,
    y,
    labelWidth,
    MINIMUM_ROW_HEIGHT,
    { align: "center", bold: true },
  );
  const amount = model.currency === "CNY"
    ? `¥${formatMoney(model.summary.amount)}`
    : `${formatMoney(model.summary.amount)} ${model.currency}`;
  drawCell(
    doc,
    amount,
    PAGE_MARGIN + labelWidth,
    y,
    amountColumn.pdfWidth,
    MINIMUM_ROW_HEIGHT,
    { align: "right", bold: true },
  );
  doc.y = y + MINIMUM_ROW_HEIGHT;
}

function drawCell(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    align: "left" | "center" | "right";
    bold?: boolean;
    background?: string;
  },
) {
  doc.save();
  if (options.background) {
    doc.rect(x, y, width, height)
      .fillAndStroke(options.background, "#D1D5DB");
  } else {
    doc.rect(x, y, width, height).stroke("#D1D5DB");
  }
  doc.restore();

  doc.fontSize(options.bold ? 9 : 8).fillColor("#111827").text(
    value,
    x + CELL_PADDING,
    y + CELL_PADDING + 1,
    {
      width: width - CELL_PADDING * 2,
      height: height - CELL_PADDING * 2,
      align: options.align,
      ellipsis: false,
    },
  );
}

function measureRowHeight(
  doc: PDFKit.PDFDocument,
  columns: readonly PurchaseOrderDocumentColumn[],
  row: PurchaseOrderDocumentRow,
) {
  doc.fontSize(8);
  const textHeight = Math.max(...columns.map((column) =>
    doc.heightOfString(formatCellValue(row[column.key], column.format), {
      width: column.pdfWidth - CELL_PADDING * 2,
      align: column.align,
    })
  ));
  return Math.max(MINIMUM_ROW_HEIGHT, Math.ceil(textHeight) + CELL_PADDING * 2);
}

function formatCellValue(
  value: PurchaseOrderDocumentRow[keyof PurchaseOrderDocumentRow],
  format?: PurchaseOrderDocumentColumn["format"],
) {
  if (format === "money") return formatMoney(Number(value));
  if (format === "quantity") return formatQuantity(Number(value));
  return String(value);
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function tableWidth(columns: readonly PurchaseOrderDocumentColumn[]) {
  return columns.reduce((width, column) => width + column.pdfWidth, 0);
}

function pageBottom(doc: PDFKit.PDFDocument) {
  return doc.page.height - PAGE_MARGIN;
}

function applyFont(
  doc: PDFKit.PDFDocument,
  font: PurchaseOrderPdfFont | null,
) {
  if (!font) return;
  if (font.family) {
    doc.font(font.path, font.family);
  } else {
    doc.font(font.path);
  }
}
