import { describe, expect, test } from "bun:test";
import { ErrorCodes } from "@/errors/error-codes";
import { ProjectProcedureAssignmentService } from "./service";
import type { ProcedureAssignmentRow } from "./types";

const baseAssignment: ProcedureAssignmentRow = {
  id: "assignment-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  workflow_instance_id: "instance-1",
  workflow_instance_node_id: "node-1",
  node_key: "procedure_demolition",
  stage_code: "demolition",
  assignee_employee_id: "11111111-1111-4111-8111-111111111111",
  planned_start_date: "2026-06-24",
  planned_duration_days: 3,
  planned_end_date: "2026-06-26",
  status: "planned",
  started_by_employee_id: "manager-1",
  started_at: "2026-06-23T00:00:00.000Z",
  completed_by_employee_id: null,
  completed_at: null,
  adjusted_by_employee_id: null,
  adjusted_at: null,
  adjust_reason: null,
  created_at: "2026-06-23T00:00:00.000Z",
  updated_at: "2026-06-23T00:00:00.000Z",
};

describe("ProjectProcedureAssignmentService", () => {
  test("rejects start when an active assignment already exists with a different payload", async () => {
    const service = new ProjectProcedureAssignmentService({
      findActiveByNode: async () => baseAssignment,
    } as never);

    await expect(service.startProcedure({
      tenantId: "tenant-1",
      projectId: "project-1",
      workflowInstanceId: "instance-1",
      workflowInstanceNodeId: "node-1",
      nodeKey: "procedure_demolition",
      stageCode: "demolition",
      taskAction: "start_procedure",
      operatorEmployeeId: "manager-1",
      output: {
        assignee_employee_id: "22222222-2222-4222-8222-222222222222",
        planned_start_date: "2026-06-24",
        planned_duration_days: 3,
      },
    })).rejects.toMatchObject({ code: ErrorCodes.WORKFLOW_ACTION_STALE });
  });

  test("treats repeated start with the same payload as idempotent", async () => {
    const service = new ProjectProcedureAssignmentService({
      findActiveByNode: async () => baseAssignment,
    } as never);

    await expect(service.startProcedure({
      tenantId: "tenant-1",
      projectId: "project-1",
      workflowInstanceId: "instance-1",
      workflowInstanceNodeId: "node-1",
      nodeKey: "procedure_demolition",
      stageCode: "demolition",
      taskAction: "start_procedure",
      operatorEmployeeId: "manager-1",
      output: {
        assignee_employee_id: "11111111-1111-4111-8111-111111111111",
        planned_start_date: "2026-06-24",
        planned_duration_days: 3,
      },
    })).resolves.toMatchObject({
      assignment: baseAssignment,
      idempotent: true,
    });
  });

  test("lets procedure completion fall through when assignment is disabled", async () => {
    let queried = false;
    const service = new ProjectProcedureAssignmentService({
      findActiveByNode: async () => {
        queried = true;
        return null;
      },
    } as never);

    await expect(service.handleWorkflowTaskAction({
      authContext: {
        tenantId: "tenant-1",
        employeeId: "manager-1",
        permissions: [],
        roleCodes: [],
      } as never,
      task: {
        id: "task-1",
        tenant_id: "tenant-1",
        instance_id: "instance-1",
        instance_node_id: "node-1",
        node_key: "procedure_demolition",
        instance: {
          subject_id: "project-1",
          current_node_snapshot: {
            config: {
              stage_key: "demolition",
              require_procedure_assignment: false,
            },
          },
        },
      },
      action: "complete_procedure",
      reason: null,
      output: {},
    })).resolves.toBeNull();
    expect(queried).toBe(false);
  });
});
