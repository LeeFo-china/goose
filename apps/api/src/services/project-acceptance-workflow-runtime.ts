import {
  workflowRepository,
  type JsonObject,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
  type WorkflowRuntimeCompleteNodeResult,
} from "@/repositories/workflows";
import { assertRuntimeNodeCompletionAllowed } from "@/services/workflow-runtime-guards";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import {
  isProjectConstructionStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";

type ProjectAcceptanceWorkflowRuntimeStatus =
  | "advanced"
  | "skipped"
  | "failed";

export type ProjectAcceptanceWorkflowRuntimeMetadata = {
  status: ProjectAcceptanceWorkflowRuntimeStatus;
  workflow_key?: string;
  definition_id?: string;
  instance_id?: string;
  node_key?: string;
  current_node_key?: string | null;
  next_node_key?: string | null;
  reason?: string;
};

type SyncCustomerConfirmAcceptanceInput = {
  tenantId: string;
  projectId: string;
  acceptanceId: string;
  stageCode: ProjectLogStageCode;
  customerId: string;
  comment?: string | null;
};

class ProjectAcceptanceWorkflowRuntimeService {
  async syncCustomerConfirmAcceptance(
    input: SyncCustomerConfirmAcceptanceInput,
  ): Promise<ProjectAcceptanceWorkflowRuntimeMetadata> {
    if (!isProjectConstructionStageCode(input.stageCode)) {
      return { status: "skipped", reason: "stage_not_construction" };
    }

    const instance = await this.findRunningProjectInstance(input);
    if (!instance) {
      return {
        status: "failed",
        reason: "running_instance_not_found",
      };
    }

    const definition = await workflowRepository.findDefinitionById(
      instance.definition_id,
      input.tenantId,
    );
    if (
      !definition ||
      definition.status !== "active" ||
      !definition.active_version_id ||
      definition.category !== "construction"
    ) {
      return {
        status: "failed",
        definition_id: instance.definition_id,
        instance_id: instance.id,
        current_node_key: instance.current_node_key,
        reason: "active_construction_workflow_not_found",
      };
    }

    const nodeKey = instance.current_node_key;
    if (!nodeKey) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        reason: "current_node_key_missing",
      };
    }

    if (this.getCurrentStageCode(instance) !== input.stageCode) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        current_node_key: nodeKey,
        reason: "current_node_stage_mismatch",
      };
    }

    const output = this.buildOutput(input);
    await assertRuntimeNodeCompletionAllowed({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey,
      output,
    });

    const result = await workflowRepository.completeRuntimeNode({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey,
      action: "customer_confirm_acceptance",
      actorEmployeeId: null,
      output,
    });

    return this.handleCompleteResult(input, definition, instance, nodeKey, result);
  }

  private async handleCompleteResult(
    input: SyncCustomerConfirmAcceptanceInput,
    definition: WorkflowDefinitionRow,
    instance: WorkflowInstanceRow,
    nodeKey: string,
    result: WorkflowRuntimeCompleteNodeResult,
  ): Promise<ProjectAcceptanceWorkflowRuntimeMetadata> {
    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        node_key: nodeKey,
        current_node_key: result.currentNodeKey ?? instance.current_node_key,
        reason: result.reason,
      };
    }

    await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "project",
      subjectId: input.projectId,
      definitionId: definition.id,
      instanceId: result.instance.id,
    });

    return {
      status: "advanced",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      node_key: nodeKey,
      current_node_key: result.instance.current_node_key,
      next_node_key: this.getNodeKey(result.nextNode),
    };
  }

  private async findRunningProjectInstance(
    input: Pick<SyncCustomerConfirmAcceptanceInput, "tenantId" | "projectId">,
  ): Promise<WorkflowInstanceRow | null> {
    return workflowRepository.findLatestRunningRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "project",
      subjectId: input.projectId,
    });
  }

  private getCurrentStageCode(instance: WorkflowInstanceRow): string | null {
    const snapshot = instance.current_node_snapshot;
    if (!this.isRecord(snapshot)) return null;
    if (snapshot.node_type !== "procedure") return null;
    const config = snapshot.config;
    if (!this.isRecord(config)) return null;
    return typeof config.stage_key === "string" ? config.stage_key : null;
  }

  private buildOutput(input: SyncCustomerConfirmAcceptanceInput): JsonObject {
    return {
      source: "project_acceptance_customer_confirm",
      project_id: input.projectId,
      acceptance_id: input.acceptanceId,
      stage_code: input.stageCode,
      customer_id: input.customerId,
      comment: input.comment ?? null,
    };
  }

  private getNodeKey(node: JsonObject | null): string | null {
    const nodeKey = node?.node_key;
    return typeof nodeKey === "string" ? nodeKey : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }
}

export const projectAcceptanceWorkflowRuntimeService =
  new ProjectAcceptanceWorkflowRuntimeService();
