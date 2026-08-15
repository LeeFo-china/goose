import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import {
  type PlatformSupplierCreateCommand, type PlatformSupplierLifecycleCommand,
  type PlatformSupplierListQuery, type PlatformSupplierUpdateCommand,
  type PlatformTenantSupplierSettingsCommand,
  type SupplierAddressWrite, type SupplierChildPageQuery,
  type SupplierContactWrite, type SupplierEventPageQuery,
  type SupplierQualificationCreateRecord, type SupplierQualificationReviewCommand,
  type SupplierQualificationTypeCreateRecord, type SupplierQualificationTypeListQuery,
  type SupplierQualificationTypeUpdateRecord, type SupplierQualificationUpdateRecord,
  type SupplierServiceRegionWrite,
} from "@/schema/platform-suppliers";
import type {
  SupplierAddressCreateCommand, SupplierContactCreateCommand,
  SupplierQualificationCreateCommand, SupplierQualificationTypeCreateCommand,
  SupplierServiceRegionCreateCommand,
} from "@/schema/supplier-create-commands";
import { SupabaseDB } from "@/utils/supabase";
import {
  AddressSchema,
  ContactSchema,
  EventSchema,
  QualificationSchema,
  QualificationTypeSchema,
  RegionSchema,
  SettingsSchema,
  SupplierDetailSchema,
  SupplierListRowSchema,
  type PlatformSupplierDetail,
  type PlatformSupplierListItem,
  type SupplierAddress,
  type SupplierContact,
  type SupplierEvent,
  type SupplierQualification,
  type SupplierQualificationType,
  type SupplierServiceRegion,
  type TenantSupplierSettings,
} from "./platform-supplier-records";
import {
  executeCreateCommand,
  rpcCommandContext as commandContext,
} from "./supplier-create-command-rpc";
import type {
  AddressCreateResult, ContactCreateResult, QualificationCreateResult,
  QualificationTypeCreateResult, ServiceRegionCreateResult,
} from "./platform-supplier-create-results";
import {
  compactRecord as compact,
  normalizePage,
  pageRange as range,
  parseRecord as parse,
  sanitizeKeyword,
  toPage,
} from "./supplier-repository-utils";
import { throwSupplierCommandDatabaseError } from "./supplier-command-errors";
const CORE_SELECT = "id,code,name,legal_name,unified_social_credit_code,supplier_type,onboarding_status,operational_status,version,created_at,updated_at";
const LIST_SELECT = `${CORE_SELECT},qualification_health`;
const DETAIL_SELECT = `${CORE_SELECT},legal_representative_name,registered_address_text,review_remark,reviewed_by_employee_id,reviewed_at,blacklisted_by_employee_id,blacklisted_at,blacklist_reason,created_by_employee_id,updated_by_employee_id`;
const TYPE_SELECT = "id,code,name,applicable_supplier_types,warning_days,is_required,blocks_new_orders,status,sort_order,version,created_at,updated_at";
const QUALIFICATION_SELECT = "id,supplier_id,qualification_type_id,document_file_id,certificate_no,valid_from,valid_until,verification_status,verified_by_employee_id,verified_at,rejection_reason,version,created_by_employee_id,updated_by_employee_id,created_at,updated_at";
const REGION_SELECT = "id,supplier_id,region_code,region_level,status,valid_from,valid_until,version,created_by_employee_id,updated_by_employee_id,created_at,updated_at";
const ADDRESS_SELECT = "id,supplier_id,address_type,province,city,district,region_code,address_detail,longitude,latitude,is_default,status,version,created_by_employee_id,updated_by_employee_id,created_at,updated_at";
const CONTACT_SELECT = "id,supplier_id,contact_type,name,phone,email,is_public,is_primary,status,version,created_by_employee_id,updated_by_employee_id,created_at,updated_at";
const EVENT_SELECT = "id,tenant_id,resource_type,resource_id,command,from_state,to_state,reason,actor_user_id,actor_employee_id,idempotency_key,result_version,created_at";
const SETTINGS_SELECT = "tenant_id,module_enabled,require_active_contract_for_new_order,ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,procurement_snapshot_v1_enabled,enabled_by_employee_id,enabled_at,version,created_at,updated_at";
const mutationStatus = z.object({
  status: z.enum([
    "created", "updated", "supplier_not_found", "state_conflict",
    "version_conflict", "idempotency_conflict",
  ]),
  error_code: z.string().optional(), reason: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
}).passthrough();
export type {
  PlatformSupplierDetail, PlatformSupplierListItem, SupplierAddress,
  SupplierContact, SupplierEvent, SupplierQualification,
  SupplierQualificationType, SupplierServiceRegion, TenantSupplierSettings,
} from "./platform-supplier-records";
export type TenantSupplierSettingsMutation = {
  status: "updated"; idempotent: boolean; setting: TenantSupplierSettings;
  previous_setting: TenantSupplierSettings | null; version: number;
};
export type Page<T> = { list: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
export type PlatformSupplierPage = Page<PlatformSupplierListItem>; export type SupplierQualificationTypePage = Page<SupplierQualificationType>;
export type SupplierQualificationPage = Page<SupplierQualification>; export type SupplierServiceRegionPage = Page<SupplierServiceRegion>;
export type SupplierAddressPage = Page<SupplierAddress>; export type SupplierContactPage = Page<SupplierContact>;
export type SupplierEventPage = Page<SupplierEvent>;
export type SupplierMutationResult =
  | { status: "created" | "updated"; idempotent: boolean;
    supplier?: PlatformSupplierDetail; previous_supplier?: PlatformSupplierDetail;
    qualification?: SupplierQualification; previous_qualification?: SupplierQualification;
    version: number }
  | { status: "supplier_not_found" | "state_conflict" | "version_conflict" | "idempotency_conflict"; error_code?: string; reason?: string; version?: number };
export interface PlatformSuppliersRepositoryPort {
  listSuppliers(query: PlatformSupplierListQuery): Promise<PlatformSupplierPage>; findSupplierById(id: string): Promise<PlatformSupplierDetail | null>;
  listQualificationTypes(query: SupplierQualificationTypeListQuery): Promise<SupplierQualificationTypePage>;
  findQualificationTypeById(id: string): Promise<SupplierQualificationType | null>;
  createQualificationType(input: SupplierQualificationTypeCreateCommand): Promise<QualificationTypeCreateResult>; updateQualificationType(input: SupplierQualificationTypeUpdateRecord): Promise<SupplierQualificationType>;
  createSupplier(input: PlatformSupplierCreateCommand): Promise<SupplierMutationResult>; updateSupplier(input: PlatformSupplierUpdateCommand): Promise<SupplierMutationResult>;
  mutateSupplier(input: PlatformSupplierLifecycleCommand): Promise<SupplierMutationResult>;
  listQualifications(input: SupplierChildPageQuery): Promise<SupplierQualificationPage>; createQualification(input: SupplierQualificationCreateCommand): Promise<QualificationCreateResult>;
  findQualificationByIdForSupplier(supplierId: string, id: string): Promise<SupplierQualification | null>;
  updateQualification(input: SupplierQualificationUpdateRecord): Promise<SupplierQualification>;
  reviewQualification(input: SupplierQualificationReviewCommand): Promise<SupplierMutationResult>;
  listServiceRegions(input: SupplierChildPageQuery): Promise<SupplierServiceRegionPage>; findServiceRegionByIdForSupplier(supplierId: string, id: string): Promise<SupplierServiceRegion | null>; createServiceRegion(input: SupplierServiceRegionCreateCommand): Promise<ServiceRegionCreateResult>; upsertServiceRegion(input: SupplierServiceRegionWrite): Promise<SupplierServiceRegion>;
  listAddresses(input: SupplierChildPageQuery): Promise<SupplierAddressPage>; findAddressByIdForSupplier(supplierId: string, id: string): Promise<SupplierAddress | null>; createAddress(input: SupplierAddressCreateCommand): Promise<AddressCreateResult>; upsertAddress(input: SupplierAddressWrite): Promise<SupplierAddress>;
  listContacts(input: SupplierChildPageQuery): Promise<SupplierContactPage>; findContactByIdForSupplier(supplierId: string, id: string): Promise<SupplierContact | null>; createContact(input: SupplierContactCreateCommand): Promise<ContactCreateResult>; upsertContact(input: SupplierContactWrite): Promise<SupplierContact>;
  listEvents(input: SupplierEventPageQuery): Promise<SupplierEventPage>;
  getTenantSupplierSettings(tenantId: string): Promise<TenantSupplierSettings | null>; setTenantSupplierSettings(input: PlatformTenantSupplierSettingsCommand): Promise<TenantSupplierSettingsMutation>;
}
type Result = { data: unknown; error: unknown; count: number | null };
type Query = {
  select: (...args: unknown[]) => Query; insert: (value: Record<string, unknown>) => Query;
  update: (value: Record<string, unknown>) => Query; eq: (column: string, value: unknown) => Query;
  is: (column: string, value: null) => Query; or: (filter: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query; range: (start: number, end: number) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>; then: Promise<Result>["then"];
};
type Client = { from: (table: string) => Query; rpc: (name: string, params: Record<string, unknown>) => Query };
export class PlatformSuppliersRepository implements PlatformSuppliersRepositoryPort {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}
  private get client() { return this.clientProvider(); }
  async listSuppliers(input: PlatformSupplierListQuery): Promise<PlatformSupplierPage> {
    const pagination = normalizePage(input);
    const { start, end } = range(pagination);
    let request = this.client.from("platform_supplier_directory")
      .select(LIST_SELECT, { count: "exact" });
    if (input.supplier_type) request = request.eq("supplier_type", input.supplier_type);
    if (input.onboarding_status) request = request.eq("onboarding_status", input.onboarding_status);
    if (input.operational_status) request = request.eq("operational_status", input.operational_status);
    const keyword = sanitizeKeyword(input.keyword);
    if (keyword) {
      request = request.or([
        "code", "name", "legal_name", "unified_social_credit_code",
      ].map((column) => `${column}.ilike.%${keyword}%`).join(","));
    }
    if (input.qualification_health) {
      request = request.eq("qualification_health", input.qualification_health);
    }
    const { data, error, count } = await request
      .order("updated_at", { ascending: false }).order("id", { ascending: false })
      .range(start, end);
    if (error) throw Errors.dbError("查询平台供应商列表失败", error);
    return toPage(parse(z.array(SupplierListRowSchema), data ?? [],
      "查询平台供应商列表失败"), pagination, count);
  }
  async findSupplierById(id: string) {
    const { data, error } = await this.client.from("suppliers")
      .select(DETAIL_SELECT).eq("id", id).eq("ownership_scope", "platform")
      .is("owner_tenant_id", null).maybeSingle();
    if (error) throw Errors.dbError("查询平台供应商详情失败", error);
    return data === null ? null : parse(SupplierDetailSchema, data, "查询平台供应商详情失败");
  }
  async listQualificationTypes(input: SupplierQualificationTypeListQuery) {
    const pagination = normalizePage(input);
    const { start, end } = range(pagination);
    let request = this.client.from("supplier_qualification_types")
      .select(TYPE_SELECT, { count: "exact" });
    if (input.status) request = request.eq("status", input.status);
    const keyword = sanitizeKeyword(input.keyword);
    const filters = [input.supplier_type
      ? `applicable_supplier_types.eq.{},applicable_supplier_types.cs.{${input.supplier_type}}` : "",
    keyword ? `code.ilike.%${keyword}%,name.ilike.%${keyword}%` : ""].filter(Boolean);
    if (filters.length) request = request.or(filters.length === 1
      ? filters[0]! : `and(${filters.map((filter) => `or(${filter})`).join(",")})`);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true }).order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询供应商资质类型失败", error);
    return toPage(parse(z.array(QualificationTypeSchema), data ?? [],
      "查询供应商资质类型失败"), pagination, count);
  }
  async findQualificationTypeById(id: string) {
    const { data, error } = await this.client.from("supplier_qualification_types")
      .select(TYPE_SELECT).eq("id", id).maybeSingle();
    if (error) throw Errors.dbError("查询供应商资质类型失败", error);
    return data === null ? null : parse(QualificationTypeSchema, data,
      "查询供应商资质类型失败");
  }
  createQualificationType(input: SupplierQualificationTypeCreateCommand) {
    return executeCreateCommand({
      client: this.client, functionName: "create_supplier_qualification_type",
      resourceKey: "qualification_type", resourceSchema: QualificationTypeSchema,
      message: "新增供应商资质类型失败",
      params: {
        p_qualification_type_id: input.qualification_type_id,
        p_code: input.code, p_name: input.name,
        p_applicable_supplier_types: input.applicable_supplier_types,
        p_warning_days: input.warning_days, p_is_required: input.is_required,
        p_blocks_new_orders: input.blocks_new_orders, p_status: input.status,
        p_sort_order: input.sort_order, ...commandContext(input),
      },
    });
  }
  updateQualificationType(input: SupplierQualificationTypeUpdateRecord) {
    const { qualification_type_id, expected_version, ...patch } = input;
    return this.updateRow("supplier_qualification_types", TYPE_SELECT,
      qualification_type_id, expected_version, patch, QualificationTypeSchema,
      "更新供应商资质类型失败");
  }
  createSupplier(input: PlatformSupplierCreateCommand) {
    return this.supplierRpc("create_platform_supplier", {
      p_supplier_id: input.supplier_id, p_code: input.code, p_name: input.name,
      p_legal_name: input.legal_name, p_supplier_type: input.supplier_type,
      p_unified_social_credit_code: input.unified_social_credit_code ?? null,
      p_expected_version: 0, p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "新增平台供应商失败");
  }
  async updateSupplier(input: PlatformSupplierUpdateCommand): Promise<SupplierMutationResult> {
    const { supplier_id, expected_version, updated_by_employee_id, ...fields } = input;
    const patch = compact({ ...fields, updated_by_employee_id,
      version: expected_version + 1 });
    const { data, error } = await this.client.from("suppliers").update(patch)
      .eq("id", supplier_id).eq("version", expected_version)
      .eq("ownership_scope", "platform").is("owner_tenant_id", null)
      .select(DETAIL_SELECT).maybeSingle();
    if (error) throw Errors.dbError("更新平台供应商失败", error);
    if (data === null) {
      return await this.findSupplierById(supplier_id)
        ? { status: "version_conflict", error_code: "SUPPLIER_VERSION_CONFLICT" }
        : { status: "supplier_not_found", error_code: "SUPPLIER_NOT_FOUND" };
    }
    const supplier = parse(SupplierDetailSchema, data, "更新平台供应商失败");
    return { status: "updated", idempotent: false, supplier, version: supplier.version };
  }
  mutateSupplier(input: PlatformSupplierLifecycleCommand) {
    return this.supplierRpc("mutate_platform_supplier_guarded", {
      p_supplier_id: input.supplier_id, p_action: input.action,
      p_expected_version: input.expected_version, p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id, p_reason: input.reason ?? null,
      p_idempotency_key: input.idempotency_key,
    }, "变更平台供应商状态失败");
  }
  listQualifications(input: SupplierChildPageQuery) {
    return this.listChild("supplier_qualifications", QUALIFICATION_SELECT,
      QualificationSchema, input, [
        ["qualification_type_id", true], ["verification_status", true],
        ["valid_until", false], ["id", true],
      ], "查询供应商资质失败");
  }
  async findQualificationByIdForSupplier(supplierId: string, id: string) {
    return this.findChild("supplier_qualifications", QUALIFICATION_SELECT,
      QualificationSchema, supplierId, id, "查询供应商资质失败");
  }
  createQualification(input: SupplierQualificationCreateCommand) {
    return executeCreateCommand({
      client: this.client, functionName: "create_supplier_qualification_guarded",
      resourceKey: "qualification", resourceSchema: QualificationSchema,
      message: "新增供应商资质失败",
      params: {
        p_qualification_id: input.qualification_id,
        p_supplier_id: input.supplier_id,
        p_qualification_type_id: input.qualification_type_id,
        p_document_file_id: input.document_file_id,
        p_certificate_no: input.certificate_no ?? null,
        p_valid_from: input.valid_from ?? null,
        p_valid_until: input.valid_until ?? null, ...commandContext(input),
      },
    });
  }
  updateQualification(input: SupplierQualificationUpdateRecord) {
    const { qualification_id, supplier_id, expected_version, ...patch } = input;
    return this.updateRow("supplier_qualifications", QUALIFICATION_SELECT,
      qualification_id, expected_version, patch, QualificationSchema,
      "更新供应商资质失败", supplier_id);
  }
  reviewQualification(input: SupplierQualificationReviewCommand) {
    return this.supplierRpc("review_supplier_qualification_guarded", {
      p_supplier_id: input.supplier_id, p_qualification_id: input.qualification_id,
      p_verification_status: input.verification_status,
      p_expected_version: input.expected_version, p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key, p_reason: input.reason ?? null,
    }, "核验供应商资质失败");
  }
  listServiceRegions(input: SupplierChildPageQuery) {
    return this.listChild("supplier_service_regions", REGION_SELECT, RegionSchema,
      input, [["region_code", true], ["id", true]], "查询供应商服务区域失败");
  }
  findServiceRegionByIdForSupplier(supplierId: string, id: string) {
    return this.findChild("supplier_service_regions", REGION_SELECT,
      RegionSchema, supplierId, id, "查询供应商服务区域失败");
  }
  createServiceRegion(input: SupplierServiceRegionCreateCommand) {
    return executeCreateCommand({
      client: this.client, functionName: "create_supplier_service_region_guarded",
      resourceKey: "service_region", resourceSchema: RegionSchema,
      message: "新增供应商服务区域失败",
      params: {
        p_region_id: input.region_id, p_supplier_id: input.supplier_id,
        p_region_code: input.region_code, p_region_level: input.region_level,
        p_status: input.status, p_valid_from: input.valid_from ?? null,
        p_valid_until: input.valid_until ?? null, ...commandContext(input),
      },
    });
  }
  upsertServiceRegion(input: SupplierServiceRegionWrite) {
    if (!("region_id" in input)) {
      throw Errors.badRequest("创建供应商服务区域必须使用幂等命令");
    }
    const { region_id, supplier_id, expected_version, ...patch } = input;
    return this.updateRow("supplier_service_regions", REGION_SELECT, region_id,
      expected_version, patch, RegionSchema, "更新供应商服务区域失败", supplier_id);
  }
  listAddresses(input: SupplierChildPageQuery) {
    return this.listChild("supplier_addresses", ADDRESS_SELECT, AddressSchema,
      input, [["address_type", true], ["status", true], ["is_default", false],
        ["id", true]], "查询供应商地址失败");
  }
  findAddressByIdForSupplier(supplierId: string, id: string) {
    return this.findChild("supplier_addresses", ADDRESS_SELECT,
      AddressSchema, supplierId, id, "查询供应商地址失败");
  }
  createAddress(input: SupplierAddressCreateCommand) {
    return executeCreateCommand({
      client: this.client, functionName: "create_supplier_address_guarded",
      resourceKey: "address", resourceSchema: AddressSchema,
      message: "新增供应商地址失败",
      params: {
        p_address_id: input.address_id, p_supplier_id: input.supplier_id,
        p_address_type: input.address_type, p_province: input.province ?? null,
        p_city: input.city ?? null, p_district: input.district ?? null,
        p_region_code: input.region_code, p_address_detail: input.address_detail,
        p_longitude: input.longitude ?? null, p_latitude: input.latitude ?? null,
        p_is_default: input.is_default, p_status: input.status,
        ...commandContext(input),
      },
    });
  }
  upsertAddress(input: SupplierAddressWrite) {
    if (!("address_id" in input)) {
      throw Errors.badRequest("创建供应商地址必须使用幂等命令");
    }
    const { address_id, supplier_id, expected_version, ...patch } = input;
    return this.updateRow("supplier_addresses", ADDRESS_SELECT, address_id,
      expected_version, patch, AddressSchema, "更新供应商地址失败", supplier_id);
  }
  listContacts(input: SupplierChildPageQuery) {
    return this.listChild("supplier_contacts", CONTACT_SELECT, ContactSchema,
      input, [["contact_type", true], ["is_primary", false], ["id", true]],
      "查询供应商联系人失败");
  }
  findContactByIdForSupplier(supplierId: string, id: string) {
    return this.findChild("supplier_contacts", CONTACT_SELECT,
      ContactSchema, supplierId, id, "查询供应商联系人失败");
  }
  createContact(input: SupplierContactCreateCommand) {
    return executeCreateCommand({
      client: this.client, functionName: "create_supplier_contact_guarded",
      resourceKey: "contact", resourceSchema: ContactSchema,
      message: "新增供应商联系人失败",
      params: {
        p_contact_id: input.contact_id, p_supplier_id: input.supplier_id,
        p_contact_type: input.contact_type, p_name: input.name,
        p_phone: input.phone ?? null, p_email: input.email ?? null,
        p_is_public: input.is_public, p_is_primary: input.is_primary,
        p_status: input.status, ...commandContext(input),
      },
    });
  }
  upsertContact(input: SupplierContactWrite) {
    if (!("contact_id" in input)) {
      throw Errors.badRequest("创建供应商联系人必须使用幂等命令");
    }
    const { contact_id, supplier_id, expected_version, ...patch } = input;
    return this.updateRow("supplier_contacts", CONTACT_SELECT, contact_id,
      expected_version, patch, ContactSchema, "更新供应商联系人失败", supplier_id);
  }
  async listEvents(input: SupplierEventPageQuery) {
    await this.assertPlatformSupplier(input.supplier_id);
    const pagination = normalizePage(input);
    const { start, end } = range(pagination);
    let request = this.client.from("supplier_command_events")
      .select(EVENT_SELECT, { count: "exact" }).eq("resource_type", "supplier")
      .eq("resource_id", input.supplier_id);
    if (input.command) request = request.eq("command", input.command);
    const { data, error, count } = await request
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(start, end);
    if (error) throw Errors.dbError("查询供应商事件失败", error);
    return toPage(parse(z.array(EventSchema), data ?? [], "查询供应商事件失败"),
      pagination, count);
  }
  async getTenantSupplierSettings(tenantId: string) {
    const { data, error } = await this.client.from("tenant_supplier_settings")
      .select(SETTINGS_SELECT).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw Errors.dbError("查询租户供应商设置失败", error);
    return data === null ? null : parse(SettingsSchema, data, "查询租户供应商设置失败");
  }
  async setTenantSupplierSettings(input: PlatformTenantSupplierSettingsCommand) {
    const data = await this.rpc("set_tenant_supplier_rollout_settings", {
      p_tenant_id: input.tenant_id, p_module_enabled: input.module_enabled,
      p_require_active_contract_for_new_order: input.require_active_contract_for_new_order,
      p_ownership_reads_enabled: input.ownership_reads_enabled,
      p_private_supplier_writes_enabled: input.private_supplier_writes_enabled,
      p_private_catalog_writes_enabled: input.private_catalog_writes_enabled,
      p_procurement_snapshot_v1_enabled: input.procurement_snapshot_v1_enabled,
      p_expected_version: input.expected_version, p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
      p_reason: input.reason ?? null,
    }, "更新租户供应商设置失败");
    const envelope = parse(mutationStatus, data, "更新租户供应商设置失败");
    if (envelope.status !== "updated") throw mutationError(envelope);
    const success = parse(z.object({
      status: z.literal("updated"), idempotent: z.boolean(),
      setting: SettingsSchema,
      previous_setting: z.union([
        SettingsSchema, z.object({}).strict().transform(() => null),
      ]),
      version: z.number().int().positive(),
    }).strict(), data, "更新租户供应商设置失败");
    return success;
  }
  private async listChild<T>(
    table: string, select: string, schema: z.ZodType<T>,
    input: SupplierChildPageQuery,
    orders: ReadonlyArray<readonly [string, boolean]>, message: string,
  ): Promise<Page<T>> {
    await this.assertPlatformSupplier(input.supplier_id);
    const pagination = normalizePage(input);
    const { start, end } = range(pagination);
    let request = this.client.from(table).select(select, { count: "exact" })
      .eq("supplier_id", input.supplier_id);
    for (const [column, ascending] of orders) request = request.order(column, { ascending });
    const { data, error, count } = await request.range(start, end);
    if (error) throw Errors.dbError(message, error);
    return toPage(parse(z.array(schema), data ?? [], message), pagination, count);
  }
  private async findChild<T>(table: string, select: string, schema: z.ZodType<T>,
    supplierId: string, id: string, message: string): Promise<T | null> {
    await this.assertPlatformSupplier(supplierId);
    const { data, error } = await this.client.from(table).select(select)
      .eq("supplier_id", supplierId).eq("id", id).maybeSingle();
    if (error) throw Errors.dbError(message, error);
    return data === null ? null : parse(schema, data, message);
  }
  private async updateRow<T>(
    table: string, select: string, id: string, expectedVersion: number,
    patch: object, schema: z.ZodType<T>, message: string, supplierId?: string,
  ): Promise<T> {
    if (supplierId) await this.assertPlatformSupplier(supplierId);
    let request = this.client.from(table)
      .update(compact({ ...patch, version: expectedVersion + 1 })).eq("id", id);
    if (supplierId) request = request.eq("supplier_id", supplierId);
    const { data, error } = await request.eq("version", expectedVersion)
      .select(select).maybeSingle();
    if (error) throw Errors.dbError(message, error);
    if (data === null) throw Errors.business(409, "数据版本已变化，请刷新后重试",
      "SUPPLIER_VERSION_CONFLICT");
    return parse(schema, data, message);
  }
  private async supplierRpc(
    name: string, params: Record<string, unknown>, message: string,
  ): Promise<SupplierMutationResult> {
    const data = await this.rpc(name, params, message);
    const envelope = parse(mutationStatus, data, message);
    if (envelope.status !== "created" && envelope.status !== "updated") {
      return {
        status: envelope.status, error_code: envelope.error_code,
        reason: envelope.reason, version: envelope.version,
      };
    }
    const success = parse(z.object({
      status: z.enum(["created", "updated"]),
      idempotent: z.boolean(),
      supplier: SupplierDetailSchema.optional(),
      previous_supplier: SupplierDetailSchema.optional(),
      qualification: QualificationSchema.optional(),
      previous_qualification: QualificationSchema.optional(),
      version: z.number().int().positive(),
    }).strict(), data, message);
    return success;
  }
  private async rpc(name: string, params: Record<string, unknown>, message: string) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throwSupplierCommandDatabaseError(error, message);
    return data;
  }
  private async assertPlatformSupplier(supplierId: string) {
    if (await this.findSupplierById(supplierId)) return;
    throw Errors.business(404, "平台供应商不存在", "SUPPLIER_NOT_FOUND");
  }
}
function mutationError(input: z.infer<typeof mutationStatus>) {
  const code = input.error_code ?? (input.status === "supplier_not_found"
    ? "SUPPLIER_NOT_FOUND" : input.status === "version_conflict"
    ? "SUPPLIER_VERSION_CONFLICT" : input.status === "idempotency_conflict"
      ? "SUPPLIER_IDEMPOTENCY_CONFLICT" : "SUPPLIER_STATE_CONFLICT");
  return Errors.business(input.status === "supplier_not_found" ? 404 : 409,
    "供应商状态或版本已变化，请刷新后重试", code, input);
}
export const platformSuppliersRepository = new PlatformSuppliersRepository();
