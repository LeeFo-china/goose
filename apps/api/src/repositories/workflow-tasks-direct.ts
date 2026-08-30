import type { WorkflowSubjectType } from "@gooes/domain";

import type {
  WorkflowTaskActionRow,
  WorkflowTaskListInput,
  WorkflowTaskListResult,
  WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import { getDirectPostgresSql } from "@/utils/postgres-direct";

type WorkflowTaskAssigneeInput = Pick<
  WorkflowTaskListInput,
  "employeeId" | "roleCodes" | "permissionCodes"
>;

type WorkflowTaskAssigneeScope = {
  employeeId?: string | null;
  roleCodes: string[];
  permissionCodes: string[];
};

type WorkflowTaskDirectRow = WorkflowTaskWithInstanceRow & {
  total_count?: number | string | bigint | null;
};

const SAFE_ROLE_CODE_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const SAFE_PERMISSION_CODE_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

export function buildWorkflowTaskAssigneeScope(
  input: WorkflowTaskAssigneeInput,
): WorkflowTaskAssigneeScope {
  return {
    employeeId: input.employeeId,
    roleCodes: Array.from(new Set(input.roleCodes ?? []))
      .filter((roleCode) => SAFE_ROLE_CODE_PATTERN.test(roleCode)),
    permissionCodes: Array.from(new Set(input.permissionCodes ?? []))
      .filter((permissionCode) =>
        SAFE_PERMISSION_CODE_PATTERN.test(permissionCode)
      ),
  };
}

export async function listAccessibleTasksViaDirectSql(params: {
  input: WorkflowTaskListInput;
  page: number;
  pageSize: number;
  offset: number;
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>;
}): Promise<WorkflowTaskListResult> {
  const { input, page, pageSize, offset, sql } = params;
  const status = input.status ?? "pending";
  const subjectTypeFilter = input.subjectType
    ? sql`AND instance.subject_type = ${input.subjectType}`
    : sql``;
  const subjectIdFilter = input.subjectId
    ? sql`AND instance.subject_id = ${input.subjectId}`
    : sql``;
  const instanceFilter = input.instanceId
    ? sql`AND task.instance_id = ${input.instanceId}::uuid`
    : sql``;
  const assigneePredicate = buildDirectAssigneePredicate(sql, input);

  const rows = await sql<WorkflowTaskDirectRow[]>`
    SELECT
      task.id,
      task.tenant_id,
      task.instance_id,
      task.instance_node_id,
      task.definition_id,
      task.version_id,
      task.node_id,
      task.node_key,
      task.node_type,
      task.title,
      task.status,
      task.assignee_employee_id,
      task.assignee_role_code,
      task.assignee_permission_code,
      CASE
        WHEN employee.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', employee.id,
          'name', employee.name,
          'avatar', employee.avatar
        )
      END AS assignee_employee,
      task.due_at::text AS due_at,
      task.completed_by,
      task.completed_at::text AS completed_at,
      task.created_at::text AS created_at,
      task.updated_at::text AS updated_at,
      jsonb_build_object(
        'id', instance.id,
        'subject_type', instance.subject_type,
        'subject_id', instance.subject_id,
        'status', instance.status,
        'current_node_key', instance.current_node_key,
        'current_node_snapshot', instance.current_node_snapshot
      ) AS instance,
      count(*) OVER() AS total_count
    FROM public.workflow_tasks AS task
    JOIN public.workflow_instances AS instance
      ON instance.id = task.instance_id
      AND instance.tenant_id = task.tenant_id
    LEFT JOIN public.employees AS employee
      ON employee.id = task.assignee_employee_id
      AND employee.tenant_id = task.tenant_id
    WHERE task.tenant_id = ${input.tenantId}::uuid
      AND task.status = ${status}
      ${subjectTypeFilter}
      ${subjectIdFilter}
      ${instanceFilter}
      AND (${assigneePredicate})
    ORDER BY task.updated_at DESC
    OFFSET ${offset}
    LIMIT ${pageSize}
  `;

  const total = Number(rows[0]?.total_count ?? 0);
  return {
    list: toWorkflowTaskRows(rows),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}

export async function listAccessiblePendingByProjectIdsViaDirectSql(input: {
  tenantId: string;
  employeeId?: string | null;
  roleCodes?: string[];
  permissionCodes?: string[];
  projectIds: string[];
  limit: number;
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>;
}): Promise<WorkflowTaskWithInstanceRow[]> {
  const assigneePredicate = buildDirectAssigneePredicate(input.sql, input);
  const rows = await input.sql<WorkflowTaskDirectRow[]>`
    SELECT
      task.id,
      task.tenant_id,
      task.instance_id,
      task.instance_node_id,
      task.definition_id,
      task.version_id,
      task.node_id,
      task.node_key,
      task.node_type,
      task.title,
      task.status,
      task.assignee_employee_id,
      task.assignee_role_code,
      task.assignee_permission_code,
      CASE
        WHEN employee.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', employee.id,
          'name', employee.name,
          'avatar', employee.avatar
        )
      END AS assignee_employee,
      task.due_at::text AS due_at,
      task.completed_by,
      task.completed_at::text AS completed_at,
      task.created_at::text AS created_at,
      task.updated_at::text AS updated_at,
      jsonb_build_object(
        'id', instance.id,
        'subject_type', instance.subject_type,
        'subject_id', instance.subject_id,
        'status', instance.status,
        'current_node_key', instance.current_node_key,
        'current_node_snapshot', instance.current_node_snapshot
      ) AS instance
    FROM public.workflow_tasks AS task
    JOIN public.workflow_instances AS instance
      ON instance.id = task.instance_id
      AND instance.tenant_id = task.tenant_id
    LEFT JOIN public.employees AS employee
      ON employee.id = task.assignee_employee_id
      AND employee.tenant_id = task.tenant_id
    WHERE task.tenant_id = ${input.tenantId}::uuid
      AND task.status = 'pending'
      AND instance.subject_type = 'project'
      AND instance.subject_id IN ${input.sql(input.projectIds)}
      AND (${assigneePredicate})
    ORDER BY task.created_at ASC
    LIMIT ${input.limit}
  `;

  return toWorkflowTaskRows(rows);
}

export async function listAccessiblePendingBySubjectIdsViaDirectSql(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  subjectIds: string[];
  employeeId?: string | null;
  roleCodes?: string[];
  permissionCodes?: string[];
  limit: number;
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>;
}): Promise<WorkflowTaskActionRow[]> {
  const assigneePredicate = buildDirectAssigneePredicate(input.sql, input);
  const rows = await input.sql<WorkflowTaskActionRow[]>`
    SELECT
      task.id,
      task.instance_id,
      task.instance_node_id,
      task.node_id,
      task.node_key,
      task.node_type,
      task.title,
      task.status,
      task.assignee_employee_id,
      task.assignee_role_code,
      task.assignee_permission_code,
      task.created_at::text AS created_at,
      jsonb_build_object(
        'id', instance.id,
        'subject_type', instance.subject_type,
        'subject_id', instance.subject_id,
        'status', instance.status,
        'current_node_key', instance.current_node_key,
        'current_node_snapshot', instance.current_node_snapshot
      ) AS instance
    FROM public.workflow_tasks AS task
    JOIN public.workflow_instances AS instance
      ON instance.id = task.instance_id
      AND instance.tenant_id = task.tenant_id
    WHERE task.tenant_id = ${input.tenantId}::uuid
      AND task.status = 'pending'
      AND instance.subject_type = ${input.subjectType}
      AND instance.subject_id IN ${input.sql(input.subjectIds)}
      AND instance.status = 'running'
      AND instance.current_node_key = task.node_key
      AND (${assigneePredicate})
    ORDER BY task.created_at ASC, task.id ASC
    LIMIT ${input.limit}
  `;

  return rows;
}

function buildDirectAssigneePredicate(
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
  input: WorkflowTaskAssigneeInput,
) {
  const { employeeId, roleCodes, permissionCodes } =
    buildWorkflowTaskAssigneeScope(input);
  let predicate = sql`
    (
      task.assignee_employee_id IS NULL
      AND task.assignee_role_code IS NULL
      AND task.assignee_permission_code IS NULL
    )
  `;

  if (roleCodes.length > 0 && permissionCodes.length > 0) {
    predicate = sql`
      (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IN ${sql(roleCodes)}
        AND task.assignee_permission_code IN ${sql(permissionCodes)}
      )
      OR ${predicate}
    `;
  }
  if (permissionCodes.length > 0) {
    predicate = sql`
      (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IS NULL
        AND task.assignee_permission_code IN ${sql(permissionCodes)}
      )
      OR ${predicate}
    `;
  }
  if (roleCodes.length > 0) {
    predicate = sql`
      (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IN ${sql(roleCodes)}
        AND task.assignee_permission_code IS NULL
      )
      OR ${predicate}
    `;
  }
  if (employeeId) {
    predicate = sql`
      task.assignee_employee_id = ${employeeId}::uuid
      OR ${predicate}
    `;
  }

  return predicate;
}

function toWorkflowTaskRows(
  rows: WorkflowTaskDirectRow[],
): WorkflowTaskWithInstanceRow[] {
  return rows.map((row) => {
    const { total_count, ...task } = row;
    return task;
  });
}
