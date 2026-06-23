import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  projectProcedureAssignmentRepository,
} from "@/repositories/project-procedure-assignments";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import type { ProjectProcedureCandidatesQuery } from "@/schema/project-procedure-assignments";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import {
  calculatePlannedEndDate,
  getEffectiveAssignmentStatus,
} from "./status";
import { assertAssignmentCanCreateProjectLog } from "./log-gate";
import {
  readCandidateDepartmentCodes,
  serializeProcedureCandidate,
} from "./candidates";
import type { ProcedureAssignmentRow } from "./types";

type AssignmentRepositoryLike = Pick<
  typeof projectProcedureAssignmentRepository,
  | "findActiveByNode"
  | "findActiveByProjectStage"
  | "listActiveForProject"
  | "listTenantDepartmentIdsByCodes"
  | "listCandidateEmployees"
  | "listOverlappingAssignments"
  | "createAssignment"
  | "updateAssignmentSchedule"
  | "markAssignmentCompleted"
>;

type WorkflowTaskRepositoryLike = Pick<typeof workflowTaskRepository, "findById">;

type ProcedureWorkflowTask = {
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

type ProcedureAssignmentResult = {
  assignment: ProcedureAssignmentRow;
  idempotent?: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ProjectProcedureAssignmentService {
  constructor(
    private readonly repository: AssignmentRepositoryLike =
      projectProcedureAssignmentRepository,
    private readonly tasks: WorkflowTaskRepositoryLike = workflowTaskRepository,
  ) {}

  async handleWorkflowTaskAction(input: {
    authContext: AuthContext;
    task: ProcedureWorkflowTask;
    action: string;
    reason: string | null;
    output: Record<string, unknown>;
  }) {
    const tenantId = this.assertTenantId(input.authContext);
    const requiresAssignment = this.shouldRequireAssignmentForTask(input.task);
    if (input.action === "complete_procedure" && !requiresAssignment) {
      return null;
    }

    const stageCode = this.readStageCode(input.task);
    const common = {
      tenantId,
      projectId: input.task.instance.subject_id,
      workflowInstanceId: input.task.instance_id,
      workflowInstanceNodeId: input.task.instance_node_id,
      nodeKey: input.task.node_key,
      stageCode,
      taskAction: input.action,
      operatorEmployeeId: input.authContext.employeeId,
      output: input.output,
    };

    if (input.action === "start_procedure") {
      const started = await this.startProcedure(common);
      return this.buildBridgeResult("start_procedure", started);
    }

    if (input.action === "adjust_procedure_schedule") {
      const adjusted = await this.adjustProcedureSchedule({
        ...common,
        reason: input.reason,
      });
      return this.buildBridgeResult("adjust_procedure_schedule", adjusted);
    }

    if (input.action === "complete_procedure") {
      await this.completeProcedureGate(common);
      return null;
    }

    throw Errors.business(
      409,
      "当前流程动作已变化，请刷新后重试",
      ErrorCodes.WORKFLOW_ACTION_STALE,
    );
  }

  async startProcedure(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    nodeKey: string;
    stageCode: string;
    taskAction: string;
    operatorEmployeeId: string | null | undefined;
    output: Record<string, unknown>;
  }): Promise<ProcedureAssignmentResult> {
    if (input.taskAction !== "start_procedure") {
      throw this.staleActionError();
    }

    const payload = this.readSchedulePayload(input.output);
    const active = await this.findActiveByNode(input);
    if (active) {
      if (this.isSameSchedulePayload(active, payload)) {
        return { assignment: active, idempotent: true };
      }

      throw Errors.business(
        409,
        "工序派工已存在，请刷新后调整派工",
        ErrorCodes.WORKFLOW_ACTION_STALE,
      );
    }

    const assignment = await this.repository.createAssignment({
      tenantId: input.tenantId,
      projectId: input.projectId,
      workflowInstanceId: input.workflowInstanceId,
      workflowInstanceNodeId: input.workflowInstanceNodeId,
      nodeKey: input.nodeKey,
      stageCode: input.stageCode,
      assigneeEmployeeId: payload.assigneeEmployeeId,
      plannedStartDate: payload.plannedStartDate,
      plannedDurationDays: payload.plannedDurationDays,
      status: this.resolveInitialStatus(payload.plannedStartDate),
      operatorEmployeeId: input.operatorEmployeeId ?? null,
    });

    return { assignment };
  }

  async adjustProcedureSchedule(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    nodeKey: string;
    stageCode: string;
    taskAction: string;
    operatorEmployeeId: string | null | undefined;
    output: Record<string, unknown>;
    reason: string | null;
  }): Promise<ProcedureAssignmentResult> {
    if (input.taskAction !== "adjust_procedure_schedule") {
      throw this.staleActionError();
    }

    const payload = this.readSchedulePayload(input.output);
    const active = await this.findActiveByNode(input);
    if (!active) {
      throw Errors.business(
        409,
        "请先开始当前工序派工",
        ErrorCodes.PROCEDURE_ASSIGNMENT_REQUIRED,
      );
    }

    const assignment = await this.repository.updateAssignmentSchedule({
      tenantId: input.tenantId,
      assignmentId: active.id,
      assigneeEmployeeId: payload.assigneeEmployeeId,
      plannedStartDate: payload.plannedStartDate,
      plannedDurationDays: payload.plannedDurationDays,
      status: this.resolveInitialStatus(payload.plannedStartDate),
      operatorEmployeeId: input.operatorEmployeeId ?? null,
      reason: input.reason,
    });

    return { assignment };
  }

  async completeProcedureGate(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    nodeKey: string;
  }): Promise<ProcedureAssignmentResult> {
    const active = await this.findActiveByNode(input);
    if (!active) {
      throw Errors.business(
        409,
        "请先开始当前工序派工",
        ErrorCodes.PROCEDURE_ASSIGNMENT_REQUIRED,
      );
    }

    const effectiveStatus = getEffectiveAssignmentStatus({
      status: active.status,
      plannedStartDate: active.planned_start_date,
      tenantToday: this.getToday(),
    });
    if (effectiveStatus !== "in_progress") {
      throw Errors.business(
        409,
        "当前工序尚未开工，不能完成工序",
        ErrorCodes.PROCEDURE_NOT_IN_PROGRESS,
      );
    }

    return { assignment: active };
  }

  shouldRequireAssignmentForTask(task: {
    instance: { current_node_snapshot?: unknown };
  }): boolean {
    const snapshot = asRecord(task.instance.current_node_snapshot);
    const config = asRecord(snapshot?.config);
    return config?.require_procedure_assignment !== false;
  }

  async markProcedureCompleted(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    nodeKey: string;
    operatorEmployeeId: string | null | undefined;
  }): Promise<ProcedureAssignmentResult> {
    const active = await this.findActiveByNode(input);
    if (!active) {
      throw Errors.business(
        409,
        "请先开始当前工序派工",
        ErrorCodes.PROCEDURE_ASSIGNMENT_REQUIRED,
      );
    }

    const assignment = await this.repository.markAssignmentCompleted({
      tenantId: input.tenantId,
      assignmentId: active.id,
      operatorEmployeeId: input.operatorEmployeeId ?? null,
    });

    return { assignment };
  }

  async listProjectAssignmentsForRuntime(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
  }): Promise<ProcedureAssignmentRow[]> {
    return this.repository.listActiveForProject(input);
  }

  async assertCanCreateProjectLog(input: {
    authContext: AuthContext;
    projectId: string;
    stageCode: string;
  }): Promise<void> {
    const tenantId = this.assertTenantId(input.authContext);
    const active = await this.repository.findActiveByProjectStage({
      tenantId,
      projectId: input.projectId,
      stageCode: input.stageCode,
    });
    assertAssignmentCanCreateProjectLog({
      assignment: active,
      tenantToday: this.getToday(),
    });
  }

  async listCandidates(input: {
    authContext: AuthContext;
    projectId: string;
    query: ProjectProcedureCandidatesQuery;
  }) {
    const tenantId = this.assertTenantId(input.authContext);
    accessPolicyService.assertPermission(
      input.authContext,
      "project_procedure.assign",
    );

    const task = await this.tasks.findById({
      tenantId,
      taskId: input.query.task_id,
    });
    if (!task?.instance || task.instance.subject_id !== input.projectId) {
      throw Errors.business(
        409,
        "当前工序待办已变化，请刷新后重试",
        ErrorCodes.WORKFLOW_ACTION_STALE,
      );
    }

    const config = this.readNodeConfig(task.instance.current_node_snapshot);
    const departmentCodes = readCandidateDepartmentCodes(
      config.candidate_department_codes,
    );
    const tenantDepartmentIds = departmentCodes.length > 0
      ? await this.repository.listTenantDepartmentIdsByCodes({
        tenantId,
        departmentCodes,
      })
      : undefined;
    const plannedEndDate = calculatePlannedEndDate(
      input.query.planned_start_date,
      input.query.planned_duration_days,
    );
    const candidates = await this.repository.listCandidateEmployees({
      tenantId,
      tenantDepartmentIds,
      keyword: input.query.keyword,
      page: input.query.page,
      pageSize: input.query.pageSize,
    });
    const overlaps = await this.repository.listOverlappingAssignments({
      tenantId,
      assigneeEmployeeIds: candidates.list.map((employee) => employee.id),
      plannedStartDate: input.query.planned_start_date,
      plannedEndDate,
    });
    const overlapByEmployeeId = new Map(
      overlaps.map((overlap) => [overlap.assignee_employee_id, overlap]),
    );

    return {
      list: candidates.list.map((employee) =>
        serializeProcedureCandidate({
          employee,
          overlap: overlapByEmployeeId.get(employee.id) ?? null,
          tenantToday: this.getToday(),
        })
      ),
      pagination: candidates.pagination,
      meta: {
        planned_start_date: input.query.planned_start_date,
        planned_duration_days: input.query.planned_duration_days,
        planned_end_date: plannedEndDate,
        candidate_department_codes: departmentCodes,
      },
    };
  }

  private async findActiveByNode(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    nodeKey: string;
  }) {
    return this.repository.findActiveByNode({
      tenantId: input.tenantId,
      projectId: input.projectId,
      workflowInstanceId: input.workflowInstanceId,
      nodeKey: input.nodeKey,
    });
  }

  private readSchedulePayload(output: Record<string, unknown>) {
    return {
      assigneeEmployeeId: this.readUuid(
        output.assignee_employee_id,
        "请选择施工人员",
      ),
      plannedStartDate: this.readDate(
        output.planned_start_date,
        "请选择开工日期",
      ),
      plannedDurationDays: this.readPositiveInteger(
        output.planned_duration_days,
        "请输入有效工期",
      ),
    };
  }

  private isSameSchedulePayload(
    assignment: ProcedureAssignmentRow,
    payload: ReturnType<ProjectProcedureAssignmentService["readSchedulePayload"]>,
  ) {
    return assignment.assignee_employee_id === payload.assigneeEmployeeId &&
      assignment.planned_start_date === payload.plannedStartDate &&
      assignment.planned_duration_days === payload.plannedDurationDays;
  }

  private readUuid(value: unknown, message: string): string {
    if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
      throw Errors.badRequest(message);
    }

    return value.trim();
  }

  private readDate(value: unknown, message: string): string {
    if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
      throw Errors.badRequest(message);
    }

    return value.trim();
  }

  private readPositiveInteger(value: unknown, message: string): number {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(numericValue) || numericValue <= 0 || numericValue > 365) {
      throw Errors.badRequest(message);
    }

    return numericValue;
  }

  private readStageCode(task: ProcedureWorkflowTask): string {
    const config = this.readNodeConfig(task.instance.current_node_snapshot);
    const stageCode = config?.stage_key;
    if (typeof stageCode === "string" && stageCode.trim()) {
      return stageCode.trim();
    }

    throw Errors.business(
      409,
      "当前工序节点缺少阶段编码",
      ErrorCodes.WORKFLOW_ACTION_STALE,
    );
  }

  private resolveInitialStatus(plannedStartDate: string): "planned" | "in_progress" {
    return plannedStartDate <= this.getToday() ? "in_progress" : "planned";
  }

  private readNodeConfig(currentNodeSnapshot: unknown): Record<string, unknown> {
    const snapshot = asRecord(currentNodeSnapshot);
    return asRecord(snapshot?.config) ?? {};
  }

  private getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private assertTenantId(authContext: AuthContext): string {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    if (!tenantId) {
      throw Errors.business(403, "缺少租户上下文", "TENANT_CONTEXT_REQUIRED");
    }

    return tenantId;
  }

  private staleActionError() {
    return Errors.business(
      409,
      "当前流程动作已变化，请刷新后重试",
      ErrorCodes.WORKFLOW_ACTION_STALE,
    );
  }

  private buildBridgeResult(
    operation: "start_procedure" | "adjust_procedure_schedule",
    result: ProcedureAssignmentResult,
  ) {
    return {
      result: {
        ok: true,
        bridged: true,
        operation,
        idempotent: Boolean(result.idempotent),
      },
      procedure_assignment: result.assignment,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export const projectProcedureAssignmentService =
  new ProjectProcedureAssignmentService();
