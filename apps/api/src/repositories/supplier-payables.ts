import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupplierPayableStatusSchema } from "@/schema/supplier-payments";
import { SupabaseDB } from "@/utils/supabase";

type RpcResult = { data: unknown; error: unknown };
type Client = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};
type PageInput = { page: number; pageSize: number };

export type SupplierPayableListInput = PageInput & {
  tenant_id: string;
  project_id?: string;
  tenant_supplier_id?: string;
  purchase_order_id?: string;
  status?: z.infer<typeof SupplierPayableStatusSchema>;
  due_from?: string;
  due_to?: string;
};

const uuid = z.uuid();
const dateTime = z.iso.datetime({ offset: true });
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/);

const SupplierPayableListItemSchema = z.object({
  id: uuid,
  project_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  supplier_purchase_order_id: uuid,
  amount: money,
  paid_amount: money,
  reserved_amount: money,
  open_amount: money,
  currency: z.literal("CNY"),
  occurred_at: dateTime,
  due_at: dateTime,
  status: SupplierPayableStatusSchema,
}).strict();

const SupplierPayablePageSchema = z.object({
  items: z.array(SupplierPayableListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100),
}).strict();

const SupplierPurchaseOrderFinancialSummarySchema = z.object({
  purchase_order_id: uuid,
  accepted_amount: money,
  payable_amount: money,
  reserved_request_amount: money,
  paid_amount: money,
  open_amount: money,
  available_to_request_amount: money,
}).strict();

export type SupplierPayableListItem =
  z.infer<typeof SupplierPayableListItemSchema>;
export type SupplierPurchaseOrderFinancialSummary =
  z.infer<typeof SupplierPurchaseOrderFinancialSummarySchema>;

export class SupplierPayablesRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client(): Client {
    return this.clientProvider();
  }

  async list(input: SupplierPayableListInput) {
    const { data, error } = await this.client.rpc("list_supplier_payables", {
      p_tenant_id: input.tenant_id,
      p_project_id: input.project_id ?? null,
      p_tenant_supplier_id: input.tenant_supplier_id ?? null,
      p_purchase_order_id: input.purchase_order_id ?? null,
      p_status: input.status ?? null,
      p_due_from: input.due_from ?? null,
      p_due_to: input.due_to ?? null,
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    if (error) throw Errors.dbError("查询供应商应付失败", error);

    const result = parse(
      SupplierPayablePageSchema,
      data,
      "查询供应商应付失败",
    );
    return toPage(result.items, result);
  }

  async getPurchaseOrderSummary(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<SupplierPurchaseOrderFinancialSummary> {
    const { data, error } = await this.client.rpc(
      "get_supplier_purchase_order_financial_summary",
      {
        p_tenant_id: tenantId,
        p_supplier_purchase_order_id: purchaseOrderId,
      },
    );
    if (error) throw Errors.dbError("查询采购单财务摘要失败", error);
    return parse(
      SupplierPurchaseOrderFinancialSummarySchema,
      data,
      "查询采购单财务摘要失败",
    );
  }
}

function toPage<T>(
  list: T[],
  input: { page: number; page_size: number; total: number },
) {
  return {
    list,
    pagination: {
      page: input.page,
      pageSize: input.page_size,
      total: input.total,
      totalPages: input.total
        ? Math.ceil(input.total / input.page_size)
        : 0,
    },
  };
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export const supplierPayablesRepository = new SupplierPayablesRepository();
