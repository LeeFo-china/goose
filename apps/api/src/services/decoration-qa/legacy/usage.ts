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
  if (employeeContext.employeeId) {
    return resolveEmployeeUsageContext(input);
  }

  return null;
}

export async function resolveDecorationQaUsageContext(
  input: DecorationQaAuthInput & {
    role?: "visitor" | "customer" | "employee";
    projectId?: string | null;
  },
): Promise<DecorationQaUsageContext> {
  // Request context selects prompts, but cannot downgrade an authenticated employee.
  const authSource = getSourceFromAuth(input);
  if (authSource === "employee_miniprogram") {
    return resolveEmployeeUsageContext(input);
  }

  if (authSource === "visitor" && input.authUserId) {
    const inferredContext = await inferDecorationQaUsageContextFromAuth(input);
    if (inferredContext) return inferredContext;
  }

  const source = authSource !== "visitor"
    ? authSource
    : input.role === "customer"
    ? "customer_miniprogram"
    : input.role === "employee"
    ? "employee_miniprogram"
    : "visitor";

  if (source === "visitor") {
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

  return resolveEmployeeUsageContext(input);
}

async function resolveEmployeeUsageContext(
  input: DecorationQaAuthInput & { projectId?: string | null },
): Promise<DecorationQaUsageContext> {
  const context = await authorizationService.getRequiredAuthContext(input.authUserId, {
    tenantServiceAccess: input.tenantServiceAccess ?? "write",
    requiredCapability: "business.ai",
  });
  if (!context.employeeId || !isEmployeeOperableStatus(context.employeeStatus)) {
    throw Errors.forbidden();
  }
  if (!context.tenantId) {
    throw Errors.business(
      403,
      "当前员工缺少装修公司上下文",
      "AI_TENANT_CONTEXT_MISSING",
    );
  }

  return {
    authUserId: input.authUserId,
    tenantId: context.tenantId,
    customerId: null,
    employeeId: context.employeeId,
    projectId: input.projectId ?? null,
    source: "employee_miniprogram",
    billable: true,
  };
}
