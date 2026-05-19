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
import {
  customerCoreService,
  type CustomerCoreRow,
} from "@/services/customer-core";
import { ErrorCodes } from "@/errors/error-codes";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";

type CustomerPropertyPayload =
  | CreateCustomerSchemaType["property"]
  | UpdateCustomerSchemaType["property"];

type CustomerRowForResponse = CustomerCoreRow;

type CustomerFollowFilter = "due" | "overdue";

const CustomerPhoneActionBodySchema = z.object({
  scene: z.string().trim().max(80, "场景过长").optional(),
  reason: z.string().trim().max(200, "原因过长").optional(),
});

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
      follow_up_state: customerCoreService.getFollowUpState(latest?.next_follow_at),
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

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = CustomerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const listResult = await customerCoreService.listCustomers({
      authContext,
      query: queryResult.data,
    });
    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );
    const propertyMap = await customerPropertyService.getCustomerPropertySummaryMap(
      listResult.rows.map((item) => item.id),
      authContext.tenantId,
    );
    const sourceSummaryMap = await customerSourceService.getCustomerSourceSummaryMap({
      authContext,
      customerIds: listResult.rows.map((item) => item.id),
    });
    return ResponseHandler.success({
      list: listResult.rows.map((item) =>
        this.serializeCustomer(
          this.attachSourceSummary(
            this.attachPropertySummary(
              this.attachFollowUpSummary(item, listResult.followUpMap),
              propertyMap,
            ),
            sourceSummaryMap,
          ),
          phonePrivacyContext,
        )
      ),
      pagination: buildPagination(
        listResult.page,
        listResult.pageSize,
        listResult.total,
      ),
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const customer = await customerCoreService.getCustomerDetail({
      authContext,
      customerId: idVerify.data.id,
      notFoundAs: "bad_request",
    });

    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(
        customer,
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
      await customerOwnerAssignmentService.assertActiveTenantOwner({
        ownerId: payload.owner_id,
        tenantId: authContext.tenantId,
      });
    }

    const customer = await customerCoreService.createCustomer(payload);
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

    const existing = await customerCoreService.getRequiredCustomerForUpdate({
      authContext,
      customerId: idVerify.data.id,
    });

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const payload = customerPayload;
    const sourceTouched = this.isObjectWithOwnKey(payload, "source");
    const screenshotTouched = this.isObjectWithOwnKey(
      payload,
      "douyin_screenshot_images",
    );
    const nextSource = sourceTouched
      ? payload.source ?? null
      : existing.source ?? null;
    const nextDouyinScreenshotImages = screenshotTouched
      ? this.validateDouyinScreenshotImagesInput(
        payload.douyin_screenshot_images,
      )
      : this.normalizeStoredDouyinScreenshotImages(
        existing.douyin_screenshot_images,
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
    const ownerChanged = hasOwnerUpdate && payload.owner_id !== existing.owner_id;
    const hasNonOwnerUpdates = Object.keys(payload).some((key) => key !== "owner_id");

    if (hasNonOwnerUpdates || hasPropertyUpdate) {
      const canAccess = await accessPolicyService.canAccessCustomer(
        authContext,
        existing,
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

      await customerOwnerAssignmentService.assertCanAssignSingleOwner({
        authContext,
        customer: existing,
        ownerId: payload.owner_id,
      });
    }

    const customer = await customerCoreService.updateCustomer({
      authContext,
      customerId: idVerify.data.id,
      payload,
    });

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

    const customer = await customerCoreService.invalidateCustomer({
      authContext,
      customerId: idVerify.data.id,
    });
    return ResponseHandler.success(
      this.serializeCustomer(
        customer,
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
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const customer = await customerCoreService.getCustomerDetail({
      authContext,
      customerId: idVerify.data.id,
      notFoundAs: "not_found",
    });

    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(
        customer,
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
