import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import {
  tenantShareLinkRepository,
  type BindCustomerFromTenantShareResult,
  type TenantShareLinkPublicRecord,
} from "@/repositories/tenant-share-links";
import type {
  TenantShareLinkCreateInput,
  TenantShareLinkListQuery,
} from "@/schema/tenant-share-links";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { notificationService } from "@/services/notifications";

class TenantShareLinkService {
  async create(input: TenantShareLinkCreateInput, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (!tenantId || !authContext.employeeId) {
      throw Errors.forbidden();
    }

    const token = buildTenantShareToken();
    return tenantShareLinkRepository.create({
      ...input,
      tenantId,
      shareEmployeeId: authContext.employeeId,
      token,
    });
  }

  async list(query: TenantShareLinkListQuery, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (!tenantId || !authContext.employeeId) {
      throw Errors.forbidden();
    }

    return tenantShareLinkRepository.list({
      ...query,
      tenantId,
      employeeId: authContext.employeeId,
    });
  }

  async getPublicDetail(token: string) {
    const record = await tenantShareLinkRepository.findPublicByToken(token);
    if (!record) {
      throw Errors.business(404, "分享链接不存在", "TENANT_SHARE_LINK_NOT_FOUND");
    }

    return this.serializePublicDetail(record);
  }

  async resolveLoginContext(token: string) {
    const record = await tenantShareLinkRepository.findPublicByToken(token);
    return this.requireAvailableContext(record);
  }

  async resolveAttribution(input: {
    shareLinkId?: string | null;
    shareToken?: string | null;
  }) {
    const byId = input.shareLinkId
      ? await tenantShareLinkRepository.findPublicById(input.shareLinkId)
      : null;
    const byToken = input.shareToken
      ? await tenantShareLinkRepository.findPublicByToken(input.shareToken)
      : null;

    if (byId && byToken && byId.id !== byToken.id) {
      throw Errors.business(409, "分享归因上下文不一致", "SHARE_CONTEXT_MISMATCH");
    }

    const record = byId ?? byToken;
    return record ? this.requireAvailableContext(record) : null;
  }

  async bindCustomer(input: {
    authUserId: string;
    phone: string;
    shareToken: string;
  }) {
    try {
      const result = await tenantShareLinkRepository.bindCustomer(input);
      await notificationService.tryNotifyEmployeeShareCustomerBound({
        tenantId: result.tenant_id,
        customerId: result.customer_id,
        shareEmployeeId: result.share_employee_id,
        dedupeResult: result.dedupe_result,
        source: result.source,
      });
      return result;
    } catch (error) {
      this.handleBindError(error);
    }
  }

  private serializePublicDetail(record: TenantShareLinkPublicRecord) {
    const expiresAt = record.expires_at ? new Date(record.expires_at).getTime() : null;
    const expired = expiresAt !== null && expiresAt <= Date.now();
    const available = record.status === "active" &&
      !expired &&
      record.tenant?.status === "active";

    return {
      token: record.token,
      source: record.source,
      target_type: record.target_type,
      target_id: record.target_id,
      status: record.status,
      expires_at: record.expires_at,
      available,
      tenant: record.tenant
        ? {
          id: record.tenant.id,
          name: record.tenant.name,
          slug: record.tenant.slug,
        }
        : null,
      share_employee: record.share_employee
        ? {
          id: record.share_employee.id,
          name: record.share_employee.name,
        }
        : null,
    };
  }

  private requireAvailableContext(record: TenantShareLinkPublicRecord | null) {
    if (!record) {
      throw Errors.business(404, "分享链接不可用", "TENANT_SHARE_LINK_NOT_AVAILABLE");
    }

    const expiresAt = record.expires_at ? new Date(record.expires_at).getTime() : null;
    const expired = expiresAt !== null && expiresAt <= Date.now();
    if (
      record.status !== "active" ||
      expired ||
      record.tenant?.status !== "active"
    ) {
      throw Errors.business(409, "分享链接不可用", "TENANT_SHARE_LINK_NOT_AVAILABLE");
    }

    return {
      shareLinkId: record.id,
      tenantId: record.tenant_id,
      shareEmployeeId: record.share_employee_id,
      source: record.source,
    };
  }

  private handleBindError(error: unknown): never {
    const message = getDbErrorMessage(error);

    if (message.includes("TENANT_SHARE_LINK_NOT_FOUND")) {
      throw Errors.business(404, "分享链接不存在", "TENANT_SHARE_LINK_NOT_FOUND");
    }

    if (message.includes("TENANT_SHARE_LINK_DISABLED")) {
      throw Errors.business(409, "分享链接已停用", "TENANT_SHARE_LINK_DISABLED");
    }

    if (message.includes("TENANT_SHARE_LINK_EXPIRED")) {
      throw Errors.business(409, "分享链接已过期", "TENANT_SHARE_LINK_EXPIRED");
    }

    if (message.includes("TENANT_NOT_AVAILABLE")) {
      throw Errors.business(403, "装修公司状态不可用", "TENANT_NOT_AVAILABLE");
    }

    if (message.includes("TENANT_SHARE_EMPLOYEE_NOT_AVAILABLE")) {
      throw Errors.business(409, "分享员工状态不可用", "TENANT_SHARE_EMPLOYEE_NOT_AVAILABLE");
    }

    if (message.includes("CUSTOMER_ALREADY_BOUND")) {
      throw Errors.business(409, "该客户档案已绑定其他账号", "CUSTOMER_ALREADY_BOUND");
    }

    if (message.includes("TENANT_SHARE_CUSTOMER_UPSERT_FAILED")) {
      throw Errors.business(500, "分享客户创建或关联失败", "TENANT_SHARE_CUSTOMER_UPSERT_FAILED");
    }

    throw Errors.dbError("绑定员工分享客户失败", error);
  }
}

function buildTenantShareToken() {
  return `ts_${randomUUID().replace(/-/g, "")}`;
}

function getDbErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown };
    return [maybe.message, maybe.details]
      .filter((item): item is string => typeof item === "string")
      .join(" ");
  }

  return "";
}

export const tenantShareLinkService = new TenantShareLinkService();
export type { BindCustomerFromTenantShareResult };
