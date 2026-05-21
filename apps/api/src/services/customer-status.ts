import { Errors } from "@/errors/error-factory";
import { customerCoreRepository } from "@/repositories/customer-core";
import { customerPropertyRepository } from "@/repositories/customer-properties";
import { customerStatusTransitionRepository } from "@/repositories/customer-status-transitions";
import { projectRepository } from "@/repositories/projects";
import type {
  CustomerStatusTransitionInput,
  CustomerStatusTransitionListQuery,
} from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  CustomerStatusActionConfig,
  inferCustomerStatusAction,
  isCustomerStatus,
  listCustomerStatusActions,
  resolveCustomerStatusTransition,
  type CustomerStatus,
} from "@gooes/domain";

type TransitionCustomerStatusInput = {
  authContext: AuthContext;
  customerId: string;
  payload: CustomerStatusTransitionInput;
  patch?: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  skipAccessCheck?: boolean;
};

class CustomerStatusService {
  private buildAutoDesignProjectName(input: {
    customerName?: unknown;
    customerPhone?: unknown;
    community?: string | null;
    buildingInfo?: string | null;
  }) {
    const customerLabel = typeof input.customerName === "string" && input.customerName.trim()
      ? input.customerName.trim()
      : typeof input.customerPhone === "string" && input.customerPhone.trim()
        ? input.customerPhone.trim()
        : "未命名客户";
    const propertyLabel = [input.community, input.buildingInfo]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join(" ");
    const name = propertyLabel
      ? `${customerLabel} - ${propertyLabel}设计项目`
      : `${customerLabel}设计项目`;

    return name.slice(0, 100);
  }

  private async ensureDesignProject(input: {
    authContext: AuthContext;
    tenantId: string;
    customerId: string;
    customer: Record<string, unknown>;
  }) {
    accessPolicyService.assertPermission(input.authContext, "project.create");

    const property = await customerPropertyRepository.getPrimarySummary({
      customerId: input.customerId,
      tenantId: input.tenantId,
    });
    if (!property?.id) {
      throw Errors.badRequest("客户进入设计前必须先维护房产信息");
    }

    const existing = await projectRepository.findActiveByCustomerProperty({
      customerId: input.customerId,
      propertyId: property.id,
      tenantId: input.tenantId,
    });
    if (existing) {
      return {
        project: existing,
        created: false,
      };
    }

    const project = await projectRepository.create({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      property_id: property.id,
      name: this.buildAutoDesignProjectName({
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        community: property.community,
        buildingInfo: property.building_info,
      }),
      address: [property.community, property.building_info].filter(Boolean).join(" ") || null,
      status: "designing",
      visibility_status: "inherit",
      budget: null,
      signed_amount: null,
      start_date: null,
      designer_id: null,
      supervisor_id: null,
      style_tags: [],
    });

    return {
      project,
      created: true,
    };
  }

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

    if (!input.skipAccessCheck) {
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

    const designProjectResult = input.payload.action === "start_design"
      ? await this.ensureDesignProject({
        authContext: input.authContext,
        tenantId,
        customerId: input.customerId,
        customer: existing,
      })
      : null;

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
      metadata: {
        ...input.payload.metadata,
        ...(designProjectResult?.project.id
          ? {
            project_id: designProjectResult.project.id,
            project_auto_created: designProjectResult.created,
          }
          : {}),
      },
    });

    return customer;
  }

  async buildProjectContractSync(input: {
    authContext: AuthContext;
    customerId: string | null;
    projectId: string;
  }): Promise<{
    existing: Record<string, unknown>;
    payload: CustomerStatusTransitionInput;
  } | null> {
    if (!input.customerId) {
      return null;
    }

    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });
    if (!customer) {
      throw Errors.badRequest("项目关联客户不存在");
    }

    const fromStatus = this.getRequiredCurrentStatus(customer.status);
    if (fromStatus === "contracted") {
      return null;
    }

    const transition = resolveCustomerStatusTransition({
      action: "sign_contract",
      fromStatus,
    });
    if (!transition) {
      throw Errors.badRequest("项目签约前，关联客户状态必须为已下定");
    }

    return {
      existing: customer,
      payload: {
        action: "sign_contract",
        reason: "项目签约后同步客户签约状态",
        metadata: {
          source: "project_sign_contract",
          project_id: input.projectId,
        },
      },
    };
  }

  async listCustomerStatusActions(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });
    if (!customer) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      input.authContext,
      customer,
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const fromStatus = this.getRequiredCurrentStatus(customer.status);
    return {
      current_status: fromStatus,
      actions: listCustomerStatusActions({
        fromStatus,
      }),
    };
  }

  async listCustomerStatusTransitions(input: {
    authContext: AuthContext;
    customerId: string;
    query: CustomerStatusTransitionListQuery;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });
    if (!customer) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      input.authContext,
      customer,
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const result = await customerStatusTransitionRepository.listByCustomer({
      customerId: input.customerId,
      tenantId,
      page: input.query.page,
      pageSize: input.query.pageSize,
    });

    return {
      rows: result.rows,
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total: result.total,
        totalPages: result.total > 0
          ? Math.ceil(result.total / input.query.pageSize)
          : 0,
      },
    };
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
