import { TenantBaseController } from "@/controllers/TenantBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerSchema,
  type CreateCustomerSchemaType,
  type UpdateCustomerSchemaType,
  UpdateCustomerSchema,
} from "@/schema/customer";
import type {
  CustomerPrimaryPropertySummary,
  NormalizedCustomerPropertyPayload,
} from "@/services/customer-properties";
import { customerPropertyService } from "@/services/customer-properties";
import type { CustomerFollowUpSummary } from "@/services/customer-follow-ups";
import { customerFollowUpService } from "@/services/customer-follow-ups";
import type { CustomerSourceSummary } from "@/services/customer-sources";
import { customerSourceService } from "@/services/customer-sources";
import {
  customerPhonePrivacyService,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import {
  customerCoreService,
  type CustomerCoreRow,
} from "@/services/customer-core";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";
import { z } from "zod";

export type CustomerPropertyPayload =
  | CreateCustomerSchemaType["property"]
  | UpdateCustomerSchemaType["property"];

export type CustomerRowForResponse = CustomerCoreRow;

export const CustomerPhoneActionBodySchema = z.object({
  scene: z.string().trim().max(80, "场景过长").optional(),
  reason: z.string().trim().max(200, "原因过长").optional(),
});

export const CustomerDetailQuerySchema = z.object({
  include_activity: z.string().trim().optional(),
});

export function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export abstract class CustomerBaseController extends TenantBaseController<
  typeof CreateCustomerSchema,
  typeof UpdateCustomerSchema
> {
  constructor() {
    super("customers", CreateCustomerSchema, UpdateCustomerSchema);
  }

  protected normalizeOwner(owner: unknown) {
    if (Array.isArray(owner)) {
      return owner[0] ?? null;
    }

    return owner ?? null;
  }

  protected isObjectWithOwnKey<T extends object, K extends PropertyKey>(
    value: T,
    key: K,
  ): value is T & Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  protected normalizeStoredDouyinScreenshotImages(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  protected validateDouyinScreenshotImagesInput(value: unknown) {
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

  protected assertDouyinScreenshotRequired(images: string[]) {
    if (images.length === 0) {
      throw Errors.business(
        400,
        "抖音来源客户请上传抖音截图",
        ErrorCodes.DOUYIN_SCREENSHOT_REQUIRED,
      );
    }
  }

  protected serializeCustomer<T extends {
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

  protected splitCustomerPayload<T extends { property?: CustomerPropertyPayload }>(
    payload: T,
  ) {
    const { property, ...customerPayload } = payload;
    return {
      customerPayload,
      propertyPayload: this.normalizeCustomerPropertyPayload(property),
    };
  }

  protected normalizeCustomerPropertyPayload(
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

  protected attachPropertySummary<T extends CustomerRowForResponse>(
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

  protected attachSourceSummary<T extends { id: string }>(
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

  protected attachFollowUpSummary<T extends CustomerRowForResponse>(
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
      follow_up_state: customerCoreService.getFollowUpState({
        nextFollowAt: latest?.next_follow_at,
        customerStatus: customer.status,
      }),
    };
  }

  protected serializeFollowUp<T extends { employee?: unknown; employee_id: string | null }>(
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

  protected async buildCustomerDetailResponse(
    customer: CustomerRowForResponse,
    options: {
      primaryProperty?: CustomerPrimaryPropertySummary | null;
      includeProperties?: boolean;
      phonePrivacyContext?: CustomerPhonePrivacyContext;
      tenantId: string;
    },
  ) {
    const tenantId = options.tenantId;
    const [
      primaryProperty,
      properties,
      followUpMap,
      sourceSummaryMap,
    ] = await Promise.all([
      options.primaryProperty !== undefined
        ? Promise.resolve(options.primaryProperty)
        : customerPropertyService.getPrimaryCustomerPropertySummary(customer.id, tenantId),
      options.includeProperties
        ? customerPropertyService.getCustomerPropertySummaries(customer.id, tenantId)
        : Promise.resolve(undefined),
      customerFollowUpService.getLatestFollowUpMap({
        customerIds: [customer.id],
        tenantId,
      }),
      options.phonePrivacyContext
        ? customerSourceService.getCustomerSourceSummaryMap({
          authContext: options.phonePrivacyContext.authContext,
          customerIds: [customer.id],
        })
        : Promise.resolve(new Map<string, CustomerSourceSummary>()),
    ]);

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
}
