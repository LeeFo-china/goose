import {
  Errors,
  authorizationService,
  isEmployeeOperableStatus,
  type DecorationQaAuthInput,
  type DecorationQaUsageContext,
} from './shared';
import { findCustomerContextByAuthUserId, getCustomerContextByAuthUserId, getSourceFromAuth } from './identity';
import { buildCustomerProjectQaContext } from './project-context';

export async function inferDecorationQaUsageContextFromAuth(
  input: DecorationQaAuthInput & {
    projectId?: string | null;
  },
): Promise<DecorationQaUsageContext | null> {
  if (!input.authUserId) {
    return null;
  }

  const customer = await findCustomerContextByAuthUserId(input.authUserId);
  if (customer) {
    if (input.projectId) {
      const context = await buildCustomerProjectQaContext(
        input.authUserId,
        input.projectId,
        { includeConstructionStages: false },
      );
      if (!context.tenant_id) {
        return null;
      }

      return {
        authUserId: input.authUserId,
        tenantId: context.tenant_id,
        customerId: context.customer_id,
        employeeId: null,
        projectId: context.project_id,
        source: "customer_miniprogram",
        billable: true,
      };
    }

    if (customer.tenant_id) {
      return {
        authUserId: input.authUserId,
        tenantId: customer.tenant_id,
        customerId: customer.id,
        employeeId: null,
        projectId: null,
        source: "customer_miniprogram",
        billable: true,
      };
    }
  }

  const employeeContext = await authorizationService.getAuthContextByAuthUserId(
    input.authUserId,
  );
  if (
    employeeContext.employeeId &&
    employeeContext.tenantId &&
    isEmployeeOperableStatus(employeeContext.employeeStatus)
  ) {
    return {
      authUserId: input.authUserId,
      tenantId: employeeContext.tenantId,
      customerId: null,
      employeeId: employeeContext.employeeId,
      projectId: input.projectId ?? null,
      source: "employee_miniprogram",
      billable: true,
    };
  }

  return null;
}

export async function resolveDecorationQaUsageContext(
  input: DecorationQaAuthInput & {
    role?: "visitor" | "customer" | "employee";
    projectId?: string | null;
  },
): Promise<DecorationQaUsageContext> {
  const source = input.role === "customer"
    ? "customer_miniprogram"
    : input.role === "employee"
    ? "employee_miniprogram"
    : getSourceFromAuth(input);

  if (source === "visitor") {
    const inferredContext = await inferDecorationQaUsageContextFromAuth(input);
    if (inferredContext) {
      return inferredContext;
    }

    return {
      authUserId: input.authUserId,
      tenantId: null,
      customerId: null,
      employeeId: null,
      projectId: input.projectId ?? null,
      source,
      billable: false,
    };
  }

  if (source === "customer_miniprogram") {
    if (!input.authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    if (input.projectId) {
      const context = await buildCustomerProjectQaContext(
        input.authUserId,
        input.projectId,
        { includeConstructionStages: false },
      );
      if (!context.tenant_id) {
        throw Errors.business(
          403,
          "当前项目缺少装修公司上下文",
          "AI_TENANT_CONTEXT_MISSING",
        );
      }

      return {
        authUserId: input.authUserId,
        tenantId: context.tenant_id,
        customerId: context.customer_id,
        employeeId: null,
        projectId: context.project_id,
        source,
        billable: true,
      };
    }

    if (input.tenantId) {
      return {
        authUserId: input.authUserId,
        tenantId: input.tenantId,
        customerId: input.customerId ?? null,
        employeeId: null,
        projectId: null,
        source,
        billable: true,
      };
    }

    const customer = await getCustomerContextByAuthUserId(input.authUserId);
    if (!customer.tenant_id) {
      throw Errors.business(
        403,
        "当前客户缺少装修公司上下文",
        "AI_TENANT_CONTEXT_MISSING",
      );
    }

    return {
      authUserId: input.authUserId,
      tenantId: customer.tenant_id,
      customerId: customer.id,
      employeeId: null,
      projectId: null,
      source,
      billable: true,
    };
  }

  if (!input.tenantId) {
    throw Errors.business(
      403,
      "当前员工缺少装修公司上下文",
      "AI_TENANT_CONTEXT_MISSING",
    );
  }

  return {
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    customerId: null,
    employeeId: input.employeeId ?? null,
    projectId: input.projectId ?? null,
    source,
    billable: true,
  };
}
