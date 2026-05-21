import { Errors } from "@/errors/error-factory";
import { customerCoreRepository } from "@/repositories/customer-core";
import { customerStatusTransitionRepository } from "@/repositories/customer-status-transitions";
import type { CustomerStatusTransitionInput } from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  CustomerStatusActionConfig,
  inferCustomerStatusAction,
  isCustomerStatus,
  resolveCustomerStatusTransition,
  type CustomerStatus,
} from "@gooes/domain";

type TransitionCustomerStatusInput = {
  authContext: AuthContext;
  customerId: string;
  payload: CustomerStatusTransitionInput;
  patch?: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
};

class CustomerStatusService {
  async transitionCustomerStatus(input: TransitionCustomerStatusInput) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const existing = input.existing ??
      await customerCoreRepository.findById({
        customerId: input.customerId,
        tenantId,
      });
    if (!existing) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      input.authContext,
      {
        owner_id: typeof existing.owner_id === "string" ? existing.owner_id : null,
        tenant_id: typeof existing.tenant_id === "string"
          ? existing.tenant_id
          : tenantId,
      },
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const fromStatus = this.getRequiredCurrentStatus(existing.status);
    const transition = resolveCustomerStatusTransition({
      action: input.payload.action,
      fromStatus,
    });
    if (!transition) {
      throw Errors.badRequest("当前客户状态不允许执行该动作");
    }

    const reason = input.payload.reason?.trim() || null;
    if (CustomerStatusActionConfig[input.payload.action].requiresReason && !reason) {
      throw Errors.badRequest("该状态动作必须填写原因");
    }

    const patch = { ...(input.patch ?? {}) };
    delete patch.status;
    const customer = await customerCoreRepository.updateById({
      customerId: input.customerId,
      tenantId,
      payload: {
        ...patch,
        status: transition.toStatus,
      },
    });

    await customerStatusTransitionRepository.create({
      tenantId,
      customerId: input.customerId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      action: input.payload.action,
      operatorEmployeeId: input.authContext.employeeId ?? null,
      operatorAuthUserId: input.authContext.authUserId,
      reason,
      metadata: input.payload.metadata,
    });

    return customer;
  }

  buildTransitionPayloadFromStatus(input: {
    existing: Record<string, unknown>;
    nextStatus: unknown;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): CustomerStatusTransitionInput | null {
    if (typeof input.nextStatus !== "string" || !isCustomerStatus(input.nextStatus)) {
      throw Errors.badRequest("客户状态不能为空");
    }

    const fromStatus = this.getRequiredCurrentStatus(input.existing.status);
    if (fromStatus === input.nextStatus) {
      return null;
    }

    const action = inferCustomerStatusAction({
      fromStatus,
      toStatus: input.nextStatus,
    });
    if (!action) {
      throw Errors.badRequest("当前客户状态不允许直接变更为目标状态");
    }

    return {
      action,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
    };
  }

  private getRequiredCurrentStatus(value: unknown): CustomerStatus {
    if (typeof value !== "string" || !isCustomerStatus(value)) {
      return "potential";
    }

    return value;
  }
}

export const customerStatusService = new CustomerStatusService();
