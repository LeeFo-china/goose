import {
  workflowRepository,
  type JsonObject,
  type WorkflowDefinitionRow,
  type WorkflowGraphResult,
  type WorkflowInstanceRow,
  type WorkflowNodeRow,
  type WorkflowRuntimeCompleteNodeResult,
} from "@/repositories/workflows";
import { assertRuntimeNodeCompletionAllowed } from "@/services/workflow-runtime-guards";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  getPreviousProjectConstructionStage,
  isProjectConstructionStageCode,
  type ProjectConstructionStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";

type ProjectAcceptanceWorkflowRuntimeStatus =
  | "advanced"
  | "already_advanced"
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
    if (!this.isWorkflowAcceptanceStageCode(input.stageCode)) {
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
      if (await this.isCurrentPaymentGateAfterStage(input, instance)) {
        await workflowSubjectStateService.syncFromRuntimeInstance({
          tenantId: input.tenantId,
          subjectType: "project",
          subjectId: input.projectId,
          definitionId: definition.id,
          instanceId: instance.id,
        });

        return {
          status: "already_advanced",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
          instance_id: instance.id,
          current_node_key: nodeKey,
          reason: "current_payment_gate_after_stage",
        };
      }

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

  private getCurrentStageCode(
    instance: WorkflowInstanceRow,
  ): ProjectLogStageCode | null {
    return this.getWorkflowStageCode(instance.current_node_snapshot);
  }

  private async isCurrentPaymentGateAfterStage(
    input: SyncCustomerConfirmAcceptanceInput,
    instance: WorkflowInstanceRow,
  ): Promise<boolean> {
    if (!instance.current_node_id || !instance.version_id) {
      return false;
    }

    const graph = await workflowRepository.getGraph({
      tenantId: input.tenantId,
      definitionId: instance.definition_id,
      versionId: instance.version_id,
    });
    if (!graph) {
      return false;
    }

    const currentNode = graph.nodes.find((node) =>
      node.id === instance.current_node_id
    ) ?? null;
    if (
      !this.isPaymentCollectionNode(currentNode) &&
      !this.isPaymentCollectionSnapshot(instance.current_node_snapshot)
    ) {
      return false;
    }

    const nextStageCode = this.getNextProcedureStageCode(graph, currentNode);
    if (!nextStageCode) {
      return false;
    }

    return getPreviousProjectConstructionStage(nextStageCode) === input.stageCode;
  }

  private getNextProcedureStageCode(
    graph: WorkflowGraphResult,
    currentNode: WorkflowNodeRow | null,
  ): ProjectConstructionStageCode | null {
    if (!currentNode) {
      return null;
    }

    const nextEdge = graph.edges
      .filter((edge) => edge.source_node_id === currentNode.id)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }
        return left.created_at.localeCompare(right.created_at);
      })[0];
    if (!nextEdge) {
      return null;
    }

    const nextNode = graph.nodes.find((node) =>
      node.id === nextEdge.target_node_id
    ) ?? null;
    return this.getProcedureStageCode(nextNode);
  }

  private getProcedureStageCode(
    node: WorkflowNodeRow | JsonObject | null,
  ): ProjectConstructionStageCode | null {
    if (!node || node.node_type !== "procedure") {
      return null;
    }

    const config = node.config;
    if (!this.isRecord(config)) {
      return null;
    }

    const stageKey = config.stage_key;
    return typeof stageKey === "string" && isProjectConstructionStageCode(stageKey)
      ? stageKey
      : null;
  }

  private getWorkflowStageCode(
    node: WorkflowNodeRow | JsonObject | null,
  ): ProjectLogStageCode | null {
    const procedureStageCode = this.getProcedureStageCode(node);
    if (procedureStageCode) {
      return procedureStageCode;
    }
    return this.isFinalAcceptanceNode(node)
      ? PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE
      : null;
  }

  private isWorkflowAcceptanceStageCode(
    stageCode: ProjectLogStageCode,
  ): boolean {
    return isProjectConstructionStageCode(stageCode) ||
      stageCode === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE;
  }

  private isFinalAcceptanceNode(
    node: WorkflowNodeRow | JsonObject | null,
  ): boolean {
    if (!node) return false;
    const config = this.isRecord(node.config) ? node.config : null;
    return node.business_kind === "final_acceptance" ||
      node.node_key === "final_acceptance" ||
      config?.stage_type === "final_acceptance";
  }

  private isPaymentCollectionNode(node: WorkflowNodeRow | null): boolean {
    return node?.business_kind === "payment_collection";
  }

  private isPaymentCollectionSnapshot(snapshot: unknown): boolean {
    return this.isRecord(snapshot) &&
      snapshot.business_kind === "payment_collection";
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
