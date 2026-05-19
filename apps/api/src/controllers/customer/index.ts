import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import {
  BatchAssignCustomerOwnerSchema,
  CreateCustomerSchema,
  CustomerListQuerySchema,
  UpdateCustomerSchema,
} from "@/schema/customer";
import {
  CustomerSourceListQuerySchema,
  CustomerSourceParamsSchema,
} from "@/schema/customer-sources";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type {
  BatchAssignCustomerOwnerInput,
  CreateCustomerSchemaType,
  FollowUpInsert,
  UpdateCustomerSchemaType,
} from "@/schema/customer";
import { PaginationQuerySchema } from "@/schema/request";
import {
  CreateCustomerPropertySchema,
  CustomerPropertyDetailParamsSchema,
  CustomerPropertyParamsSchema,
  UpdateCustomerPropertySchema,
} from "@/schema/properties";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { customerFollowUpCommentService } from "@/services/customer-follow-up-comments";
import {
  customerPhonePrivacyService,
  type CustomerPhoneAction,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import {
  customerSourceService,
  type CustomerSourceSummary,
} from "@/services/customer-sources";
import { ErrorCodes } from "@/errors/error-codes";
import { getAsiaShanghaiTodayRange } from "@/utils/date-ranges";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";

type CustomerPropertyPayload =
  | CreateCustomerSchemaType["property"]
  | UpdateCustomerSchemaType["property"];

type PrimaryPropertySummary = {
  id: string;
  community: string;
  building_info: string | null;
  layout: string | null;
  area: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
};

type NormalizedCustomerPropertyPayload = {
  community: string;
  building_info: string | null;
  area: number | null;
  layout: string | null;
};

type CustomerRowForResponse = {
  owner?: unknown;
  owner_id: string | null;
  id: string;
  property_id?: string | null;
  avatar?: string | null;
  source?: string | null;
  phone?: string | null;
  douyin_screenshot_images?: unknown;
};

type CustomerPropertySummary = PrimaryPropertySummary & {
  customer_id: string | null;
};

type SerializedPropertySummary = PrimaryPropertySummary & {
  is_primary: boolean;
};

type CustomerPropertySummaryBundle = {
  property_count: number;
  property_id: string | null;
  primary_property_id: string | null;
  primary_property: SerializedPropertySummary | null;
  property: SerializedPropertySummary | null;
  properties: SerializedPropertySummary[];
  community: string | null;
  building_info: string | null;
  layout: string | null;
  area: number | null;
};

type CustomerFollowUpSummary = {
  id: string;
  customer_id: string;
  content: string;
  next_follow_at: string | null;
  created_at: string;
  employee?: unknown;
  employee_id: string | null;
};

type CustomerFollowFilter = "due" | "overdue";

const CustomerPhoneActionBodySchema = z.object({
  scene: z.string().trim().max(80, "场景过长").optional(),
  reason: z.string().trim().max(200, "原因过长").optional(),
});

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

// 继承基类
class CustomerController extends TenantBaseController<
  typeof CreateCustomerSchema,
  typeof UpdateCustomerSchema
> {
  private propertySummarySelect = `
    id,
    community,
    building_info,
    layout,
    area,
    latitude,
    longitude,
    created_at
  `;

  private customerSelect = `
    *,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      phone
    )
  `;

  private followUpSelect = `
    *,
    employee:employees!customer_follow_ups_employee_id_fkey(
      id,
      name,
      phone,
      avatar
    )
  `;

  constructor() {
    super("customers", CreateCustomerSchema, UpdateCustomerSchema);
  }

  private normalizeOwner(owner: unknown) {
    if (Array.isArray(owner)) {
      return owner[0] ?? null;
    }

    return owner ?? null;
  }

  private isObjectWithOwnKey<T extends object, K extends PropertyKey>(
    value: T,
    key: K,
  ): value is T & Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  private normalizeStoredDouyinScreenshotImages(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private validateDouyinScreenshotImagesInput(value: unknown) {
    if (value === undefined) {
      return [] as string[];
    }

    if (!Array.isArray(value)) {
      throw Errors.business(
        400,
        "抖音截图格式不正确",
        ErrorCodes.DOUYIN_SCREENSHOT_INVALID,
      );
    }

    if (value.length > 1) {
      throw Errors.business(
        400,
        "抖音截图最多上传 1 张",
        ErrorCodes.DOUYIN_SCREENSHOT_LIMIT_EXCEEDED,
      );
    }

    const images = value.map((item) =>
      typeof item === "string" ? item.trim() : ""
    );
    if (images.some((item) => !item)) {
      throw Errors.business(
        400,
        "抖音截图格式不正确",
        ErrorCodes.DOUYIN_SCREENSHOT_INVALID,
      );
    }

    for (const image of images) {
      try {
        new URL(image);
      } catch {
        throw Errors.business(
          400,
          "抖音截图格式不正确",
          ErrorCodes.DOUYIN_SCREENSHOT_INVALID,
        );
      }
    }

    return images;
  }

  private assertDouyinScreenshotRequired(images: string[]) {
    if (images.length === 0) {
      throw Errors.business(
        400,
        "抖音来源客户请上传抖音截图",
        ErrorCodes.DOUYIN_SCREENSHOT_REQUIRED,
      );
    }
  }

  private serializeCustomer<T extends {
    id?: string;
    owner?: unknown;
    owner_id: string | null;
    avatar?: string | null;
    phone?: string | null;
    douyin_screenshot_images?: unknown;
  }>(
    row: T,
    phonePrivacyContext?: CustomerPhonePrivacyContext,
  ) {
    const owner = this.normalizeOwner(row.owner) as
      | { id: string; name: string | null; phone: string | null }
      | null;
    const phoneFields = row.id && phonePrivacyContext
      ? customerPhonePrivacyService.serializeCustomerPhoneFields(
        phonePrivacyContext,
        {
          id: row.id,
          owner_id: row.owner_id,
          phone: row.phone ?? null,
        },
      )
      : {
        phone: row.phone ?? null,
        phone_masked: customerPhonePrivacyService.maskPhone(row.phone),
        can_view_phone: false,
        can_call_phone: false,
        can_copy_phone: false,
      };

    return {
      ...row,
      ...phoneFields,
      avatar: resolveStoredFileUrl(row.avatar ?? null),
      owner,
      owner_name: owner?.name ?? null,
      douyin_screenshot_images: resolveStoredFileUrlList(
        row.douyin_screenshot_images,
      ),
    };
  }

  private splitCustomerPayload<T extends { property?: CustomerPropertyPayload }>(
    payload: T,
  ) {
    const { property, ...customerPayload } = payload;
    return {
      customerPayload,
      propertyPayload: this.normalizeCustomerPropertyPayload(property),
    };
  }

  private normalizeCustomerPropertyPayload(
    propertyPayload: CustomerPropertyPayload | undefined | null,
  ): NormalizedCustomerPropertyPayload | undefined {
    if (!propertyPayload) {
      return undefined;
    }

    const community = propertyPayload.community?.trim() || null;
    const buildingInfo = propertyPayload.building_info?.trim() || null;
    const layout = propertyPayload.layout?.trim() || null;
    const area = propertyPayload.area ?? null;

    if (!community && !buildingInfo && !layout && area == null) {
      return undefined;
    }

    if (!community) {
      throw Errors.badRequest("小区名称不能为空");
    }

    return {
      community,
      building_info: buildingInfo,
      layout,
      area,
    };
  }

  private async getAssignableTargetEmployee(
    ownerId: string,
    tenantId: string | null,
  ) {
    let query = SupabaseDB
      .getAdminClient()
      .from("employees")
      .select("id, name, department_id, tenant_department_id, status, tenant_id")
      .eq("id", ownerId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: targetEmployee, error: targetEmployeeError } = await query.maybeSingle();

    if (targetEmployeeError) {
      throw Errors.dbError("查询目标负责人失败", targetEmployeeError);
    }

    return targetEmployee;
  }

  private async getPrimaryCustomerPropertySummary(customerId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户主房产失败", error);
    }

    return ((data as unknown) as PrimaryPropertySummary | null) ?? null;
  }

  private serializePropertySummary(
    property: PrimaryPropertySummary,
    primaryPropertyId: string | null,
  ) {
    return {
      ...property,
      is_primary: property.id === primaryPropertyId,
    };
  }

  private normalizePropertySummary(
    property: CustomerPropertySummary,
  ): PrimaryPropertySummary {
    return {
      id: property.id,
      community: property.community,
      building_info: property.building_info,
      layout: property.layout,
      area: property.area,
      latitude: property.latitude,
      longitude: property.longitude,
      created_at: property.created_at,
    };
  }

  private async getCustomerPropertySummaryMap(customerIds: string[], tenantId?: string | null) {
    if (customerIds.length === 0) {
      return new Map<string, PrimaryPropertySummary[]>();
    }

    let query = SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect + ", customer_id")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询客户房产摘要失败", error);
    }

    const summaryMap = new Map<string, PrimaryPropertySummary[]>();
    for (const item of ((data || []) as unknown as CustomerPropertySummary[])) {
      if (!item.customer_id) {
        continue;
      }

      const summaries = summaryMap.get(item.customer_id) || [];
      summaries.push(this.normalizePropertySummary(item));
      summaryMap.set(item.customer_id, summaries);
    }

    return summaryMap;
  }

  private buildCustomerPropertySummaryBundle(
    customer: CustomerRowForResponse,
    propertyMap: Map<string, PrimaryPropertySummary[]>,
  ): CustomerPropertySummaryBundle {
    const properties = propertyMap.get(customer.id) || [];
    const preferredPropertyId = customer.property_id ?? null;
    const primaryProperty = properties.find((item) => item.id === preferredPropertyId)
      || properties[0]
      || null;
    const primaryPropertyId = primaryProperty?.id ?? null;
    const serializedProperties = properties.map((item) =>
      this.serializePropertySummary(item, primaryPropertyId)
    );
    const serializedPrimaryProperty = primaryProperty
      ? this.serializePropertySummary(primaryProperty, primaryPropertyId)
      : null;

    return {
      property_count: properties.length,
      property_id: primaryPropertyId,
      primary_property_id: primaryPropertyId,
      primary_property: serializedPrimaryProperty,
      property: serializedPrimaryProperty,
      properties: serializedProperties,
      community: primaryProperty?.community ?? null,
      building_info: primaryProperty?.building_info ?? null,
      layout: primaryProperty?.layout ?? null,
      area: primaryProperty?.area ?? null,
    };
  }

  private attachPropertySummary<T extends CustomerRowForResponse>(
    customer: T,
    propertyMap: Map<string, PrimaryPropertySummary[]>,
  ) {
    return {
      ...customer,
      ...this.buildCustomerPropertySummaryBundle(customer, propertyMap),
    };
  }

  private attachSourceSummary<T extends { id: string }>(
    customer: T,
    sourceSummaryMap: Map<string, CustomerSourceSummary>,
  ) {
    const summary = sourceSummaryMap.get(customer.id) || {
      total: 0,
      latest_source: null,
      source_tags: [],
      has_old_customer_new_lead: false,
      has_platform_new_lead: false,
      has_employee_share: false,
    };

    return {
      ...customer,
      source_summary: summary,
      latest_source: summary.latest_source,
      source_tags: summary.source_tags,
      has_old_customer_new_lead: summary.has_old_customer_new_lead,
      has_platform_new_lead: summary.has_platform_new_lead,
      has_employee_share: summary.has_employee_share,
    };
  }

  private async getRequiredCustomerRecord(
    authContext: AuthContext & { tenantId: string },
    customerId: string,
    message = "客户不存在",
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, property_id, tenant_id")
      .eq("id", customerId);

    query = query.eq("tenant_id", authContext.tenantId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    if (!data) {
      throw Errors.business(404, message, ErrorCodes.CUSTOMER_NOT_FOUND);
    }

    return data as {
      id: string;
      owner_id: string | null;
      property_id: string | null;
      tenant_id: string | null;
    };
  }

  private async getRequiredCustomerPropertyRecord(
    customerId: string,
    propertyId: string,
    tenantId?: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect + ", customer_id")
      .eq("id", propertyId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询房产失败", error);
    }

    if (!data) {
      throw Errors.business(404, "房产不存在", ErrorCodes.PROPERTY_NOT_FOUND);
    }

    if (((data as unknown) as { customer_id: string | null }).customer_id !== customerId) {
      throw Errors.business(
        400,
        "该房产不属于当前客户",
        ErrorCodes.PROPERTY_NOT_BELONG_TO_CUSTOMER,
      );
    }

    return (data as unknown) as PrimaryPropertySummary & { customer_id: string | null };
  }

  private async getCustomerPropertySummaries(customerId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询客户房产摘要失败", error);
    }

    return data || [];
  }

  private getFollowUpState(nextFollowAt: string | null | undefined) {
    if (!nextFollowAt) {
      return "none";
    }

    const nextTime = new Date(nextFollowAt).getTime();
    if (Number.isNaN(nextTime)) {
      return "none";
    }

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    if (nextTime < todayStart) {
      return "overdue";
    }

    if (nextTime <= now.getTime()) {
      return "due";
    }

    return "upcoming";
  }

  private matchesFollowFilter(
    summary: CustomerFollowUpSummary | undefined,
    followFilter: CustomerFollowFilter,
  ) {
    const state = this.getFollowUpState(summary?.next_follow_at);
    if (followFilter === "overdue") {
      return state === "overdue";
    }

    return state === "due" || state === "overdue";
  }

  private async getLatestFollowUpMap(customerIds: string[]) {
    if (customerIds.length === 0) {
      return new Map<string, CustomerFollowUpSummary>();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .select(this.followUpSelect)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户跟进摘要失败", error);
    }

    const summaryMap = new Map<string, CustomerFollowUpSummary>();
    for (const item of ((data || []) as unknown as CustomerFollowUpSummary[])) {
      if (!item.customer_id || summaryMap.has(item.customer_id)) {
        continue;
      }

      summaryMap.set(item.customer_id, item);
    }

    return summaryMap;
  }

  private attachFollowUpSummary<T extends CustomerRowForResponse>(
    customer: T,
    followUpMap: Map<string, CustomerFollowUpSummary>,
  ) {
    const latest = followUpMap.get(customer.id);
    const serialized = latest ? this.serializeFollowUp(latest) : null;

    return {
      ...customer,
      latest_follow_up: serialized,
      last_follow_at: latest?.created_at ?? null,
      next_follow_at: latest?.next_follow_at ?? null,
      follow_up_state: this.getFollowUpState(latest?.next_follow_at),
    };
  }

  private async upsertCustomerPrimaryProperty(
    customerId: string,
    propertyPayload: NormalizedCustomerPropertyPayload | undefined,
    tenantId?: string | null,
  ) {
    if (!propertyPayload) {
      return this.getPrimaryCustomerPropertySummary(customerId, tenantId);
    }

    const primaryProperty = await this.getPrimaryCustomerPropertySummary(
      customerId,
      tenantId,
    );

    if (primaryProperty?.id) {
      const { error } = await SupabaseDB.getAdminClient()
        .from("properties")
        .update(propertyPayload)
        .eq("id", primaryProperty.id)
        .eq("tenant_id", tenantId)
        .select("id");

      if (error) {
        throw Errors.dbError("更新客户主房产失败", error);
      }
    } else {
      const { error } = await SupabaseDB.getAdminClient()
        .from("properties")
        .insert({
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          ...propertyPayload,
        })
        .select("id");

      if (error) {
        throw Errors.dbError("创建客户主房产失败", error);
      }
    }

    return this.getPrimaryCustomerPropertySummary(customerId, tenantId);
  }

  private async buildCustomerDetailResponse(
    customer: CustomerRowForResponse,
    options?: {
      primaryProperty?: PrimaryPropertySummary | null;
      includeProperties?: boolean;
      phonePrivacyContext?: CustomerPhonePrivacyContext;
      tenantId?: string | null;
    },
  ) {
    const primaryProperty = options?.primaryProperty ?? await this.getPrimaryCustomerPropertySummary(
      customer.id,
      options?.tenantId,
    );
    const properties = options?.includeProperties
      ? await this.getCustomerPropertySummaries(customer.id, options?.tenantId)
      : undefined;
    const followUpMap = await this.getLatestFollowUpMap([customer.id]);
    const sourceSummaryMap = options?.phonePrivacyContext
      ? await customerSourceService.getCustomerSourceSummaryMap({
        authContext: options.phonePrivacyContext.authContext,
        customerIds: [customer.id],
      })
      : new Map<string, CustomerSourceSummary>();

    return {
      ...this.serializeCustomer(
        this.attachSourceSummary(
          this.attachFollowUpSummary(customer, followUpMap),
          sourceSummaryMap,
        ),
        options?.phonePrivacyContext,
      ),
      property_id: primaryProperty?.id ?? null,
      community: primaryProperty?.community ?? null,
      building_info: primaryProperty?.building_info ?? null,
      layout: primaryProperty?.layout ?? null,
      area: primaryProperty?.area ?? null,
      ...(options?.includeProperties
        ? {
          properties: (properties || []).map((item) =>
            this.serializePropertySummary(
              (item as unknown) as PrimaryPropertySummary,
              primaryProperty?.id ?? null,
            )
          ),
          property_count: (properties || []).length,
        }
        : {}),
    };
  }

  @Get("/customers/:customerId/properties")
  async listCustomerProperties(
    request: FastifyRequest<{ Params: { customerId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const customer = await this.getRequiredCustomerRecord(
      authContext,
      paramsResult.data.customerId,
    );
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const properties = await this.getCustomerPropertySummaries(
      customer.id,
      authContext.tenantId,
    );
    return ResponseHandler.success({
      list: properties.map((item) =>
        this.serializePropertySummary(
          (item as unknown) as PrimaryPropertySummary,
          customer.property_id,
        )
      ),
      primary_property_id: customer.property_id,
    });
  }

  @Post("/customers/:customerId/properties")
  async createCustomerProperty(
    request: FastifyRequest<{ Params: { customerId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = CreateCustomerPropertySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const customer = await this.getRequiredCustomerRecord(
      authContext,
      paramsResult.data.customerId,
    );
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const payload = bodyResult.data;
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .insert({
        id: randomUUID(),
        customer_id: customer.id,
        tenant_id: authContext.tenantId,
        community: payload.community,
        building_info: payload.building_info ?? null,
        area: payload.area ?? null,
        layout: payload.layout ?? null,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
      })
      .select(this.propertySummarySelect)
      .single();

    if (error) {
      throw Errors.dbError("创建客户房产失败", error);
    }

    const property = (data as unknown) as PrimaryPropertySummary;
    const shouldSetAsPrimary = !customer.property_id || payload.set_as_primary;

    if (shouldSetAsPrimary) {
      const { error: updateError } = await SupabaseDB.getAdminClient()
        .from("customers")
        .update({ property_id: property.id })
        .eq("id", customer.id)
        .eq("tenant_id", authContext.tenantId)
        .select("id");

      if (updateError) {
        throw Errors.dbError("设置主房产失败", updateError);
      }
    }

    return ResponseHandler.success(
      this.serializePropertySummary(
        property,
        shouldSetAsPrimary ? property.id : customer.property_id,
      ),
    );
  }

  @Post("/customers/:customerId/properties/:propertyId/primary")
  async setCustomerPrimaryProperty(
    request: FastifyRequest<{ Params: { customerId: string; propertyId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const customer = await this.getRequiredCustomerRecord(
      authContext,
      paramsResult.data.customerId,
    );
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    await this.getRequiredCustomerPropertyRecord(
      customer.id,
      paramsResult.data.propertyId,
      authContext.tenantId,
    );

    const { error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update({ property_id: paramsResult.data.propertyId })
      .eq("id", customer.id)
      .eq("tenant_id", authContext.tenantId)
      .select("id");

    if (error) {
      throw Errors.dbError("设置主房产失败", error);
    }

    return ResponseHandler.success({
      customer_id: customer.id,
      primary_property_id: paramsResult.data.propertyId,
    });
  }

  @Patch("/customers/:customerId/properties/:propertyId")
  async updateCustomerProperty(
    request: FastifyRequest<{ Params: { customerId: string; propertyId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateCustomerPropertySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const customer = await this.getRequiredCustomerRecord(
      authContext,
      paramsResult.data.customerId,
    );
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    await this.getRequiredCustomerPropertyRecord(
      customer.id,
      paramsResult.data.propertyId,
      authContext.tenantId,
    );

    const payload = bodyResult.data;
    if (Object.keys(payload).length === 0) {
      throw Errors.badRequest("至少需要提供一个待更新字段");
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .update({
        ...(payload.community !== undefined ? { community: payload.community } : {}),
        ...(payload.building_info !== undefined
          ? { building_info: payload.building_info ?? null }
          : {}),
        ...(payload.area !== undefined ? { area: payload.area ?? null } : {}),
        ...(payload.layout !== undefined ? { layout: payload.layout ?? null } : {}),
        ...(payload.latitude !== undefined
          ? { latitude: payload.latitude ?? null }
          : {}),
        ...(payload.longitude !== undefined
          ? { longitude: payload.longitude ?? null }
          : {}),
      })
      .eq("id", paramsResult.data.propertyId)
      .eq("tenant_id", authContext.tenantId)
      .select(this.propertySummarySelect)
      .single();

    if (error) {
      throw Errors.dbError("更新客户房产失败", error);
    }

    return ResponseHandler.success(
      this.serializePropertySummary(
        (data as unknown) as PrimaryPropertySummary,
        customer.property_id,
      ),
    );
  }

  private serializeFollowUp<T extends { employee?: unknown; employee_id: string | null }>(
    row: T,
  ) {
    const employee = this.normalizeOwner(row.employee) as
      | { id: string; name: string | null; phone: string | null; avatar?: string | null }
      | null;

    return {
      ...row,
      employee,
      employee_name: employee?.name ?? null,
    };
  }

  private applyCustomerListFilters(
    query: any,
    tenantId: string | null,
    visibleOwnerIds: string[] | null,
    status?: string,
    source?: string,
    customerOrigin?: string,
    keyword?: string,
    customerIds?: string[] | null,
  ) {
    let filteredQuery = query;

    if (tenantId) {
      filteredQuery = filteredQuery.eq("tenant_id", tenantId);
    }

    if (visibleOwnerIds !== null) {
      if (visibleOwnerIds.length === 0) {
        filteredQuery = filteredQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        filteredQuery = filteredQuery.in("owner_id", visibleOwnerIds);
      }
    }

    if (status) {
      filteredQuery = filteredQuery.eq("status", status);
    }

    if (source) {
      filteredQuery = filteredQuery.eq("source", source);
    }

    if (customerOrigin) {
      filteredQuery = filteredQuery.eq("customer_origin", customerOrigin);
    }

    if (keyword) {
      const escapedKeyword = escapeSupabaseOrValue(keyword);
      filteredQuery = filteredQuery.or(
        [
          `name.ilike.%${escapedKeyword}%`,
          `phone.ilike.%${escapedKeyword}%`,
          `source.ilike.%${escapedKeyword}%`,
        ].join(","),
      );
    }

    if (customerIds !== undefined && customerIds !== null) {
      if (customerIds.length === 0) {
        filteredQuery = filteredQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        filteredQuery = filteredQuery.in("id", customerIds);
      }
    }

    return filteredQuery;
  }

  private async getTodayWorkCustomerIds(tenantId: string | null) {
    const { startIso, endIso } = getAsiaShanghaiTodayRange();
    const ids = new Set<string>();

    const addCustomerRows = (rows: Array<{ id?: string | null }> | null) => {
      (rows || []).forEach((item) => {
        if (item.id) ids.add(item.id);
      });
    };
    const addFollowUpRows = (
      rows: Array<{ customer_id?: string | null }> | null,
    ) => {
      (rows || []).forEach((item) => {
        if (item.customer_id) ids.add(item.customer_id);
      });
    };

    const [
      createdCustomers,
      updatedCustomers,
      createdFollowUps,
      plannedFollowUps,
    ] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso),
      SupabaseDB.getAdminClient()
        .from("customer_follow_ups")
        .select("customer_id")
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      SupabaseDB.getAdminClient()
        .from("customer_follow_ups")
        .select("customer_id")
        .gte("next_follow_at", startIso)
        .lt("next_follow_at", endIso),
    ]);

    if (createdCustomers.error) {
      throw Errors.dbError("查询今日新增客户失败", createdCustomers.error);
    }
    if (updatedCustomers.error) {
      throw Errors.dbError("查询今日更新客户失败", updatedCustomers.error);
    }
    if (createdFollowUps.error) {
      throw Errors.dbError("查询今日客户跟进失败", createdFollowUps.error);
    }
    if (plannedFollowUps.error) {
      throw Errors.dbError("查询今日计划跟进失败", plannedFollowUps.error);
    }

    addCustomerRows(createdCustomers.data as Array<{ id: string }> | null);
    addCustomerRows(updatedCustomers.data as Array<{ id: string }> | null);
    addFollowUpRows(
      createdFollowUps.data as Array<{ customer_id: string | null }> | null,
    );
    addFollowUpRows(
      plannedFollowUps.data as Array<{ customer_id: string | null }> | null,
    );

    return Array.from(ids);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = CustomerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const {
      page,
      pageSize,
      status,
      source,
      customer_origin: customerOrigin,
      keyword,
      follow,
      work_scope: workScope,
    } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const visibleOwnerIds = await accessPolicyService.getVisibleCustomerOwnerIds(
      authContext,
      "customer.read",
    );

    const normalizedKeyword = keyword?.trim();
    const todayCustomerIds = workScope === "today"
      ? await this.getTodayWorkCustomerIds(authContext.tenantId)
      : null;
    if (follow) {
      let idQuery = SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .order("created_at", { ascending: false });
      idQuery = this.applyCustomerListFilters(
        idQuery,
        authContext.tenantId,
        visibleOwnerIds,
        status,
        source,
        customerOrigin,
        normalizedKeyword,
        todayCustomerIds,
      );
      const { data: idRows, error: idError } = await idQuery;
      if (idError) throw Errors.dbError("列表查询失败", idError);

      const customerIds = (((idRows || []) as unknown) as Array<{ id: string }>)
        .map((item) => item.id)
        .filter(Boolean);
      const followUpMap = await this.getLatestFollowUpMap(customerIds);
      const filteredCustomerIds = customerIds.filter((id) =>
        this.matchesFollowFilter(followUpMap.get(id), follow)
      );
      const total = filteredCustomerIds.length;
      const pageCustomerIds = filteredCustomerIds.slice(from, to + 1);

      if (pageCustomerIds.length === 0) {
        return ResponseHandler.success({
          list: [],
          pagination: buildPagination(page, pageSize, total),
        });
      }

      const { data, error } = await SupabaseDB.getAdminClient()
        .from("customers")
        .select(this.customerSelect)
        .in("id", pageCustomerIds);

      if (error) throw Errors.dbError("列表查询失败", error);

      const customerOrder = new Map(pageCustomerIds.map((id, index) => [id, index]));
      const rows = (((data || []) as unknown) as CustomerRowForResponse[])
        .sort((a, b) =>
          (customerOrder.get(a.id) ?? 0) - (customerOrder.get(b.id) ?? 0)
        );
      const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
        authContext,
      );
      const propertyMap = await this.getCustomerPropertySummaryMap(
        rows.map((item) => item.id),
        authContext.tenantId,
      );
      const sourceSummaryMap = await customerSourceService.getCustomerSourceSummaryMap({
        authContext,
        customerIds: rows.map((item) => item.id),
      });

      return ResponseHandler.success({
        list: rows.map((item) =>
          this.serializeCustomer(
            this.attachSourceSummary(
              this.attachPropertySummary(
                this.attachFollowUpSummary(item, followUpMap),
                propertyMap,
              ),
              sourceSummaryMap,
            ),
            phonePrivacyContext,
          )
        ),
        pagination: buildPagination(page, pageSize, total),
      });
    }

    let countQuery = SupabaseDB.getAdminClient()
      .from("customers")
      .select("id", { count: "exact", head: true });
    countQuery = this.applyCustomerListFilters(
      countQuery,
      authContext.tenantId,
      visibleOwnerIds,
      status,
      source,
      customerOrigin,
      normalizedKeyword,
      todayCustomerIds,
    );

    const { error: countError, count } = await countQuery;
    if (countError) throw Errors.dbError("列表查询失败", countError);

    const total = count ?? 0;
    if (from >= total) {
      return ResponseHandler.success({
        list: [],
        pagination: buildPagination(page, pageSize, total),
      });
    }

    let query = SupabaseDB.getAdminClient()
      .from("customers")
      .select(this.customerSelect)
      .order("created_at", { ascending: false });
    query = this.applyCustomerListFilters(
      query,
      authContext.tenantId,
      visibleOwnerIds,
      status,
      source,
      customerOrigin,
      normalizedKeyword,
      todayCustomerIds,
    );
    const { data, error } = await query.range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);
    const rows = (((data || []) as unknown) as CustomerRowForResponse[]);
    const followUpMap = await this.getLatestFollowUpMap(rows.map((item) => item.id));
    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );
    const propertyMap = await this.getCustomerPropertySummaryMap(
      rows.map((item) => item.id),
      authContext.tenantId,
    );
    const sourceSummaryMap = await customerSourceService.getCustomerSourceSummaryMap({
      authContext,
      customerIds: rows.map((item) => item.id),
    });
    return ResponseHandler.success({
      list: rows.map((item) =>
        this.serializeCustomer(
          this.attachSourceSummary(
            this.attachPropertySummary(
              this.attachFollowUpSummary(item, followUpMap),
              propertyMap,
            ),
            sourceSummaryMap,
          ),
          phonePrivacyContext,
        )
      ),
      pagination: buildPagination(page, pageSize, total),
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(this.customerSelect)
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    if (!data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (data as unknown) as { owner_id: string | null },
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(
        (data as unknown) as CustomerRowForResponse,
        {
          phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
            authContext,
          ),
          tenantId: authContext.tenantId,
        },
      ),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const scope = accessPolicyService.assertPermission(authContext, "customer.create");

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const douyinScreenshotImages = this.validateDouyinScreenshotImagesInput(
      customerPayload.douyin_screenshot_images,
    );
    const payload = {
      ...customerPayload,
      owner_id: customerPayload.owner_id ?? authContext.employeeId ?? null,
      tenant_id: authContext.tenantId,
      douyin_screenshot_images: customerPayload.source === "douyin"
        ? douyinScreenshotImages
        : [],
    };
    if (payload.source === "douyin") {
      this.assertDouyinScreenshotRequired(payload.douyin_screenshot_images);
    }

    if (
      scope !== "all" &&
      payload.owner_id &&
      payload.owner_id !== authContext.employeeId
    ) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .insert(payload)
      .select(this.customerSelect)
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    const customer = (data as unknown) as CustomerRowForResponse;
    const primaryProperty = await this.upsertCustomerPrimaryProperty(
      customer.id,
      propertyPayload,
      authContext.tenantId,
    );
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
        phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
          authContext,
        ),
        tenantId: authContext.tenantId,
      }),
    );
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const existing = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, source, douyin_screenshot_images, tenant_id")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (existing.error) {
      throw Errors.dbError("查询客户失败", existing.error);
    }

    if (!existing.data) {
      throw Errors.badRequest("客户不存在");
    }

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const payload = customerPayload;
    const sourceTouched = this.isObjectWithOwnKey(payload, "source");
    const screenshotTouched = this.isObjectWithOwnKey(
      payload,
      "douyin_screenshot_images",
    );
    const nextSource = sourceTouched
      ? payload.source ?? null
      : ((existing.data as { source?: string | null }).source ?? null);
    const nextDouyinScreenshotImages = screenshotTouched
      ? this.validateDouyinScreenshotImagesInput(
        payload.douyin_screenshot_images,
      )
      : this.normalizeStoredDouyinScreenshotImages(
        ((existing.data as unknown) as { douyin_screenshot_images?: unknown })
          .douyin_screenshot_images,
      );

    if (nextSource === "douyin") {
      if (sourceTouched || screenshotTouched) {
        this.assertDouyinScreenshotRequired(nextDouyinScreenshotImages);
      }

      if (screenshotTouched || nextDouyinScreenshotImages.length > 0) {
        payload.douyin_screenshot_images = nextDouyinScreenshotImages;
      }
    } else if (sourceTouched || screenshotTouched) {
      payload.douyin_screenshot_images = [];
    }

    const hasPropertyUpdate = propertyPayload !== undefined;
    const hasOwnerUpdate = payload.owner_id !== undefined;
    const ownerChanged = hasOwnerUpdate && payload.owner_id !== existing.data.owner_id;
    const hasNonOwnerUpdates = Object.keys(payload).some((key) => key !== "owner_id");

    if (hasNonOwnerUpdates || hasPropertyUpdate) {
      const canAccess = await accessPolicyService.canAccessCustomer(
        authContext,
        (existing.data as unknown) as { owner_id: string | null },
        "customer.update",
      );
      if (!canAccess) {
        throw Errors.forbidden();
      }
    }

    if (ownerChanged) {
      if (!payload.owner_id) {
        throw Errors.badRequest("目标负责人不能为空");
      }

      const { data: targetEmployee, error: targetEmployeeError } = await SupabaseDB
        .getAdminClient()
        .from("employees")
        .select("id, department_id, tenant_department_id, status, tenant_id")
        .eq("id", payload.owner_id)
        .eq("tenant_id", authContext.tenantId)
        .maybeSingle();

      if (targetEmployeeError) {
        throw Errors.dbError("查询目标负责人失败", targetEmployeeError);
      }

      if (!targetEmployee) {
        throw Errors.badRequest("目标负责人不存在或不可用");
      }

      const canAssign = await accessPolicyService.canAssignCustomerOwner(
        authContext,
        (existing.data as unknown) as { owner_id: string | null },
        targetEmployee,
      );
      if (!canAssign) {
        throw Errors.forbidden();
      }
    }

    let customer: CustomerRowForResponse | null = null;

    if (Object.keys(payload).length > 0) {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("customers")
        .update(payload)
        .eq("id", idVerify.data.id)
        .select(this.customerSelect)
        .single();

      if (error) throw Errors.dbError("更新失败", error);
      customer = (data as unknown) as CustomerRowForResponse;
    } else {
      const current = await SupabaseDB.getAdminClient()
        .from("customers")
        .select(this.customerSelect)
        .eq("id", idVerify.data.id)
        .maybeSingle();

      if (current.error) throw Errors.dbError("查询客户失败", current.error);
      if (!current.data) throw Errors.badRequest("客户不存在");
      customer = (current.data as unknown) as CustomerRowForResponse;
    }

    const primaryProperty = await this.upsertCustomerPrimaryProperty(
      customer.id,
      propertyPayload,
      authContext.tenantId,
    );
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
        phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
          authContext,
        ),
        tenantId: authContext.tenantId,
      }),
    );
  };

  @Delete("/customers/:id")
  async deleteCustomer(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const existing = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (existing.error) {
      throw Errors.dbError("查询客户失败", existing.error);
    }

    if (!existing.data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (existing.data as unknown) as { owner_id: string | null },
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update({ status: "invalid" })
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .select(this.customerSelect)
      .single();

    if (error) throw Errors.dbError("作废客户失败", error);
    return ResponseHandler.success(
      this.serializeCustomer(
        (data as unknown) as CustomerRowForResponse,
        await customerPhonePrivacyService.createPrivacyContext(authContext),
      ),
    );
  }

  @Post("/customers/assign-owner/batch")
  async batchAssignOwner(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    if (!accessPolicyService.hasPermission(authContext, "customer.assign_owner")) {
      throw Errors.business(403, "无权批量分配客户负责人", "FORBIDDEN");
    }

    const result = BatchAssignCustomerOwnerSchema.safeParse(request.body);
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const payload: BatchAssignCustomerOwnerInput = result.data;
    const targetEmployee = await this.getAssignableTargetEmployee(
      payload.owner_id,
      authContext.tenantId,
    );

    if (!targetEmployee) {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    if (targetEmployee.status !== "active") {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    if (!accessPolicyService.canAssignCustomerOwnerTarget(authContext, targetEmployee)) {
      throw Errors.badRequest("目标负责人不在你的可分配范围内");
    }

    const customerIds = Array.from(new Set(payload.customer_ids));
    const { data: customers, error: customerQueryError } = await SupabaseDB
      .getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id")
      .in("id", customerIds)
      .eq("tenant_id", authContext.tenantId);

    if (customerQueryError) {
      throw Errors.dbError("查询客户失败", customerQueryError);
    }

    const customerMap = new Map(
      (((customers || []) as Array<{ id: string; owner_id: string | null }>)).map((item) => [
        item.id,
        item,
      ]),
    );

    const failedItems: Array<{
      customer_id: string;
      reason:
        | "out_of_scope"
        | "customer_not_found"
        | "customer_already_assigned"
        | "target_owner_not_found"
        | "target_owner_inactive"
        | "target_owner_out_of_scope";
      message: string;
    }> = [];
    const successCustomerIds: string[] = [];

    for (const customerId of customerIds) {
      const customer = customerMap.get(customerId);
      if (!customer) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_not_found",
          message: "客户不存在",
        });
        continue;
      }

      const canAssign = await accessPolicyService.canAssignCustomerOwner(
        authContext,
        customer,
        targetEmployee,
      );
      if (!canAssign) {
        failedItems.push({
          customer_id: customerId,
          reason: "out_of_scope",
          message: "当前客户不在你的可分配范围内",
        });
        continue;
      }

      if (
        payload.mode === "only_unassigned" &&
        customer.owner_id &&
        customer.owner_id !== payload.owner_id
      ) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_already_assigned",
          message: "当前客户已分配负责人",
        });
        continue;
      }

      if (customer.owner_id === payload.owner_id) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_already_assigned",
          message: "当前客户已分配给该负责人",
        });
        continue;
      }

      successCustomerIds.push(customerId);
    }

    if (successCustomerIds.length > 0) {
      const { error: updateError } = await SupabaseDB.getAdminClient()
        .from("customers")
        .update({ owner_id: payload.owner_id })
        .in("id", successCustomerIds)
        .eq("tenant_id", authContext.tenantId)
        .select("id");

      if (updateError) {
        throw Errors.dbError("批量分配负责人失败", updateError);
      }
    }

    return ResponseHandler.success({
      success_count: successCustomerIds.length,
      failed_count: failedItems.length,
      target_owner: {
        id: targetEmployee.id,
        name: targetEmployee.name ?? null,
      },
      failed_items: failedItems,
    });
  }

  @Get("/customers/:id/detail")
  async getCustomerById(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const { id } = request.params; // ← 这里拿到 UUID
    const { data, error } = await SupabaseDB.getAdminClient().from("customers").select(this.customerSelect).eq(
      "id",
      id,
    ).eq("tenant_id", authContext.tenantId).maybeSingle();

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }
    if (!data) {
      throw Errors.notFound("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (data as unknown) as { owner_id: string | null },
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(
        (data as unknown) as CustomerRowForResponse,
        {
          includeProperties: true,
          phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
            authContext,
          ),
          tenantId: authContext.tenantId,
        },
      ),
    );
  }

  private async handleCustomerPhoneAction(
    request: FastifyRequest<{ Params: { id: string } }>,
    action: CustomerPhoneAction,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CustomerPhoneActionBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerPhonePrivacyService.handlePhoneAction({
      action,
      authContext,
      customerId: idVerify.data.id,
      scene: bodyResult.data.scene,
      reason: bodyResult.data.reason,
      request,
    });

    return ResponseHandler.success(data);
  }

  @Post("/customers/:id/phone/reveal")
  async revealCustomerPhone(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return this.handleCustomerPhoneAction(request, "reveal");
  }

  @Post("/customers/:id/phone/call")
  async callCustomerPhone(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return this.handleCustomerPhoneAction(request, "call");
  }

  @Post("/customers/:id/phone/copy")
  async copyCustomerPhone(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return this.handleCustomerPhoneAction(request, "copy");
  }

  @Get("/customers/:id/sources")
  async listCustomerSources(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerSourceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = CustomerSourceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerSourceService.listCustomerSources({
      authContext,
      customerId: paramsResult.data.id,
      query: queryResult.data,
    });

    return ResponseHandler.success(data);
  }

  @Get("/customers/:id/follow_ups")
  async getCustomerFollowUpById(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const { id } = request.params; // ← 这里拿到 UUID
    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const customer = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (customer.error) {
      throw Errors.dbError("查询客户失败", customer.error);
    }

    if (!customer.data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (customer.data as unknown) as { owner_id: string | null },
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient().from("customer_follow_ups")
      .select(this.followUpSelect, { count: "exact" }).eq(
        "customer_id",
        id,
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }

    return ResponseHandler.success({
      list: await customerFollowUpCommentService.enrichFollowUpsWithCommentSummaries(
        authContext,
        customer.data,
        (((data || []) as unknown) as Array<{
          id: string;
          employee?: unknown;
          employee_id: string | null;
        }>).map((item) => this.serializeFollowUp(item)),
      ),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Post("/customers/:id/follow_ups")
  async createCustomerFollowUpById(
    request: FastifyRequest<{
      Params: { id: string };
      Body: FollowUpInsert;
    }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const { id } = request.params;
    const customer = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (customer.error) {
      throw Errors.dbError("查询客户失败", customer.error);
    }

    if (!customer.data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer.data,
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const followUpData = request.body;
    const followUpPayload = {
      ...followUpData,
      employee_id: followUpData.employee_id ?? authContext.employeeId ?? null,
      customer_id: id,
    };

    const scope = accessPolicyService.getScope(authContext, "customer.update");
    if (
      followUpPayload.employee_id &&
      followUpPayload.employee_id !== authContext.employeeId
    ) {
      if (scope !== "all") {
        throw Errors.forbidden();
      }

      const targetEmployee = await this.getAssignableTargetEmployee(
        followUpPayload.employee_id,
        authContext.tenantId,
      );
      if (!targetEmployee || targetEmployee.status !== "active") {
        throw Errors.badRequest("跟进员工不存在或不可用");
      }
    }

    const { data, error } = await SupabaseDB.getAdminClient().from("customer_follow_ups")
      .insert({
        ...followUpPayload,
      })
      .select(this.followUpSelect)
      .single();

    if (error) {
      throw Errors.dbError("create follow up data error", error);
    }
    return ResponseHandler.success(
      this.serializeFollowUp((data as unknown) as {
        employee?: unknown;
        employee_id: string | null;
      }),
    );
  }
}

export default new CustomerController(); // 导出实例
