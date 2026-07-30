import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  mapSupplierCommandDatabaseError,
  throwSupplierCommandDatabaseError,
} from "@/repositories/supplier-command-errors";
import {
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT,
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_SELECT,
  SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT,
  SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT,
  SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema,
  SupplierPurchaseOrderFulfillmentDetailSchema,
  SupplierPurchaseOrderFulfillmentSchema,
  SupplierPurchaseOrderItemFulfillmentSchema,
  SupplierPurchaseOrderReceiptSchema,
  SupplierPurchaseOrderShipmentSchema,
  type SupplierPurchaseOrderFulfillment,
  type SupplierPurchaseOrderReceipt,
  type SupplierPurchaseOrderShipment,
} from "@/repositories/supplier-purchase-fulfillment-records";
import type { SupplierPurchaseOrder } from "@/repositories/supplier-purchase-order-records";
import type {
  SupplierPurchaseOrderFulfillmentConfirmInput,
  SupplierPurchaseOrderReceiptCreateInput,
  SupplierPurchaseOrderShipmentCreateInput,
} from "@/schema/supplier-purchase-orders";
import { SupabaseDB } from "@/utils/supabase";

type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
type PageInput = { page: number; pageSize: number };
type OrderScope = { tenant_id: string; order_id: string };
type CommandContext = OrderScope & {
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

export type SupplierPurchaseOrderFulfillmentDetailInput = OrderScope;
export type SupplierPurchaseOrderFulfillmentEventListInput =
  OrderScope & PageInput;
export type SupplierPurchaseOrderFulfillmentConfirmCommand =
  CommandContext & SupplierPurchaseOrderFulfillmentConfirmInput;
export type SupplierPurchaseOrderShipmentCreateCommand =
  CommandContext & SupplierPurchaseOrderShipmentCreateInput;
export type SupplierPurchaseOrderReceiptCreateCommand =
  CommandContext & SupplierPurchaseOrderReceiptCreateInput;
export type SupplierPurchaseOrderShipmentPage =
  Page<SupplierPurchaseOrderShipment>;
export type SupplierPurchaseOrderReceiptPage =
  Page<SupplierPurchaseOrderReceipt>;
export type SupplierPurchaseOrderFulfillmentCommandResult = {
  status: "confirmed" | "shipment_created" | "receipt_created";
  idempotent: boolean;
  purchase_order: SupplierPurchaseOrder;
  fulfillment: SupplierPurchaseOrderFulfillment;
  version: number;
};

type QueryResult = {
  data: unknown;
  error: unknown;
  count: number | null;
};
type SingleResult = { data: unknown; error: unknown };
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  limit: (value: number) => Query;
  maybeSingle: () => Promise<SingleResult>;
  then: Promise<QueryResult>["then"];
};
type Client = {
  from: (table: string) => Query;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<SingleResult>;
};

export class SupplierPurchaseFulfillmentsRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async getDetail(input: SupplierPurchaseOrderFulfillmentDetailInput) {
    const headerRequest = this.client
      .from("supplier_purchase_order_fulfillments")
      .select(SUPPLIER_PURCHASE_ORDER_FULFILLMENT_SELECT)
      .eq("tenant_id", input.tenant_id)
      .eq("supplier_purchase_order_id", input.order_id)
      .maybeSingle();
    const itemRequest = this.client
      .from("supplier_purchase_order_item_fulfillments")
      .select(SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT)
      .eq("tenant_id", input.tenant_id)
      .eq("supplier_purchase_order_id", input.order_id)
      .order("supplier_purchase_order_item_id", { ascending: true })
      .limit(100);

    const [headerResult, itemResult] = await Promise.all([
      headerRequest,
      itemRequest,
    ]);
    if (headerResult.error) {
      throw Errors.dbError("查询采购履约汇总失败", headerResult.error);
    }
    if (itemResult.error) {
      throw Errors.dbError("查询采购履约累计明细失败", itemResult.error);
    }

    const fulfillment = headerResult.data === null
      ? null
      : parse(
        SupplierPurchaseOrderFulfillmentSchema,
        headerResult.data,
        "查询采购履约汇总失败",
      );
    const itemFulfillments = parseRows(
      SupplierPurchaseOrderItemFulfillmentSchema,
      itemResult.data,
      "查询采购履约累计明细失败",
    );
    return parse(
      SupplierPurchaseOrderFulfillmentDetailSchema,
      {
        fulfillment,
        item_fulfillments: itemFulfillments,
      },
      "查询采购履约详情失败",
    );
  }

  async listShipments(input: SupplierPurchaseOrderFulfillmentEventListInput) {
    return this.listEvents(
      "supplier_purchase_order_shipments",
      SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT,
      SupplierPurchaseOrderShipmentSchema,
      "查询采购发货记录失败",
      input,
    );
  }

  async listReceipts(input: SupplierPurchaseOrderFulfillmentEventListInput) {
    return this.listEvents(
      "supplier_purchase_order_receipts",
      SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT,
      SupplierPurchaseOrderReceiptSchema,
      "查询采购收货记录失败",
      input,
    );
  }

  confirm(input: SupplierPurchaseOrderFulfillmentConfirmCommand) {
    return this.command(
      "confirm_supplier_purchase_order_fulfillment",
      {
        p_order_id: input.order_id,
        p_tenant_id: input.tenant_id,
        p_expected_order_version: input.expected_version,
        p_confirmed_at: input.confirmed_at,
        p_remark: input.remark ?? null,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
      "确认采购履约失败",
      "confirmed",
    );
  }

  createShipment(input: SupplierPurchaseOrderShipmentCreateCommand) {
    return this.command(
      "create_supplier_purchase_order_shipment",
      {
        p_shipment_id: input.id,
        p_order_id: input.order_id,
        p_tenant_id: input.tenant_id,
        p_expected_fulfillment_version: input.expected_fulfillment_version,
        p_shipment_no: input.shipment_no,
        p_shipped_at: input.shipped_at,
        p_carrier_name: input.carrier_name ?? null,
        p_tracking_no: input.tracking_no ?? null,
        p_remark: input.remark ?? null,
        p_items: input.items,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
      "创建采购发货记录失败",
      "shipment_created",
    );
  }

  createReceipt(input: SupplierPurchaseOrderReceiptCreateCommand) {
    return this.command(
      "create_supplier_purchase_order_receipt",
      {
        p_receipt_id: input.id,
        p_order_id: input.order_id,
        p_tenant_id: input.tenant_id,
        p_expected_fulfillment_version: input.expected_fulfillment_version,
        p_receipt_no: input.receipt_no,
        p_received_at: input.received_at,
        p_remark: input.remark ?? null,
        p_items: input.items,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
      "创建采购收货记录失败",
      "receipt_created",
    );
  }

  private async listEvents<T>(
    table: string,
    columns: string,
    schema: z.ZodType<T>,
    message: string,
    input: SupplierPurchaseOrderFulfillmentEventListInput,
  ): Promise<Page<T>> {
    const pagination = normalizePage(input);
    const { data, error, count } = await this.client.from(table)
      .select(columns, { count: "exact" })
      .eq("tenant_id", input.tenant_id)
      .eq("supplier_purchase_order_id", input.order_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError(message, error);
    return toPage(
      parseRows(schema, data, message),
      pagination,
      count,
    );
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
    successStatus: SupplierPurchaseOrderFulfillmentCommandResult["status"],
  ): Promise<SupplierPurchaseOrderFulfillmentCommandResult> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throwSupplierCommandDatabaseError(error, message);

    const envelope = parse(
      SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema,
      data,
      message,
    );
    if ("purchase_order" in envelope) {
      if (envelope.status !== successStatus) {
        throw Errors.dbError(message, data);
      }
      return envelope;
    }
    throw commandEnvelopeError(envelope);
  }
}

function normalizePage(input: PageInput) {
  const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
  const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0
    ? Math.min(input.pageSize, 100)
    : 20;
  return { page, pageSize };
}

function pageRange(input: PageInput): [number, number] {
  const start = (input.page - 1) * input.pageSize;
  return [start, start + input.pageSize - 1];
}

function commandEnvelopeError(
  envelope: Exclude<
    z.infer<typeof SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema>,
    { purchase_order: SupplierPurchaseOrder }
  >,
) {
  const mapped = envelope.error_code
    ? mapSupplierCommandDatabaseError(envelope.error_code)
    : null;
  if (mapped) return mapped;
  const code = envelope.error_code ??
    `SUPPLIER_PURCHASE_ORDER_FULFILLMENT_${envelope.status.toUpperCase()}`;
  const statusCode = envelope.status === "validation_error" ||
      envelope.status === "variance_reason_required"
    ? 400
    : envelope.status === "not_found"
    ? 404
    : 409;
  return Errors.business(
    statusCode,
    envelope.reason ?? "采购履约命令执行失败",
    code,
    envelope,
  );
}

function toPage<T>(
  list: T[],
  pagination: PageInput,
  count: number | null,
): Page<T> {
  const total = count ?? 0;
  return {
    list,
    pagination: {
      ...pagination,
      total,
      totalPages: total ? Math.ceil(total / pagination.pageSize) : 0,
    },
  };
}

function parseRows<T>(schema: z.ZodType<T>, data: unknown, message: string) {
  return parse(z.array(schema), data, message);
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export const supplierPurchaseFulfillmentsRepository =
  new SupplierPurchaseFulfillmentsRepository();
