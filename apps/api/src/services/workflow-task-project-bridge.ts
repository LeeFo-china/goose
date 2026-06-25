import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import { projectProcedureAssignmentService } from "@/services/project-procedure-assignments";
import { projectSer } from "@/services/projects";
import { isFinalAcceptanceReportWorkflowNode } from "@/services/project-final-acceptance-workflow";
import { workflowSubjectsService } from "@/services/workflow-subjects";
import { PROJECT_STATUS_ACTION_VALUES } from "@gooes/domain";

type ProjectWorkflowSideEffectAction =
  | "confirm_proposal"
  | "sign_contract"
  | "finalize_design"
  | "schedule_construction"
  | "start_project"
  | "start_construction"
  | "start_acceptance"
  | "resume_project";

type ProjectWorkflowTaskOperation = {
  action: ProjectWorkflowSideEffectAction;
  payload: {
    action: ProjectWorkflowSideEffectAction;
    reason?: string;
    signed_amount?: unknown;
    start_date?: unknown;
    construction_manager_employee_id?: unknown;
    metadata?: Record<string, unknown>;
  };
};

type ResolveProjectWorkflowTaskOperationInput = {
  nodeKey: string;
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
  currentNodeSnapshot?: unknown;
};

type ProjectWorkflowTaskBridgeInput = {
  authContext: AuthContext;
  task: {
    id: string;
    tenant_id: string;
    instance_id: string;
    instance_node_id: string | null;
    node_key: string;
    instance: {
      subject_id: string;
      current_node_snapshot?: unknown;
    };
  };
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const PROJECT_NODE_EFFECTS: Partial<Record<string, ProjectWorkflowSideEffectAction>> = {
  designing: "confirm_proposal",
  proposal_confirmed: "sign_contract",
  signed: "finalize_design",
  design_finalized: "schedule_construction",
  pending_start: "start_project",
  started: "start_construction",
  construction_start: "start_construction",
  constructing: "start_acceptance",
  final_acceptance: "start_acceptance",
  on_hold: "resume_project",
};

const PROJECT_SIGNING_NODE_KEYS = new Set([
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
]);

const PROJECT_PROCEDURE_ACTIONS = new Set([
  "start_procedure",
  "adjust_procedure_schedule",
  "complete_procedure",
]);

const ProjectWorkflowEffectSchema = z.object({
  action: z.enum(PROJECT_STATUS_ACTION_VALUES, {
    message: "无效的项目 workflow 动作",
  }),
  reason: z.string().trim().max(500, "原因不能超过 500 个字符").nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  signed_amount: z.coerce
    .number("签约金额必须是数字")
    .min(0, "签约金额不能为负数")
    .nullable()
    .optional(),
  start_date: z.string()
    .trim()
    .min(1, "开工日期不能为空")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "开工日期格式必须为 YYYY-MM-DD")
    .nullable()
    .optional(),
  construction_manager_employee_id: z.uuid("请选择有效的工程负责人").nullable().optional(),
});

export function resolveProjectWorkflowTaskOperation(
  input: ResolveProjectWorkflowTaskOperationInput,
): ProjectWorkflowTaskOperation | null {
  if (input.action.trim() !== "complete") return null;
  if (isFinalAcceptanceReportNode(input)) return null;

  const action = PROJECT_NODE_EFFECTS[input.nodeKey];
  if (!action) return null;
  assertRequiredProjectWorkflowOutput({ action, output: input.output });

  return {
    action,
    payload: {
      action,
      reason: input.reason || optionalString(input.output.reason),
      signed_amount: input.output.signed_amount,
      start_date: input.output.start_date,
      construction_manager_employee_id: input.output.construction_manager_employee_id,
    },
  };
}

function assertRequiredProjectWorkflowOutput(input: {
  action: ProjectWorkflowSideEffectAction;
  output: Record<string, unknown>;
}) {
  if (input.action === "sign_contract") {
    const signedAmount = Number(input.output.signed_amount);
    if (!Number.isFinite(signedAmount) || signedAmount <= 0) {
      throw Errors.badRequest("项目签约时必须提供有效的 signed_amount");
    }
  }

  if (input.action === "schedule_construction") {
    const startDate = optionalString(input.output.start_date);
    if (!startDate) {
      throw Errors.badRequest("项目排期开工前必须先确定开工日期");
    }

    const constructionManagerEmployeeId = optionalString(
      input.output.construction_manager_employee_id,
    );
    if (!constructionManagerEmployeeId) {
      throw Errors.badRequest("请选择工程负责人");
    }
  }
}

export function shouldRequireProjectWorkflowRebuild(input: {
  workflowKey: string | null | undefined;
  nodeKey: string;
}): boolean {
  return PROJECT_SIGNING_NODE_KEYS.has(input.nodeKey) &&
    input.workflowKey !== "project_signing";
}

class WorkflowTaskProjectBridge {
  async complete(input: ProjectWorkflowTaskBridgeInput) {
    const trimmedAction = input.action.trim();
    if (PROJECT_PROCEDURE_ACTIONS.has(trimmedAction)) {
      return projectProcedureAssignmentService.handleWorkflowTaskAction({
        authContext: input.authContext,
        task: input.task,
        action: trimmedAction,
        reason: input.reason,
        output: input.output,
      });
    }

    const operation = resolveProjectWorkflowTaskOperation({
      nodeKey: input.task.node_key,
      action: trimmedAction,
      reason: input.reason,
      output: input.output,
      currentNodeSnapshot: input.task.instance.current_node_snapshot,
    });
    if (!operation) return null;

    const parsed = ProjectWorkflowEffectSchema.safeParse({
      ...operation.payload,
      metadata: {
        source: "workflow_task",
        workflow_node_key: input.task.node_key,
      },
    });
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    const projectId = input.task.instance.subject_id;
    const project = await projectSer.applyProjectWorkflowEffectForTenant({
      authContext: input.authContext,
      projectId,
      payload: parsed.data,
    });
    const workflowState = await workflowSubjectsService.getState(input.authContext, {
      subjectType: "project",
      subjectId: projectId,
    });

    return {
      result: {
        ok: true,
        bridged: true,
        operation: operation.action,
      },
      project,
      ...workflowState,
    };
  }
}

export const workflowTaskProjectBridge = new WorkflowTaskProjectBridge();

function isFinalAcceptanceReportNode(
  input: ResolveProjectWorkflowTaskOperationInput,
) {
  if (input.nodeKey !== "final_acceptance") return false;
  return isFinalAcceptanceReportWorkflowNode(
    input.currentNodeSnapshot as { node_key?: unknown } | null,
  );
}
