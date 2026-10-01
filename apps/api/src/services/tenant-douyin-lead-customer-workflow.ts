import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import { customerWorkflowInitializationService } from
  "@/services/customer-workflow-initialization";
import { throwInvalidResponse } from
  "@/services/tenant-douyin-leads-service-helpers";

export type ConvertedCustomerRepositoryPort = {
  findCustomerAccess(tenantId: string, customerId: string): Promise<{
    id: string;
    tenant_id: string;
    status: string | null;
    owner_id: string | null;
  } | null>;
};

export type CustomerWorkflowInitializationPort = Pick<
  typeof customerWorkflowInitializationService,
  "initialize"
>;

export async function initializeConvertedPotentialCustomerWorkflow(input: {
  authContext: AuthContext;
  tenantId: string;
  customerId: string;
  repository: ConvertedCustomerRepositoryPort;
  workflowInitialization?: CustomerWorkflowInitializationPort;
}): Promise<void> {
  const customer = await input.repository.findCustomerAccess(
    input.tenantId,
    input.customerId,
  );
  if (!customer || !customer.status || customer.id !== input.customerId
    || customer.tenant_id !== input.tenantId) {
    throwInvalidResponse();
  }
  if (customer.status !== "potential") return;

  const initialization = await (
    input.workflowInitialization ?? customerWorkflowInitializationService
  ).initialize({
    authContext: input.authContext,
    tenantId: input.tenantId,
    customerId: input.customerId,
    ownerId: customer.owner_id,
  });
  if (initialization.status === "degraded") {
    throw Errors.business(
      503,
      "客户工作流初始化失败，请稍后重试",
      initialization.code,
    );
  }
}
