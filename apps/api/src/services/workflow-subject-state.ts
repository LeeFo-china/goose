import {
  WORKFLOW_BUSINESS_KIND_VALUES,
  type WorkflowBusinessKind,
  type WorkflowInstanceStatus,
  type WorkflowSubjectType,
} from "@gooes/domain";
import {
  workflowSubjectStateRepository,
  type WorkflowRuntimeProjectionRow,
  type WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";

type SyncWorkflowSubjectStateInput = {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  subjectId: string;
  definitionId?: string | null;
  instanceId?: string | null;
};

type WorkflowSubjectStateInput = {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  subjectId: string;
};

type WorkflowSubjectStateListInput = {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  subjectIds: string[];
};

class WorkflowSubjectStateService {
  async syncFromRuntimeInstance(
    input: SyncWorkflowSubjectStateInput,
  ): Promise<WorkflowSubjectStateRow | null> {
    const instance = await this.findRuntimeInstance(input);
    if (!instance) {
      return workflowSubjectStateRepository.upsert({
        tenantId: input.tenantId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        definitionId: input.definitionId ?? null,
        instanceId: input.instanceId ?? null,
        instanceStatus: null,
        currentNodeKey: null,
        currentNodeTitle: null,
        currentBusinessKind: null,
        pendingTaskCount: 0,
      });
    }

    const pendingTaskCount = await workflowSubjectStateRepository.countPendingTasks({
      tenantId: input.tenantId,
      instanceId: instance.id,
    });
    const snapshot = this.getNodeSnapshot(instance);

    return workflowSubjectStateRepository.upsert({
      tenantId: input.tenantId,
      subjectType: instance.subject_type,
      subjectId: instance.subject_id,
      definitionId: instance.definition_id,
      instanceId: instance.id,
      instanceStatus: instance.status,
      currentNodeKey: instance.current_node_key,
      currentNodeTitle: this.getString(snapshot, "title"),
      currentBusinessKind: this.getBusinessKind(snapshot),
      pendingTaskCount,
    });
  }

  async getSubjectState(
    input: WorkflowSubjectStateInput,
  ): Promise<WorkflowSubjectStateRow | null> {
    const existing = await workflowSubjectStateRepository.find(input);
    const latestRuntimeInstance = await workflowSubjectStateRepository
      .findLatestRuntimeInstance(input);

    if (existing && this.matchesRuntimeProjection(existing, latestRuntimeInstance)) {
      return existing;
    }

    return this.syncFromRuntimeInstance(input);
  }

  async listSubjectStates(
    input: WorkflowSubjectStateListInput,
  ): Promise<WorkflowSubjectStateRow[]> {
    return workflowSubjectStateRepository.listBySubjectIds(input);
  }

  private async findRuntimeInstance(input: SyncWorkflowSubjectStateInput) {
    if (input.instanceId && input.definitionId) {
      const instance = await workflowSubjectStateRepository.findLatestRuntimeInstance({
        tenantId: input.tenantId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      });

      if (instance?.id === input.instanceId) {
        return instance;
      }
    }

    return workflowSubjectStateRepository.findLatestRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    });
  }

  private matchesRuntimeProjection(
    state: WorkflowSubjectStateRow,
    instance: WorkflowRuntimeProjectionRow | null,
  ): boolean {
    if (!instance) {
      return state.instance_id === null &&
        state.instance_status === null &&
        state.current_node_key === null;
    }

    return state.definition_id === instance.definition_id &&
      state.instance_id === instance.id &&
      state.instance_status === instance.status &&
      state.current_node_key === instance.current_node_key;
  }

  private getNodeSnapshot(
    instance: Pick<WorkflowRuntimeProjectionRow, "current_node_snapshot">,
  ): Record<string, unknown> {
    const snapshot = instance.current_node_snapshot;
    return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot
      : {};
  }

  private getString(
    source: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = source[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private getBusinessKind(
    source: Record<string, unknown>,
  ): WorkflowBusinessKind | null {
    const value = this.getString(source, "business_kind");
    return value && WORKFLOW_BUSINESS_KIND_VALUES.includes(value as WorkflowBusinessKind)
      ? value as WorkflowBusinessKind
      : null;
  }
}

export const workflowSubjectStateService = new WorkflowSubjectStateService();
export type {
  WorkflowInstanceStatus,
  WorkflowSubjectStateInput,
  WorkflowSubjectStateListInput,
  WorkflowSubjectType,
};
