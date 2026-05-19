import type { FastifyReply, FastifyRequest } from "fastify";
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
import {
  customerPhonePrivacyService,
  type CustomerPhoneAction,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import {
  customerFollowUpService,
  type CustomerFollowUpSummary,
} from "@/services/customer-follow-ups";
import {
  customerSourceService,
  type CustomerSourceSummary,
} from "@/services/customer-sources";
import {
  customerPropertyService,
  type CustomerPrimaryPropertySummary,
  type NormalizedCustomerPropertyPayload,
} from "@/services/customer-properties";
import { customerOwnerAssignmentService } from "@/services/customer-owner-assignments";
import { ErrorCodes } from "@/errors/error-codes";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";

type CustomerPropertyPayload =
  | CreateCustomerSchemaType["property"]
  | UpdateCustomerSchemaType["property"];

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
  private customerSelect = `
    *,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      phone
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
    tenantId: string,
  ) {
    const { data: targetEmployee, error: targetEmployeeError } = await SupabaseDB
      .getAdminClient()
      .from("employees")
      .select("id, name, department_id, tenant_department_id, status, tenant_id")
      .eq("id", ownerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (targetEmployeeError) {
      throw Errors.dbError("查询目标负责人失败", targetEmployeeError);
    }

    return targetEmployee;
  }

  private attachPropertySummary<T extends CustomerRowForResponse>(
    customer: T,
    propertyMap: Map<string, CustomerPrimaryPropertySummary[]>,
  ) {
    return {
      ...customer,
      ...customerPropertyService.buildCustomerPropertySummaryBundle(
        customer,
        propertyMap,
      ),
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

  private async buildCustomerDetailResponse(
    customer: CustomerRowForResponse,
    options: {
      primaryProperty?: CustomerPrimaryPropertySummary | null;
      includeProperties?: boolean;
      phonePrivacyContext?: CustomerPhonePrivacyContext;
      tenantId: string;
    },
  ) {
    const tenantId = options.tenantId;
    const primaryProperty = options.primaryProperty ?? await customerPropertyService
      .getPrimaryCustomerPropertySummary(customer.id, tenantId);
    const properties = options.includeProperties
      ? await customerPropertyService.getCustomerPropertySummaries(customer.id, tenantId)
      : undefined;
    const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
      customerIds: [customer.id],
      tenantId,
    });
    const sourceSummaryMap = options.phonePrivacyContext
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
        options.phonePrivacyContext,
      ),
      property_id: primaryProperty?.id ?? null,
      community: primaryProperty?.community ?? null,
      building_info: primaryProperty?.building_info ?? null,
      layout: primaryProperty?.layout ?? null,
      area: primaryProperty?.area ?? null,
      ...(options.includeProperties
        ? {
          properties: (properties || []).map((item) =>
            customerPropertyService.serializePropertySummary(
              item,
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

    return ResponseHandler.success(
      await customerPropertyService.listCustomerProperties({
        authContext,
        customerId: paramsResult.data.customerId,
      }),
    );
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

    return ResponseHandler.success(
      await customerPropertyService.createCustomerProperty({
        authContext,
        customerId: paramsResult.data.customerId,
        payload: bodyResult.data,
      }),
    );
  }

  @Post("/customers/:customerId/properties/:propertyId/primary")
  async setCustomerPrimaryProperty(
    request: FastifyRequest<{ Params: { customerId: string; propertyId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    return ResponseHandler.success(
      await customerPropertyService.setCustomerPrimaryProperty({
        authContext,
        customerId: paramsResult.data.customerId,
        propertyId: paramsResult.data.propertyId,
      }),
    );
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

    return ResponseHandler.success(
      await customerPropertyService.updateCustomerProperty({
        authContext,
        customerId: paramsResult.data.customerId,
        propertyId: paramsResult.data.propertyId,
        payload: bodyResult.data,
      }),
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
      ? await customerFollowUpService.getTodayWorkCustomerIds(authContext.tenantId)
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
      const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
        customerIds,
        tenantId: authContext.tenantId,
      });
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
        .in("id", pageCustomerIds)
        .eq("tenant_id", authContext.tenantId);

      if (error) throw Errors.dbError("列表查询失败", error);

      const customerOrder = new Map(pageCustomerIds.map((id, index) => [id, index]));
      const rows = (((data || []) as unknown) as CustomerRowForResponse[])
        .sort((a, b) =>
          (customerOrder.get(a.id) ?? 0) - (customerOrder.get(b.id) ?? 0)
        );
      const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
        authContext,
      );
      const propertyMap = await customerPropertyService.getCustomerPropertySummaryMap(
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
    const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
      customerIds: rows.map((item) => item.id),
      tenantId: authContext.tenantId,
    });
    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );
    const propertyMap = await customerPropertyService.getCustomerPropertySummaryMap(
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
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    if (!data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (data as unknown) as { owner_id: string | null; tenant_id?: string | null },
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

    if (payload.owner_id) {
      const targetEmployee = await this.getAssignableTargetEmployee(
        payload.owner_id,
        authContext.tenantId,
      );
      if (!targetEmployee || targetEmployee.status !== "active") {
        throw Errors.badRequest("目标负责人不存在或不可用");
      }
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .insert(payload)
      .select(this.customerSelect)
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    const customer = (data as unknown) as CustomerRowForResponse;
    const primaryProperty = await customerPropertyService.upsertCustomerPrimaryProperty({
      customerId: customer.id,
      propertyPayload,
      tenantId: authContext.tenantId,
    });
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
        .eq("tenant_id", authContext.tenantId)
        .select(this.customerSelect)
        .single();

      if (error) throw Errors.dbError("更新失败", error);
      customer = (data as unknown) as CustomerRowForResponse;
    } else {
      const current = await SupabaseDB.getAdminClient()
        .from("customers")
        .select(this.customerSelect)
        .eq("id", idVerify.data.id)
        .eq("tenant_id", authContext.tenantId)
        .maybeSingle();

      if (current.error) throw Errors.dbError("查询客户失败", current.error);
      if (!current.data) throw Errors.badRequest("客户不存在");
      customer = (current.data as unknown) as CustomerRowForResponse;
    }

    const primaryProperty = await customerPropertyService.upsertCustomerPrimaryProperty({
      customerId: customer.id,
      propertyPayload,
      tenantId: authContext.tenantId,
    });
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
    const result = BatchAssignCustomerOwnerSchema.safeParse(request.body);
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    return ResponseHandler.success(
      await customerOwnerAssignmentService.batchAssignOwner({
        authContext,
        payload: result.data,
      }),
    );
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
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    return ResponseHandler.success(
      await customerFollowUpService.listCustomerFollowUps({
        authContext,
        customerId: idVerify.data.id,
        page: queryResult.data.page,
        pageSize: queryResult.data.pageSize,
      }),
    );
  }

  @Post("/customers/:id/follow_ups")
  async createCustomerFollowUpById(
    request: FastifyRequest<{
      Params: { id: string };
      Body: FollowUpInsert;
    }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    return ResponseHandler.success(
      await customerFollowUpService.createCustomerFollowUp({
        authContext,
        customerId: idVerify.data.id,
        payload: request.body,
      }),
    );
  }
}

export default new CustomerController(); // 导出实例
