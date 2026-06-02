import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { IdParamSchema, PaginationQuerySchema } from "@/schema/request";
import {
  customerSelfServiceService,
  type CustomerContextRow,
  type UserProfileRow,
} from "@/services/customer-self-service";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { userIdentityService } from "@/services/user-identities";
import { z } from "zod";

export function optionalCustomerQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

export const CustomerProjectListQuerySchema = PaginationQuerySchema.extend({
  include: optionalCustomerQueryValue(z.enum(["home_summary"])),
});

export const CustomerBootstrapQuerySchema = PaginationQuerySchema.extend({
  include: optionalCustomerQueryValue(z.enum(["home_summary"])).default("home_summary"),
  projects_mode: optionalCustomerQueryValue(z.enum(["inline", "defer"])).default("inline"),
});

export const CustomerProjectLogListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    20,
    "每页日志不能超过 20 条",
  ).default(10),
  imageMode: optionalCustomerQueryValue(z.enum(["thumb", "full"])).default("thumb"),
});

export const CustomerProjectLogCommentListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    20,
    "每页评论不能超过 20 条",
  ).default(20),
});

export const CustomerProjectLogCommentParamSchema = IdParamSchema.extend({
  logId: z.uuid("无效的日志 ID"),
});

export abstract class CustomerSelfServiceBaseController extends BaseController {
  constructor() {
    super("customer-self-service");
  }

  protected async getRequiredAuthUserId(request: { user?: { sub?: string } }) {
    const authUserId = request.user?.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }
    return authUserId;
  }

  protected normalizeRelation<T extends Record<string, unknown>>(
    value: unknown,
    fallback: T,
  ): T {
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === "object") {
        return { ...fallback, ...(first as T) };
      }

      return fallback;
    }

    if (value && typeof value === "object") {
      return { ...fallback, ...(value as T) };
    }

    return fallback;
  }

  protected normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  protected getImagePublicUrl(path: string | null | undefined) {
    return resolveStoredFileUrl(path);
  }

  protected async getCustomerProfileByAuthUserId(
    authUserId: string,
    options?: {
      required?: boolean;
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    if (options?.customerId && options.tenantId) {
      const customers = await customerSelfServiceService.listCustomerProfilesByIds([
        options.customerId,
      ]);
      const customer = customers.find((item) => (
        item.id === options.customerId && item.tenant_id === options.tenantId
      )) ?? null;
      if (!customer && options.required) {
        throw Errors.forbidden();
      }

      return customer;
    }

    const list = await this.listCustomerProfilesByMembership(authUserId, options);
    if (list.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请先选择装修公司");
    }

    const customer = list[0] || null;
    if (!customer && options?.required) {
      throw Errors.forbidden();
    }

    return customer;
  }

  protected async listCustomerProfilesByMembership(
    authUserId: string,
    options?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const memberships = (await userIdentityService.listActiveBusinessMemberships({
      userId: authUserId,
      identityType: "customer",
    })).filter((item) => (
      (!options?.tenantId || item.tenant_id === options.tenantId) &&
      (!options?.customerId || item.identity_id === options.customerId)
    ));

    const customerIds = Array.from(new Set(memberships.map((item) => item.identity_id)));
    if (customerIds.length === 0) {
      return [] as CustomerContextRow[];
    }

    const customers = await customerSelfServiceService.listCustomerProfilesByIds(
      customerIds,
    );

    const membershipTenantMap = new Map(
      memberships.map((item) => [item.identity_id, item.tenant_id]),
    );

    return customers.filter((item) => {
      const membershipTenantId = membershipTenantMap.get(item.id);
      return (
        item.tenant_id &&
        item.tenant_id === membershipTenantId &&
        (!options?.tenantId || item.tenant_id === options.tenantId) &&
        (!options?.customerId || item.id === options.customerId)
      );
    });
  }

  protected normalizeTenantRelation(value: CustomerContextRow["tenant"]) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  protected assertCustomerTenantAvailable(customer: CustomerContextRow | null) {
    if (!customer) return;

    const tenant = this.normalizeTenantRelation(customer.tenant);
    if (!customer.tenant_id || tenant?.status !== "active") {
      throw Errors.business(
        403,
        "装修公司服务已暂停，请联系装修公司",
        ErrorCodes.TENANT_NOT_AVAILABLE,
        {
          tenant_id: customer.tenant_id,
          tenant_status: tenant?.status ?? null,
        },
      );
    }
  }

  protected async getCustomerProfileFromRequest(
    request: {
      user?: { sub?: string; tenant_id?: string | null; customer_id?: string | null };
    },
    options?: { required?: boolean },
  ) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      required: options?.required,
      tenantId: request.user?.tenant_id ?? null,
      customerId: request.user?.customer_id ?? null,
    });
    this.assertCustomerTenantAvailable(customer);
    return customer;
  }

  protected async getUserProfileByAuthUserId(authUserId: string) {
    return customerSelfServiceService.getUserProfileByAuthUserId(authUserId);
  }

  protected serializeAuthProfile(
    authUserId: string,
    userProfile: UserProfileRow | null,
    roles: string[],
  ) {
    return {
      auth_user_id: authUserId,
      nickname: userProfile?.nickname ?? null,
      avatar: this.getImagePublicUrl(userProfile?.avatar_path),
      avatar_path: userProfile?.avatar_path ?? null,
      profile_completed: Boolean(userProfile?.profile_completed_at),
      profile_completed_at: userProfile?.profile_completed_at ?? null,
      roles,
    };
  }

  protected serializeCustomerProfile(
    customer: CustomerContextRow,
    userProfile: UserProfileRow | null,
  ) {
    return {
      customer_id: customer.id,
      auth_user_id: customer.user_id,
      name: customer.name,
      phone: customer.phone ?? null,
      nickname: userProfile?.nickname ?? null,
      avatar: this.getImagePublicUrl(userProfile?.avatar_path),
      avatar_path: userProfile?.avatar_path ?? null,
      profile_completed: Boolean(userProfile?.profile_completed_at),
      profile_completed_at: userProfile?.profile_completed_at ?? null,
    };
  }

  protected serializeCustomerContext(
    authUserId: string,
    customer: CustomerContextRow | null,
    userProfile: UserProfileRow | null,
  ) {
    const tenant = customer ? this.normalizeTenantRelation(customer.tenant) : null;

    return {
      mode: customer ? "customer" : "platform_visitor",
      auth_user_id: authUserId,
      customer_id: customer?.id ?? null,
      tenant_id: customer?.tenant_id ?? null,
      tenant_status: tenant?.status ?? null,
      customer_name: customer?.name ?? null,
      has_customer_profile: Boolean(customer),
      nickname: userProfile?.nickname ?? null,
      avatar: this.getImagePublicUrl(userProfile?.avatar_path),
      profile_completed: Boolean(userProfile?.profile_completed_at),
    };
  }
}
