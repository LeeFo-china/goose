import { Errors } from "@/errors/error-factory";
import {
  workflowRepository,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
} from "@/repositories/workflows";
import type { WorkflowSubjectType } from "@gooes/domain";

const ERROR_CODE =
  "SUPPLIER_PURCHASE_BATCH_WORKFLOW_BUSINESS_COMMAND_REQUIRED";
const ERROR_MESSAGE = "采购批次审批必须通过采购业务命令执行";

export function assertGenericWorkflowMutationAllowed(
  definition: Pick<WorkflowDefinitionRow, "workflow_key"> | null,
  subjectType: WorkflowSubjectType | null,
) {
  if (
    definition?.workflow_key === "supplier_purchase_batch_approval" ||
    subjectType === "supplier_purchase_batch"
  ) throwBusinessBoundaryError();
}

export async function assertGenericWorkflowCompletionAllowed(input: {
  tenantId: string;
  definition: WorkflowDefinitionRow;
  instanceId: string;
}): Promise<WorkflowInstanceRow | null> {
  assertGenericWorkflowMutationAllowed(input.definition, null);

  const instance = await workflowRepository.getRuntimeInstanceById({
    tenantId: input.tenantId,
    definitionId: input.definition.id,
    instanceId: input.instanceId,
  });
  assertGenericWorkflowMutationAllowed(null, instance?.subject_type ?? null);
  return instance;
}

function throwBusinessBoundaryError(): never {
  throw Errors.business(409, ERROR_MESSAGE, ERROR_CODE);
}
