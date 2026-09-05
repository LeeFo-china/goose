import { WAREHOUSE_STATUS_VALUES, type WarehouseStatus } from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const WAREHOUSE_SELECT = [
  "id",
  "tenant_id",
  "warehouse_code",
  "name",
  "address",
  "contact_name",
  "contact_phone",
  "manager_employee_id",
  "is_default",
  "status",
  "version",
  "created_at",
  "updated_at",
].join(",");

const WarehouseRecordSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  warehouse_code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  manager_employee_id: z.uuid().nullable(),
  is_default: z.boolean(),
  status: z.enum(WAREHOUSE_STATUS_VALUES),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

type QueryResult = {
  data: unknown;
  error: unknown;
  count: number | null;
};
type SingleResult = { data: unknown; error: unknown };
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  or: (filter: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
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
type PageInput = { page: number; pageSize: number };

export type WarehouseRecord = z.infer<typeof WarehouseRecordSchema>;
export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
export type WarehousePage = Page<WarehouseRecord>;
export type WarehouseListInput = PageInput & {
  tenant_id: string;
  keyword?: string;
  status?: WarehouseStatus;
};
export type WarehouseCreateCommand = {
  warehouse_id: string;
  tenant_id: string;
  name: string;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  manager_employee_id?: string | null;
  is_default: boolean;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};
export type WarehouseUpdateCommand = {
  warehouse_id: string;
  tenant_id: string;
  expected_version: number;
  name?: string;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  manager_employee_id?: string | null;
  is_default?: boolean;
  status?: WarehouseStatus;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

export class WarehousesRepository {
  constructor(
    private readonly clientOrProvider: Client | (() => Client) = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client(): Client {
    return typeof this.clientOrProvider === "function"
      ? this.clientOrProvider()
      : this.clientOrProvider;
  }

  async list(input: WarehouseListInput): Promise<WarehousePage> {
    const pagination = normalizePage(input);
    let request = this.client.from("warehouses")
      .select(WAREHOUSE_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenant_id);
    if (input.status) request = request.eq("status", input.status);
    request = applyKeyword(request, input.keyword);

    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询仓库失败", error);
    return toPage(
      parseRows(WarehouseRecordSchema, data, "查询仓库失败"),
      pagination,
      count,
    );
  }

  async findById(
    tenantId: string,
    warehouseId: string,
  ): Promise<WarehouseRecord | null> {
    const { data, error } = await this.client
      .from("warehouses")
      .select(WAREHOUSE_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", warehouseId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询仓库失败", error);
    if (data === null) return null;
    return parse(WarehouseRecordSchema, data, "查询仓库失败");
  }

  async create(input: WarehouseCreateCommand): Promise<WarehouseRecord> {
    const { data, error } = await this.client.rpc("create_tenant_warehouse", {
      p_warehouse_id: input.warehouse_id,
      p_tenant_id: input.tenant_id,
      p_name: input.name,
      p_address: input.address ?? null,
      p_contact_name: input.contact_name ?? null,
      p_contact_phone: input.contact_phone ?? null,
      p_manager_employee_id: input.manager_employee_id ?? null,
      p_is_default: input.is_default,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    });
    if (error) throw Errors.dbError("创建仓库失败", error);
    return parseWarehouseRecord(data, "创建仓库失败");
  }

  async update(input: WarehouseUpdateCommand): Promise<WarehouseRecord> {
    const { data, error } = await this.client.rpc("update_tenant_warehouse", {
      p_warehouse_id: input.warehouse_id,
      p_tenant_id: input.tenant_id,
      p_expected_version: input.expected_version,
      p_name: input.name ?? null,
      p_address: input.address ?? null,
      p_address_set: isSubmitted(input.address),
      p_contact_name: input.contact_name ?? null,
      p_contact_name_set: isSubmitted(input.contact_name),
      p_contact_phone: input.contact_phone ?? null,
      p_contact_phone_set: isSubmitted(input.contact_phone),
      p_manager_employee_id: input.manager_employee_id ?? null,
      p_manager_employee_id_set: isSubmitted(input.manager_employee_id),
      p_is_default: input.is_default ?? null,
      p_status: input.status ?? null,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    });
    if (error) throw Errors.dbError("更新仓库失败", error);
    return parseWarehouseRecord(data, "更新仓库失败");
  }
}

export const warehousesRepository = new WarehousesRepository();

function normalizePage(input: PageInput): PageInput {
  return {
    page: input.page > 0 ? input.page : 1,
    pageSize: Math.min(Math.max(input.pageSize, 1), 100),
  };
}

function pageRange(input: PageInput): [number, number] {
  const start = (input.page - 1) * input.pageSize;
  return [start, start + input.pageSize - 1];
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

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

function parseRows<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T[] {
  return parse(z.array(schema), data ?? [], message);
}

function applyKeyword(request: Query, keyword?: string): Query {
  const pattern = buildIlikePattern(keyword?.trim() ?? "");
  return pattern
    ? request.or([
      `warehouse_code.ilike.${quotePostgrestValue(pattern)}`,
      `name.ilike.${quotePostgrestValue(pattern)}`,
      `contact_name.ilike.${quotePostgrestValue(pattern)}`,
      `contact_phone.ilike.${quotePostgrestValue(pattern)}`,
    ].join(","))
    : request;
}

function parseWarehouseRecord(data: unknown, message: string): WarehouseRecord {
  if (typeof data !== "object" || data === null) {
    return parse(WarehouseRecordSchema, data, message);
  }
  const row = data as Record<string, unknown>;
  return parse(WarehouseRecordSchema, {
    id: row.id,
    tenant_id: row.tenant_id,
    warehouse_code: row.warehouse_code,
    name: row.name,
    address: row.address,
    contact_name: row.contact_name,
    contact_phone: row.contact_phone,
    manager_employee_id: row.manager_employee_id,
    is_default: row.is_default,
    status: row.status,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }, message);
}

function isSubmitted(value: unknown): boolean {
  return value !== undefined;
}

function buildIlikePattern(value: string): string {
  if (!value) return "";
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
