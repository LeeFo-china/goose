import type {
  SupplierPurchaseOrderExportSnapshot,
} from "@/repositories/supplier-purchase-order-sharing";

export type PurchaseOrderDocumentRow = {
  lineNumber: number;
  productName: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

export type PurchaseOrderDocumentColumn = {
  key: keyof PurchaseOrderDocumentRow;
  label: string;
  excelWidth: number;
  pdfWidth: number;
  align: "left" | "center" | "right";
  format?: "money" | "quantity";
};

export type PurchaseOrderDocumentModel = {
  title: string;
  headings: Array<{ label: string; value: string }>;
  columns: PurchaseOrderDocumentColumn[];
  rows: PurchaseOrderDocumentRow[];
  summary: { label: string; amount: number };
  currency: string;
};

export const PURCHASE_ORDER_DOCUMENT_COLUMNS: PurchaseOrderDocumentColumn[] = [
  { key: "lineNumber", label: "序号", excelWidth: 8, pdfWidth: 32, align: "center" },
  { key: "productName", label: "材料", excelWidth: 28, pdfWidth: 112, align: "left" },
  { key: "specification", label: "规格/型号", excelWidth: 24, pdfWidth: 123, align: "left" },
  { key: "quantity", label: "数量", excelWidth: 12, pdfWidth: 50, align: "right", format: "quantity" },
  { key: "unit", label: "单位", excelWidth: 10, pdfWidth: 46, align: "center" },
  { key: "unitPrice", label: "单价", excelWidth: 14, pdfWidth: 72, align: "right", format: "money" },
  { key: "amount", label: "合计", excelWidth: 14, pdfWidth: 88, align: "right", format: "money" },
];

export function buildPurchaseOrderDocumentModel(
  snapshot: SupplierPurchaseOrderExportSnapshot,
): PurchaseOrderDocumentModel {
  const destinationLabel = snapshot.order.destination_type === "warehouse"
    ? "仓库"
    : "项目";
  const destinationName = snapshot.order.warehouse?.name ??
    snapshot.order.project?.name ?? "-";
  const rows = snapshot.items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    return {
      lineNumber: item.line_no,
      productName: item.product_name_snapshot,
      specification: specificationText(item),
      quantity,
      unit: item.purchase_unit_symbol_snapshot,
      unitPrice,
      amount: quantity * unitPrice,
    };
  });

  return {
    title: "供应商采购单",
    headings: [
      { label: "采购单号", value: snapshot.order.order_no },
      { label: "供应商", value: snapshot.order.supplier.name },
      { label: destinationLabel, value: destinationName },
      { label: "项目地址", value: snapshot.order.project?.address ?? "-" },
      { label: "预计到货", value: snapshot.order.expected_delivery_date ?? "-" },
      { label: "备注", value: snapshot.order.remark ?? "-" },
    ],
    columns: PURCHASE_ORDER_DOCUMENT_COLUMNS,
    rows,
    summary: {
      label: "汇总",
      amount: rows.reduce((total, row) => total + row.amount, 0),
    },
    currency: snapshot.order.currency,
  };
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
