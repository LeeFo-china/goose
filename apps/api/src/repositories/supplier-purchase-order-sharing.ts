import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  SUPPLIER_PURCHASE_ORDER_ITEM_SELECT,
  SupplierPurchaseOrderItemSchema,
  SupplierPurchaseOrderWithReferencesSchema,
  type SupplierPurchaseOrderItem,
  type SupplierPurchaseOrderWithReferences,
} from "@/repositories/supplier-purchase-order-records";
import { SupabaseDB } from "@/utils/supabase";

const SHARE_LINK_SELECT = [
  "id",
  "tenant_id",
  "supplier_purchase_order_id",
  "tenant_supplier_id",
  "supplier_id",
  "share_token",
  "status",
  "expires_at",
  "created_by_employee_id",
  "idempotency_key",
  "last_viewed_at",
  "viewed_count",
  "confirmed_at",
  "confirm_remark",
  "created_at",
  "updated_at",
].join(",");

const ORDER_EXPORT_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "tenant_supplier_id",
  "supplier_id",
  "order_no",
  "status",
  "currency",
  "expected_delivery_date",
  "remark",
  "priced_at",
  "subtotal_amount::text",
  "tax_amount::text",
  "total_amount::text",
  "purchase_requisition_id",
  "purchase_batch_id",
  "version",
  "created_by_employee_id",
  "updated_by_employee_id",
  "submitted_by_employee_id",
  "submitted_at",
  "cancelled_by_employee_id",
  "cancelled_at",
  "cancel_reason",
  "created_at",
  "updated_at",
  "commercial_snapshot_source",
  "settlement_term_days_snapshot",
  "invoice_required_before_payment_snapshot",
  "project:projects!project_id(id,name,address,status)",
  "supplier:suppliers!supplier_id(id,code,name,legal_name,onboarding_status,operational_status)",
  "purchase_requisition:supplier_purchase_requisitions!supplier_purchase_orders_requisition_tenant_fkey(id,request_no,status,budget_status)",
].join(",");

const uuid = z.uuid();
const dateTime = z.string();
const ShareLinkRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_purchase_order_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  share_token: z.string().regex(/^pos_[A-Za-z0-9_-]{32,}$/),
  status: z.enum(["active", "disabled"]),
  expires_at: dateTime,
  created_by_employee_id: uuid,
  idempotency_key: z.string(),
  last_viewed_at: dateTime.nullable(),
  viewed_count: z.number().int().nonnegative(),
  confirmed_at: dateTime.nullable(),
  confirm_remark: z.string().nullable(),
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

const ExportOrderSchema = SupplierPurchaseOrderWithReferencesSchema.extend({
  project: z.object({
    id: uuid,
    name: z.string(),
    address: z.string().nullable().optional(),
    status: z.string(),
  }).strict(),
}).strict();

export type SupplierPurchaseOrderShareLink =
  z.infer<typeof ShareLinkRecordSchema>;
export type SupplierPurchaseOrderExportOrder =
  z.infer<typeof ExportOrderSchema>;
export type SupplierPurchaseOrderExportSnapshot = {
  order: SupplierPurchaseOrderExportOrder;
  items: SupplierPurchaseOrderItem[];
  share_link?: SupplierPurchaseOrderShareLink | null;
};

type SingleResult = { data: unknown; error: DbError | null };
type QueryResult = {
  data: unknown;
  error: DbError | null;
  count: number | null;
};
type DbError = { code?: string; message?: string; details?: string };
type Query = {
  select: (...args: unknown[]) => Query;
  insert: (value: unknown) => Query;
  update: (value: unknown) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: readonly string[]) => Query;
  gt: (column: string, value: unknown) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  single: () => Promise<SingleResult>;
  maybeSingle: () => Promise<SingleResult>;
  then: Promise<QueryResult>["then"];
};
type Client = {
  from: (table: string) => Query;
};

export class SupplierPurchaseOrderSharingRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async findShareLinkByIdempotency(input: {
    tenantId: string;
    orderId: string;
    employeeId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.client
      .from("supplier_purchase_order_share_links")
      .select(SHARE_LINK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("supplier_purchase_order_id", input.orderId)
      .eq("created_by_employee_id", input.employeeId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) throw Errors.dbError("查询采购单分享链接失败", error);
    return parseMaybeLink(data);
  }

  async createShareLink(input: {
    tenantId: string;
    orderId: string;
    tenantSupplierId: string;
    supplierId: string;
    shareToken: string;
    expiresAt: string;
    employeeId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.client
      .from("supplier_purchase_order_share_links")
      .insert({
        tenant_id: input.tenantId,
        supplier_purchase_order_id: input.orderId,
        tenant_supplier_id: input.tenantSupplierId,
        supplier_id: input.supplierId,
        share_token: input.shareToken,
        expires_at: input.expiresAt,
        created_by_employee_id: input.employeeId,
        idempotency_key: input.idempotencyKey,
      })
      .select(SHARE_LINK_SELECT)
      .single();

    if (error) {
      if (error.code === "23505") {
        return this.findShareLinkByIdempotency({
          tenantId: input.tenantId,
          orderId: input.orderId,
          employeeId: input.employeeId,
          idempotencyKey: input.idempotencyKey,
        });
      }
      throw Errors.dbError("创建采购单分享链接失败", error);
    }
    return parseLink(data, "创建采购单分享链接失败");
  }

  async findActiveShareLinkByToken(token: string, checkedAt: string) {
    const { data, error } = await this.client
      .from("supplier_purchase_order_share_links")
      .select(SHARE_LINK_SELECT)
      .eq("share_token", token)
      .eq("status", "active")
      .gt("expires_at", checkedAt)
      .maybeSingle();
    if (error) throw Errors.dbError("查询采购单分享链接失败", error);
    return parseMaybeLink(data);
  }

  async recordViewed(link: SupplierPurchaseOrderShareLink, viewedAt: string) {
    const { data, error } = await this.client
      .from("supplier_purchase_order_share_links")
      .update({
        last_viewed_at: viewedAt,
        viewed_count: link.viewed_count + 1,
      })
      .eq("id", link.id)
      .select(SHARE_LINK_SELECT)
      .single();
    if (error) throw Errors.dbError("记录采购单分享查看失败", error);
    return parseLink(data, "记录采购单分享查看失败");
  }

  async confirmViewed(input: {
    link: SupplierPurchaseOrderShareLink;
    confirmedAt: string;
    remark: string | null;
  }) {
    const { data, error } = await this.client
      .from("supplier_purchase_order_share_links")
      .update({
        confirmed_at: input.link.confirmed_at ?? input.confirmedAt,
        confirm_remark: input.link.confirm_remark ?? input.remark,
      })
      .eq("id", input.link.id)
      .select(SHARE_LINK_SELECT)
      .single();
    if (error) throw Errors.dbError("确认采购单分享查看失败", error);
    return parseLink(data, "确认采购单分享查看失败");
  }

  async getOrderSnapshot(tenantId: string, orderId: string) {
    const order = await this.findExportOrder(tenantId, orderId);
    if (!order) return null;
    const items = await this.listExportItems(tenantId, [orderId]);
    return {
      order,
      items: items.filter((item) => item.supplier_purchase_order_id === orderId),
    };
  }

  async getBatchOrderSnapshots(tenantId: string, batchId: string) {
    // Purchase batches are limited to at most 100 source lines, so at most 100
    // supplier purchase orders can be generated for one batch.
    const { data, error } = await this.client
      .from("supplier_purchase_orders")
      .select(ORDER_EXPORT_SELECT)
      .eq("tenant_id", tenantId)
      .eq("purchase_batch_id", batchId)
      .order("order_no", { ascending: true })
      .order("id", { ascending: true })
      .limit(100);
    if (error) throw Errors.dbError("查询采购批次采购单导出数据失败", error);

    const orders = parseRows(
      ExportOrderSchema,
      data,
      "查询采购批次采购单导出数据失败",
    );
    if (orders.length === 0) return [];

    const items = await this.listExportItems(
      tenantId,
      orders.map((order) => order.id),
    );
    return orders.map((order) => ({
      order,
      items: items.filter((item) =>
        item.supplier_purchase_order_id === order.id
      ),
    }));
  }

  private async findExportOrder(tenantId: string, orderId: string) {
    const { data, error } = await this.client
      .from("supplier_purchase_orders")
      .select(ORDER_EXPORT_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询采购单导出数据失败", error);
    return data === null
      ? null
      : parse(ExportOrderSchema, data, "查询采购单导出数据失败");
  }

  private async listExportItems(
    tenantId: string,
    orderIds: readonly string[],
  ) {
    if (orderIds.length === 0) return [];
    // Each purchase order is already capped to 100 items at creation time.
    const { data, error } = await this.client
      .from("supplier_purchase_order_items")
      .select(SUPPLIER_PURCHASE_ORDER_ITEM_SELECT)
      .eq("tenant_id", tenantId)
      .in("supplier_purchase_order_id", orderIds)
      .order("supplier_purchase_order_id", { ascending: true })
      .order("line_no", { ascending: true })
      .limit(orderIds.length * 100);
    if (error) throw Errors.dbError("查询采购单导出明细失败", error);
    return parseRows(
      SupplierPurchaseOrderItemSchema,
      data,
      "查询采购单导出明细失败",
    );
  }
}

function parseLink(data: unknown, message: string) {
  return parse(ShareLinkRecordSchema, data, message);
}

function parseMaybeLink(data: unknown) {
  return data === null
    ? null
    : parseLink(data, "查询采购单分享链接失败");
}

function parse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  message: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.dbError(message, result.error.issues);
  return result.data;
}

function parseRows<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  message: string,
): Array<z.infer<T>> {
  const result = z.array(schema).safeParse(data ?? []);
  if (!result.success) throw Errors.dbError(message, result.error.issues);
  return result.data;
}

export const supplierPurchaseOrderSharingRepository =
  new SupplierPurchaseOrderSharingRepository();
