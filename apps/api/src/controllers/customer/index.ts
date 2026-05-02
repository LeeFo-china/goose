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
import { BaseController } from "@/controllers/BaseController";
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
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { customerFollowUpCommentService } from "@/services/customer-follow-up-comments";
import {
  customerPhonePrivacyService,
  type CustomerPhoneAction,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import { ErrorCodes } from "@/errors/error-codes";

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
  source?: string | null;
  phone?: string | null;
  douyin_screenshot_images?: unknown;
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
class CustomerController extends BaseController<
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

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
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
      owner,
      owner_name: owner?.name ?? null,
      douyin_screenshot_images: this.normalizeStoredDouyinScreenshotImages(
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
  ) {
    const { data: targetEmployee, error: targetEmployeeError } = await SupabaseDB
      .getAdminClient()
      .from("employees")
      .select("id, name, department_id, status")
      .eq("id", ownerId)
      .maybeSingle();

    if (targetEmployeeError) {
      throw Errors.dbError("查询目标负责人失败", targetEmployeeError);
    }

    return targetEmployee;
  }

  private async getPrimaryCustomerPropertySummary(customerId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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

  private async getRequiredCustomerRecord(
    customerId: string,
    message = "客户不存在",
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, property_id")
      .eq("id", customerId)
      .maybeSingle();

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
    };
  }

  private async getRequiredCustomerPropertyRecord(
    customerId: string,
    propertyId: string,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect + ", customer_id")
      .eq("id", propertyId)
      .maybeSingle();

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

  private async getCustomerPropertySummaries(customerId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

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
  ) {
    if (!propertyPayload) {
      return this.getPrimaryCustomerPropertySummary(customerId);
    }

    const primaryProperty = await this.getPrimaryCustomerPropertySummary(customerId);

    if (primaryProperty?.id) {
      const { error } = await SupabaseDB.getAdminClient()
        .from("properties")
        .update(propertyPayload)
        .eq("id", primaryProperty.id);

      if (error) {
        throw Errors.dbError("更新客户主房产失败", error);
      }
    } else {
      const { error } = await SupabaseDB.getAdminClient()
        .from("properties")
        .insert({
          id: randomUUID(),
          customer_id: customerId,
          ...propertyPayload,
        });

      if (error) {
        throw Errors.dbError("创建客户主房产失败", error);
      }
    }

    return this.getPrimaryCustomerPropertySummary(customerId);
  }

  private async buildCustomerDetailResponse(
    customer: CustomerRowForResponse,
    options?: {
      primaryProperty?: PrimaryPropertySummary | null;
      includeProperties?: boolean;
      phonePrivacyContext?: CustomerPhonePrivacyContext;
    },
  ) {
    const primaryProperty = options?.primaryProperty ?? await this.getPrimaryCustomerPropertySummary(
      customer.id,
    );
    const properties = options?.includeProperties
      ? await this.getCustomerPropertySummaries(customer.id)
      : undefined;
    const followUpMap = await this.getLatestFollowUpMap([customer.id]);

    return {
      ...this.serializeCustomer(
        this.attachFollowUpSummary(customer, followUpMap),
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
    const authContext = await this.getRequiredAuthContext(request);
    const paramsResult = CustomerPropertyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const customer = await this.getRequiredCustomerRecord(paramsResult.data.customerId);
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const properties = await this.getCustomerPropertySummaries(customer.id);
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
    const authContext = await this.getRequiredAuthContext(request);
    const paramsResult = CustomerPropertyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = CreateCustomerPropertySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const customer = await this.getRequiredCustomerRecord(paramsResult.data.customerId);
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
        .eq("id", customer.id);

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
    const authContext = await this.getRequiredAuthContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const customer = await this.getRequiredCustomerRecord(paramsResult.data.customerId);
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
    );

    const { error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update({ property_id: paramsResult.data.propertyId })
      .eq("id", customer.id);

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
    const authContext = await this.getRequiredAuthContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateCustomerPropertySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const customer = await this.getRequiredCustomerRecord(paramsResult.data.customerId);
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
    visibleOwnerIds: string[] | null,
    status?: string,
    keyword?: string,
  ) {
    let filteredQuery = query;

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

    return filteredQuery;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const queryResult = CustomerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, status, keyword, follow } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const visibleOwnerIds = await accessPolicyService.getVisibleCustomerOwnerIds(
      authContext,
      "customer.read",
    );

    const normalizedKeyword = keyword?.trim();
    if (follow) {
      let idQuery = SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .order("created_at", { ascending: false });
      idQuery = this.applyCustomerListFilters(
        idQuery,
        visibleOwnerIds,
        status,
        normalizedKeyword,
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

      return ResponseHandler.success({
        list: rows.map((item) =>
          this.serializeCustomer(
            this.attachFollowUpSummary(item, followUpMap),
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
      visibleOwnerIds,
      status,
      normalizedKeyword,
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
      visibleOwnerIds,
      status,
      normalizedKeyword,
    );
    const { data, error } = await query.range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);
    const rows = (((data || []) as unknown) as CustomerRowForResponse[]);
    const followUpMap = await this.getLatestFollowUpMap(rows.map((item) => item.id));
    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );
    return ResponseHandler.success({
      list: rows.map((item) =>
        this.serializeCustomer(
          this.attachFollowUpSummary(item, followUpMap),
          phonePrivacyContext,
        )
      ),
      pagination: buildPagination(page, pageSize, total),
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
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
      this.serializeCustomer(
        (data as unknown) as CustomerRowForResponse,
        await customerPhonePrivacyService.createPrivacyContext(authContext),
      ),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
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
    );
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
        phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
          authContext,
        ),
      }),
    );
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const existing = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, source, douyin_screenshot_images")
      .eq("id", idVerify.data.id)
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
        .select("id, department_id, status")
        .eq("id", payload.owner_id)
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
    );
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
        phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
          authContext,
        ),
      }),
    );
  };

  @Delete("/customers/:id")
  async deleteCustomer(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const existing = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .eq("id", idVerify.data.id)
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
    const authContext = await this.getRequiredAuthContext(request);
    if (!accessPolicyService.hasPermission(authContext, "customer.assign_owner")) {
      throw Errors.business(403, "无权批量分配客户负责人", "FORBIDDEN");
    }

    const result = BatchAssignCustomerOwnerSchema.safeParse(request.body);
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const payload: BatchAssignCustomerOwnerInput = result.data;
    const targetEmployee = await this.getAssignableTargetEmployee(payload.owner_id);

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
      .select("id, owner_id")
      .in("id", customerIds);

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
        .in("id", successCustomerIds);

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
    const authContext = await this.getRequiredAuthContext(request);
    const { id } = request.params; // ← 这里拿到 UUID
    const { data, error } = await SupabaseDB.getAdminClient().from("customers").select(this.customerSelect).eq(
      "id",
      id,
    ).single();

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
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
        },
      ),
    );
  }

  private async handleCustomerPhoneAction(
    request: FastifyRequest<{ Params: { id: string } }>,
    action: CustomerPhoneAction,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
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

  @Get("/customers/:id/follow_ups")
  async getCustomerFollowUpById(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const { id } = request.params; // ← 这里拿到 UUID
    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const customer = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .eq("id", id)
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
    const authContext = await this.getRequiredAuthContext(request);
    const { id } = request.params;
    const customer = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .eq("id", id)
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
      scope !== "all" &&
      followUpPayload.employee_id &&
      followUpPayload.employee_id !== authContext.employeeId
    ) {
      throw Errors.forbidden();
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
