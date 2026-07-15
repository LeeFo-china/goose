import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { TenantServiceProviderProfileStatusSchema } from "@/schema/tenant-onboarding";
import { SupabaseDB } from "@/utils/supabase";

const PROFILE_SELECT = [
  "id", "tenant_id", "public_name", "introduction", "public_phone",
  "address_province", "address_city", "address_district",
  "address_region_code", "address", "address_latitude", "address_longitude",
  "status", "version", "submitted_at", "reviewed_by_employee_id",
  "reviewed_at", "review_remark", "published_at", "suspended_at",
  "created_at", "updated_at",
].join(",");
const AREA_SELECT = [
  "id", "tenant_id", "province", "city", "district", "adcode",
  "center_latitude", "center_longitude", "service_radius_km", "priority",
  "status", "created_at", "updated_at",
].join(",");

const NullableString = z.string().nullable();
const ProfileSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid(), public_name: NullableString,
  introduction: NullableString, public_phone: NullableString,
  address_province: NullableString, address_city: NullableString,
  address_district: NullableString, address_region_code: NullableString,
  address: NullableString, address_latitude: z.number().nullable(),
  address_longitude: z.number().nullable(),
  status: TenantServiceProviderProfileStatusSchema,
  version: z.number().int().positive(), submitted_at: NullableString,
  reviewed_by_employee_id: z.uuid().nullable(), reviewed_at: NullableString,
  review_remark: NullableString, published_at: NullableString,
  suspended_at: NullableString, created_at: z.string(), updated_at: z.string(),
}).strict();
const AreaSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid(), province: NullableString,
  city: z.string(), district: NullableString, adcode: z.string(),
  center_latitude: z.number().nullable(), center_longitude: z.number().nullable(),
  service_radius_km: z.union([z.number(), z.string()]).nullable()
    .transform((value) => value === null ? null : Number(value)),
  priority: z.number().int(), status: z.enum(["active", "inactive"]),
  created_at: z.string(), updated_at: z.string(),
}).strict();
const QueueSchema = z.object({
  tenant_id: z.uuid(), tenant_name: z.string(), public_name: NullableString,
  public_phone: NullableString, address_city: NullableString,
  address_district: NullableString, status: TenantServiceProviderProfileStatusSchema,
  version: z.number().int().positive(), submitted_at: NullableString,
  updated_at: z.string(), area_count: z.coerce.number().int().nonnegative(),
}).strict();
const VisitorProviderSchema = z.object({
  tenant_id: z.uuid(), public_name: z.string(), introduction: NullableString,
  public_phone: z.string(), address_province: NullableString,
  address_city: NullableString, address_district: NullableString,
  address_region_code: NullableString, address: NullableString,
  address_latitude: z.number().nullable(), address_longitude: z.number().nullable(),
  matched_region_code: z.string(),
}).strict();
const RegionPathSchema = z.object({
  service_code: z.string(), adcode: z.string(), name: z.string(),
  level: z.string(), depth: z.number().int().positive(),
}).strict();

export type TenantServiceProviderProfile = z.infer<typeof ProfileSchema>;
export type TenantServiceProviderArea = z.infer<typeof AreaSchema>;
export type TenantServiceProviderMutation =
  | { status: "updated"; profile: TenantServiceProviderProfile; area?: TenantServiceProviderArea }
  | { status: "not_found" | "version_conflict" | "state_conflict" | "validation_failed" };

type Page<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type Query = {
  select: (...args: unknown[]) => Query;
  eq: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  range: (...args: unknown[]) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown; error: unknown; count: number | null;
  }>["then"];
};
type Client = {
  from: (table: string) => Query;
  rpc: (
    name: string,
    params: Record<string, unknown>,
    options?: { count?: "exact"; head?: boolean },
  ) => Query;
};

export class TenantServiceProvidersRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async getTenantProfile(tenantId: string) {
    const { data, error } = await this.client.from("tenant_service_provider_profiles")
      .select(PROFILE_SELECT).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw Errors.dbError("查询服务商公开资料失败", error);
    return data === null ? null : parse(ProfileSchema, data, "查询服务商公开资料失败");
  }

  updateTenantProfile(input: { tenantId: string; expectedVersion: number; patch: object }) {
    return this.mutate("update_tenant_service_provider_profile", {
      p_tenant_id: input.tenantId,
      p_expected_version: input.expectedVersion,
      p_patch: input.patch,
    }, "更新服务商公开资料失败");
  }

  async listTenantAreas(input: { tenantId: string; page: number; pageSize: number }) {
    const { start, end } = range(input.page, input.pageSize);
    const { data, error, count } = await this.client.from("tenant_service_areas")
      .select(AREA_SELECT, { count: "exact" }).eq("tenant_id", input.tenantId)
      .order("priority", { ascending: false }).order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询服务商区域失败", error);
    return page(parse(z.array(AreaSchema), data ?? [], "查询服务商区域失败"), input, count);
  }

  createTenantArea(input: { tenantId: string; expectedProfileVersion: number; input: object }) {
    return this.mutate("upsert_tenant_service_provider_area", {
      p_tenant_id: input.tenantId, p_area_id: null,
      p_expected_profile_version: input.expectedProfileVersion, p_area: input.input,
    }, "新增服务商区域失败");
  }

  updateTenantArea(input: {
    tenantId: string; areaId: string; expectedProfileVersion: number; input: object;
  }) {
    return this.mutate("upsert_tenant_service_provider_area", {
      p_tenant_id: input.tenantId, p_area_id: input.areaId,
      p_expected_profile_version: input.expectedProfileVersion, p_area: input.input,
    }, "更新服务商区域失败");
  }

  submitTenantProfile(input: { tenantId: string; expectedVersion: number }) {
    return this.mutate("submit_tenant_service_provider_profile", {
      p_tenant_id: input.tenantId, p_expected_version: input.expectedVersion,
    }, "提交服务商公开资料失败");
  }

  async listPlatformPublicationQueue(input: {
    page: number; pageSize: number; status?: string; keyword?: string;
  }) {
    const { start } = range(input.page, input.pageSize);
    const { data, error, count } = await this.client.rpc(
      "list_tenant_service_provider_publications",
      { p_status: input.status ?? null, p_keyword: input.keyword ?? null },
      { count: "exact" },
    ).range(start, start + input.pageSize - 1);
    if (error) throw Errors.dbError("查询服务商发布队列失败", error);
    const rows = parse(z.array(QueueSchema), data ?? [], "查询服务商发布队列失败");
    return page(rows, input, count);
  }

  getPlatformPublicationDetail(tenantId: string) {
    return this.getTenantProfile(tenantId);
  }

  listPlatformPublicationAreas(input: { tenantId: string; page: number; pageSize: number }) {
    return this.listTenantAreas(input);
  }

  publishProfile(input: DecisionInput) {
    return this.decision("publish_tenant_service_provider", input, "发布服务商失败");
  }
  returnProfileToDraft(input: DecisionInput) {
    return this.decision("return_tenant_service_provider_to_draft", input, "退回服务商资料失败");
  }
  suspendProfile(input: DecisionInput) {
    return this.decision("suspend_tenant_service_provider", input, "暂停服务商展示失败");
  }

  async resolveActiveRegionCodes(adcode: string) {
    const { data, error } = await this.client.rpc(
      "resolve_tenant_onboarding_region_paths",
      { p_service_region_codes: [adcode] },
    );
    if (error) throw Errors.dbError("解析访客定位区域失败", error);
    const rows = parse(z.array(RegionPathSchema), data ?? [], "解析访客定位区域失败");
    return [...new Set(rows.map((row) => row.adcode))].slice(0, 3);
  }

  async listVisitorProviders(input: {
    regionCodes: string[]; page: number; pageSize: number;
  }) {
    const { start } = range(input.page, input.pageSize);
    const { data, error, count } = await this.client.rpc(
      "list_visitor_local_service_providers",
      { p_region_codes: input.regionCodes },
      { count: "exact" },
    ).range(start, start + input.pageSize - 1);
    if (error) throw Errors.dbError("查询本地服务商失败", error);
    const rows = parse(z.array(VisitorProviderSchema), data ?? [], "查询本地服务商失败");
    return page(rows, input, count);
  }

  private decision(name: string, input: DecisionInput, message: string) {
    return this.mutate(name, {
      p_tenant_id: input.tenantId, p_expected_version: input.expectedVersion,
      p_reviewer_employee_id: input.reviewerEmployeeId,
      p_review_remark: input.reviewRemark,
    }, message);
  }

  private async mutate(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throw Errors.dbError(message, error);
    return parseMutation(data, message);
  }
}

type DecisionInput = {
  tenantId: string; expectedVersion: number; reviewerEmployeeId: string;
  reviewRemark: string;
};

function parseMutation(data: unknown, message: string): TenantServiceProviderMutation {
  const status = z.object({ status: z.string() }).passthrough().safeParse(data);
  if (!status.success) throw Errors.dbError(message, status.error.issues);
  if (status.data.status === "updated") {
    const result = z.object({
      status: z.literal("updated"), profile: ProfileSchema, area: AreaSchema.optional(),
    }).strict().safeParse(data);
    if (!result.success) throw Errors.dbError(message, result.error.issues);
    return result.data;
  }
  if (["not_found", "version_conflict", "state_conflict", "validation_failed"]
    .includes(status.data.status)) {
    return { status: status.data.status } as TenantServiceProviderMutation;
  }
  throw Errors.dbError(message, { message: `unknown mutation status: ${status.data.status}` });
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

function range(pageValue: number, pageSizeValue: number) {
  const page = Math.max(1, Math.trunc(pageValue));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(pageSizeValue)));
  const start = (page - 1) * pageSize;
  return { start, end: start + pageSize - 1 };
}

function page<T>(list: T[], input: { page: number; pageSize: number }, count: number | null): Page<T> {
  const total = count ?? 0;
  return { list, pagination: {
    page: input.page, pageSize: input.pageSize, total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  } };
}

export const tenantServiceProvidersRepository = new TenantServiceProvidersRepository();
