import { Errors } from "@/errors/error-factory";
import {
  platformLeadRepository,
  type PlatformLeadAssignResult,
} from "@/repositories/platform-leads";
import type {
  PlatformLeadAssignInput,
  PlatformLeadListQuery,
  PlatformLeadSubmitInput,
} from "@/schema/platform-leads";
import type { AuthContext } from "@/services/authorization";
import { notificationService } from "@/services/notifications";

type VisitorLeadContext = {
  authUserId: string | null | undefined;
  verifiedPhone: string | null | undefined;
};

class PlatformLeadService {
  async submitVisitorLead(input: PlatformLeadSubmitInput, context: VisitorLeadContext) {
    if (!context.authUserId) {
      throw Errors.unauthorized("请先完成手机号验证");
    }

    if (!context.verifiedPhone) {
      throw Errors.unauthorized("请先完成手机号验证");
    }

    if (input.phone !== context.verifiedPhone) {
      throw Errors.badRequest("提交手机号必须与当前登录手机号一致");
    }

    const data = await platformLeadRepository.create({
      ...input,
      authUserId: context.authUserId,
    });

    return {
      ...data,
      message: "需求已提交，平台会尽快为你分配装修公司",
    };
  }

  async list(query: PlatformLeadListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return platformLeadRepository.list(query);
  }

  async getDetail(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);

    const detail = await platformLeadRepository.getDetail(id);
    if (!detail) {
      throw Errors.business(404, "平台线索不存在", "PLATFORM_LEAD_NOT_FOUND");
    }

    return detail;
  }

  async assign(id: string, input: PlatformLeadAssignInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);

    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    let assignResult: PlatformLeadAssignResult;
    try {
      assignResult = await platformLeadRepository.assign({
        leadId: id,
        tenantId: input.tenant_id,
        operatorEmployeeId: authContext.employeeId,
        assignedNote: input.assigned_note ?? null,
      });
    } catch (error) {
      this.handleAssignError(error);
    }

    const detail = await platformLeadRepository.getDetail(id);
    await notificationService.tryNotifyPlatformLeadAssigned({
      tenantId: assignResult!.assigned_tenant_id,
      platformLeadId: assignResult!.platform_lead_id,
      customerId: assignResult!.assigned_customer_id,
      dedupeResult: assignResult!.dedupe_result,
      leadName: detail?.name ?? null,
      leadPhone: detail?.phone ?? null,
      city: detail?.city ?? null,
    });

    return {
      result: assignResult!,
      detail,
    };
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private handleAssignError(error: unknown): never {
    const message = getDbErrorMessage(error);

    if (message.includes("PLATFORM_LEAD_NOT_FOUND")) {
      throw Errors.business(404, "平台线索不存在", "PLATFORM_LEAD_NOT_FOUND");
    }

    if (message.includes("TENANT_NOT_AVAILABLE")) {
      throw Errors.business(400, "目标租户不存在或不可用", "TENANT_NOT_AVAILABLE");
    }

    if (message.includes("PLATFORM_LEAD_ALREADY_ASSIGNED")) {
      throw Errors.business(409, "该平台线索已分配给其他租户", "PLATFORM_LEAD_ALREADY_ASSIGNED");
    }

    if (message.includes("PLATFORM_LEAD_NOT_ASSIGNABLE")) {
      throw Errors.business(409, "当前线索状态不可分配", "PLATFORM_LEAD_NOT_ASSIGNABLE");
    }

    if (message.includes("PLATFORM_LEAD_CUSTOMER_UPSERT_FAILED")) {
      throw Errors.business(500, "分配客户创建或关联失败", "PLATFORM_LEAD_CUSTOMER_UPSERT_FAILED");
    }

    throw Errors.dbError("分配平台线索失败", error);
  }
}

function getDbErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown };
    const messages = [maybe.message, maybe.details]
      .filter((item): item is string => typeof item === "string");
    return messages.join(" ");
  }

  return "";
}

export const platformLeadService = new PlatformLeadService();
