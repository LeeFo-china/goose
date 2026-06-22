import {
  workflowRepository,
  type JsonObject,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";
import {
  resolveProjectConstructionWorkflowDefinition,
} from "@/services/project-construction-workflow-selection";
import { assertRuntimeNodeCompletionAllowed } from "@/services/workflow-runtime-guards";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import type { ProjectStatus, ProjectStatusAction } from "@gooes/domain";

const PROJECT_SIGNING_WORKFLOW_KEYS = ["project_signing", "project_main"] as const;
const PROJECT_CONSTRUCTION_WORKFLOW_KEYS = ["construction_main"] as const;
const PROJECT_WORKFLOW_KEYS = [
  ...PROJECT_SIGNING_WORKFLOW_KEYS,
  ...PROJECT_CONSTRUCTION_WORKFLOW_KEYS,
] as const;
type ProjectWorkflowKey = typeof PROJECT_WORKFLOW_KEYS[number];

export type ProjectWorkflowRuntimeMetadata = {
  status: "started" | "advanced" | "skipped" | "failed";
  workflow_key?: string;
  definition_id?: string;
  instance_id?: string;
  node_key?: string;
  current_node_key?: string | null;
  next_node_key?: string | null;
  reason?: string;
  error_message?: string;
};

type ApplyProjectWorkflowEffectInput = {
  authContext: AuthContext;
  tenantId: string;
  projectId: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  action: ProjectStatusAction;
  reason?: string | null;
  source?: string;
  extraContext?: Record<string, unknown>;
};

type SyncProjectCreatedInput = {
  authContext: AuthContext;
  tenantId: string;
  projectId: string;
  source?: string;
  extraContext?: Record<string, unknown>;
};

class ProjectWorkflowRuntimeService {
  async syncProjectCreated(
    input: SyncProjectCreatedInput,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    try {
      const definition = await this.findActiveProjectWorkflow(
        input.tenantId,
        PROJECT_SIGNING_WORKFLOW_KEYS,
      );
      if (!definition) {
        return {
          status: "skipped",
          reason: "active_project_workflow_not_found",
        };
      }

      const existing = await this.findRunningProjectInstance(input, definition.id);
      if (existing) {
        await workflowSubjectStateService.syncFromRuntimeInstance({
          tenantId: input.tenantId,
          subjectType: "project",
          subjectId: input.projectId,
          definitionId: definition.id,
          instanceId: existing.id,
        });

        return {
          status: "skipped",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
          instance_id: existing.id,
          current_node_key: existing.current_node_key,
          reason: "running_instance_exists",
        };
      }

      const result = await workflowRepository.startRuntimeInstance({
        tenantId: input.tenantId,
        definitionId: definition.id,
        subjectType: "project",
        subjectId: input.projectId,
        startedBy: input.authContext.employeeId,
        context: this.buildProjectCreatedContext(input),
      });

      if (!result.ok) {
        return {
          status: "failed",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
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
        status: "started",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: result.instance.id,
        current_node_key: result.instance.current_node_key,
      };
    } catch (error) {
      return {
        status: "failed",
        reason: "exception",
        error_message: this.getErrorMessage(error),
      };
    }
  }

  async applyWorkflowEffect(
    input: ApplyProjectWorkflowEffectInput,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    try {
      return await this.applyWorkflowEffectUnsafe(input);
    } catch (error) {
      return {
        status: "failed",
        reason: "exception",
        error_message: this.getErrorMessage(error),
      };
    }
  }

  async applyWorkflowEffectAndSubjectState(
    input: ApplyProjectWorkflowEffectInput,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    const metadata = await this.applyWorkflowEffect(input);
    await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "project",
      subjectId: input.projectId,
    });

    return metadata;
  }

  private async applyWorkflowEffectUnsafe(
    input: ApplyProjectWorkflowEffectInput,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    const definition = await this.findActiveProjectWorkflow(
      input.tenantId,
      this.getWorkflowKeysForAction(input.action),
    );
    if (!definition) {
      return {
        status: "skipped",
        reason: "active_project_workflow_not_found",
      };
    }

    let instance = await this.findRunningProjectInstance(input, definition.id);
    if (!instance) {
      if (!this.canStartWorkflowForAction(input)) {
        return {
          status: "skipped",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
          reason: "running_instance_not_found",
        };
      }

      const startResult = await this.startProjectWorkflow(input, definition);
      if (startResult.status !== "started" || !startResult.instance_id) {
        return startResult;
      }

      instance = await this.findRunningProjectInstance(input, definition.id);
      if (!instance) {
        return {
          status: "failed",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
          instance_id: startResult.instance_id,
          reason: "started_instance_not_found",
        };
      }
    }

    const nodeKey = this.getNodeKeyForAction(input, instance);
    if (!nodeKey) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        reason: "action_not_bound_to_runtime_node",
      };
    }

    const result = await this.advanceProjectWorkflow(
      input,
      definition,
      instance,
      nodeKey,
    );
    if (result.status === "advanced" && input.action === "start_project") {
      const constructionResult = await this.startConstructionWorkflow(input);
      if (constructionResult.status !== "skipped") {
        return constructionResult;
      }
    }

    return result;
  }

  private async startProjectWorkflow(
    input: ApplyProjectWorkflowEffectInput,
    definition: WorkflowDefinitionRow,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    const result = await workflowRepository.startRuntimeInstance({
      tenantId: input.tenantId,
      definitionId: definition.id,
      subjectType: "project",
      subjectId: input.projectId,
      startedBy: input.authContext.employeeId,
      context: this.buildRuntimeContext(input),
    });

    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: result.reason,
      };
    }

    return {
      status: "started",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      current_node_key: result.instance.current_node_key,
    };
  }

  private async advanceProjectWorkflow(
    input: ApplyProjectWorkflowEffectInput,
    definition: WorkflowDefinitionRow,
    instance: WorkflowInstanceRow,
    nodeKey: string,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    const output = this.buildRuntimeContext(input);
    await assertRuntimeNodeCompletionAllowed({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey,
      action: input.action,
      output,
    });

    const result = await workflowRepository.completeRuntimeNode({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey,
      action: input.action,
      actorEmployeeId: input.authContext.employeeId,
      output,
    });

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

    return {
      status: "advanced",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      node_key: nodeKey,
      current_node_key: result.instance.current_node_key,
      next_node_key: this.getNextNodeKey(result.nextNode),
    };
  }

  private async findActiveProjectWorkflow(
    tenantId: string,
    workflowKeys: readonly ProjectWorkflowKey[] = PROJECT_WORKFLOW_KEYS,
  ): Promise<WorkflowDefinitionRow | null> {
    for (const workflowKey of workflowKeys) {
      const definition = await workflowRepository.findDefinitionByKey(
        tenantId,
        workflowKey,
      );
      if (definition?.status === "active" && definition.active_version_id) {
        return definition;
      }
    }

    return null;
  }

  private async findRunningProjectInstance(
    input: Pick<ApplyProjectWorkflowEffectInput, "tenantId" | "projectId">,
    definitionId: string,
  ): Promise<WorkflowInstanceRow | null> {
    const result = await workflowRepository.listRuntimeInstances({
      tenantId: input.tenantId,
      definitionId,
      subjectType: "project",
      subjectId: input.projectId,
      status: "running",
      page: 1,
      pageSize: 1,
    });

    return result.list[0] ?? null;
  }

  private getNodeKeyForAction(
    input: Pick<ApplyProjectWorkflowEffectInput, "action" | "fromStatus">,
    instance: WorkflowInstanceRow,
  ): string | null {
    switch (input.action) {
      case "confirm_proposal":
        return "designing";
      case "sign_contract":
        return "proposal_confirmed";
      case "finalize_design":
        return "signed";
      case "schedule_construction":
        return "design_finalized";
      case "start_project":
        return "pending_start";
      case "start_construction":
        return "started";
      case "start_acceptance":
        return instance.current_node_key === "constructing"
          ? "constructing"
          : "final_acceptance";
      case "pause_project":
      case "mark_invalid":
        return input.fromStatus;
      case "resume_project":
        return "on_hold";
    }
  }

  private getWorkflowKeysForAction(
    action: ProjectStatusAction,
  ): readonly ProjectWorkflowKey[] {
    switch (action) {
      case "start_construction":
      case "start_acceptance":
        return PROJECT_CONSTRUCTION_WORKFLOW_KEYS;
      case "confirm_proposal":
      case "sign_contract":
      case "finalize_design":
      case "schedule_construction":
      case "start_project":
        return PROJECT_SIGNING_WORKFLOW_KEYS;
      case "pause_project":
      case "resume_project":
      case "mark_invalid":
        return PROJECT_WORKFLOW_KEYS;
    }
  }

  private canStartWorkflowForAction(input: ApplyProjectWorkflowEffectInput) {
    return input.fromStatus === "designing" || input.action === "start_construction";
  }

  private async startConstructionWorkflow(
    input: ApplyProjectWorkflowEffectInput,
  ): Promise<ProjectWorkflowRuntimeMetadata> {
    const definition = await resolveProjectConstructionWorkflowDefinition({
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
    if (!definition) {
      return {
        status: "skipped",
        reason: "active_construction_workflow_not_found",
      };
    }

    const existing = await this.findRunningProjectInstance(input, definition.id);
    if (existing) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: existing.id,
        current_node_key: existing.current_node_key,
        reason: "running_instance_exists",
      };
    }

    const result = await workflowRepository.startRuntimeInstance({
      tenantId: input.tenantId,
      definitionId: definition.id,
      subjectType: "project",
      subjectId: input.projectId,
      startedBy: input.authContext.employeeId,
      context: this.buildRuntimeContext({
        ...input,
        source: "project_signing_completed",
      }),
    });

    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
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
      status: "started",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      current_node_key: result.instance.current_node_key,
    };
  }

  private buildRuntimeContext(
    input: ApplyProjectWorkflowEffectInput,
  ): JsonObject {
    return {
      source: input.source ?? "workflow_effect",
      project_id: input.projectId,
      project_workflow_action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      paused_from_status: input.action === "resume_project"
        ? input.toStatus
        : input.fromStatus,
      reason: input.reason ?? null,
      operator_employee_id: input.authContext.employeeId ?? null,
      operator_auth_user_id: input.authContext.authUserId ?? null,
      ...(input.extraContext ?? {}),
    };
  }

  private buildProjectCreatedContext(input: SyncProjectCreatedInput): JsonObject {
    return {
      source: input.source ?? "project_create",
      project_id: input.projectId,
      operator_employee_id: input.authContext.employeeId ?? null,
      operator_auth_user_id: input.authContext.authUserId ?? null,
      ...(input.extraContext ?? {}),
    };
  }

  private getNextNodeKey(node: JsonObject | null): string | null {
    const nodeKey = node?.node_key;
    return typeof nodeKey === "string" ? nodeKey : null;
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "项目流程运行同步失败";
  }
}

export const projectWorkflowRuntimeService = new ProjectWorkflowRuntimeService();
