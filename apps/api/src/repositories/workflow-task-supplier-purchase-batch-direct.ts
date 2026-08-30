import type {
  WorkflowTaskListInput,
  WorkflowTaskListResult,
} from "@/repositories/workflow-tasks";
import {
  buildDirectAssigneePredicate,
  toWorkflowTaskRows,
  type WorkflowTaskDirectRow,
} from "@/repositories/workflow-tasks-direct";
import { getDirectPostgresSql } from "@/utils/postgres-direct";

export async function listAccessibleSupplierPurchaseBatchTasksViaDirectSql(
  params: {
    input: WorkflowTaskListInput & {
      employeeId: string;
      visibleProjectIds: string[] | null;
    };
    page: number;
    pageSize: number;
    offset: number;
    sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>;
  },
): Promise<WorkflowTaskListResult> {
  const { input, page, pageSize, offset, sql } = params;
  const status = input.status ?? "pending";
  const subjectIdFilter = input.subjectId
    ? sql`AND instance.subject_id = ${input.subjectId}`
    : sql``;
  const projectFilter = input.visibleProjectIds
    ? sql`AND batch.project_id IN ${sql(input.visibleProjectIds)}`
    : sql``;
  const pendingRuntimeFilter = status === "pending"
    ? sql`
      AND instance.status = 'running'
      AND instance.current_node_key = task.node_key
    `
    : sql``;
  const assigneePredicate = buildDirectAssigneePredicate(sql, input);
  const batchJoin = sql`
    JOIN public.supplier_purchase_batches AS batch
      ON batch.id = CASE
        WHEN instance.subject_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN instance.subject_id::uuid
        ELSE NULL::uuid
      END
      AND batch.tenant_id = task.tenant_id
  `;
  const accessPredicate = sql`
    AND instance.subject_type = 'supplier_purchase_batch'
    ${subjectIdFilter}
    ${pendingRuntimeFilter}
    ${projectFilter}
    AND batch.submitted_by_employee_id IS DISTINCT FROM ${input.employeeId}::uuid
    AND (${assigneePredicate})
  `;

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
    ${batchJoin}
    LEFT JOIN public.employees AS employee
      ON employee.id = task.assignee_employee_id
      AND employee.tenant_id = task.tenant_id
    WHERE task.tenant_id = ${input.tenantId}::uuid
      AND task.status = ${status}
      ${accessPredicate}
    ORDER BY task.updated_at DESC, task.id DESC
    OFFSET ${offset}
    LIMIT ${pageSize}
  `;

  let total = Number(rows[0]?.total_count ?? 0);
  if (total === 0 && offset > 0) {
    const countRows = await sql<Array<{ total_count: number | string }>>`
      SELECT count(*) AS total_count
      FROM public.workflow_tasks AS task
      JOIN public.workflow_instances AS instance
        ON instance.id = task.instance_id
        AND instance.tenant_id = task.tenant_id
      ${batchJoin}
      WHERE task.tenant_id = ${input.tenantId}::uuid
        AND task.status = ${status}
        ${accessPredicate}
    `;
    total = Number(countRows[0]?.total_count ?? 0);
  }

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
