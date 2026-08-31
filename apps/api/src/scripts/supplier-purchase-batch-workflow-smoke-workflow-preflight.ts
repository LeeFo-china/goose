import type { SupplierPurchaseBatchWorkflowSmokeTargets } from
  "./supplier-purchase-batch-workflow-smoke";

export type SupplierPurchaseBatchWorkflowPreflightRow = {
  all_candidates_ready: boolean;
  purchase_node_ready: boolean;
  finance_node_ready: boolean;
};

export function inspectSupplierPurchaseBatchWorkflow(
  database: Bun.SQL,
  input: SupplierPurchaseBatchWorkflowSmokeTargets,
) {
  return database<Array<SupplierPurchaseBatchWorkflowPreflightRow>>`
    WITH resolved AS (
      SELECT definition.id AS definition_id, version.id AS version_id,
        version.snapshot
      FROM public.workflow_definitions AS definition
      JOIN public.workflow_versions AS version
        ON version.id = definition.active_version_id
       AND version.tenant_id = definition.tenant_id
       AND version.definition_id = definition.id
       AND version.status = 'published'
      WHERE definition.tenant_id = ${input.tenantId}::uuid
        AND definition.workflow_key = 'supplier_purchase_batch_approval'
        AND definition.status = 'active'
        AND version.snapshot->>'workflow_key' =
          'supplier_purchase_batch_approval'
        AND version.snapshot->>'subject_type' = 'supplier_purchase_batch'
      LIMIT 100
    ), contexts(budget_status) AS (
      VALUES ('within_budget'::text), ('over_budget'::text)
    ), reachable AS (
      SELECT resolved.definition_id, resolved.version_id,
        contexts.budget_status, approval_node.node,
        CASE approval_node.node->>'node_key'
          WHEN 'purchase_review' THEN ${input.purchaseApproverId}::uuid
          WHEN 'finance_review' THEN ${input.financeApproverId}::uuid
        END AS actor_employee_id,
        jsonb_build_object(
          'batch_id', ${input.projectId}::uuid,
          'batch_version', 1,
          'approval_round', 1,
          'budget_status', contexts.budget_status,
          'project_id', ${input.projectId}::uuid,
          'submitted_by_employee_id', ${input.applicantEmployeeId}::uuid
        ) AS workflow_context
      FROM resolved
      CROSS JOIN contexts
      CROSS JOIN LATERAL
        public.__gooes_supplier_workflow_reachable_approvals(
          resolved.snapshot,
          jsonb_build_object(
            'batch_id', ${input.projectId}::uuid,
            'batch_version', 1,
            'approval_round', 1,
            'budget_status', contexts.budget_status,
            'project_id', ${input.projectId}::uuid,
            'submitted_by_employee_id', ${input.applicantEmployeeId}::uuid
          )
        ) AS approval_node(node)
    ), projected AS (
      SELECT reachable.*,
        public.__gooes_workflow_node_has_candidate(
          ${input.tenantId}::uuid, reachable.version_id,
          reachable.definition_id, 'supplier_purchase_batch',
          ${input.projectId}::text, reachable.node,
          reachable.workflow_context, ${input.projectId}::uuid,
          ${input.applicantEmployeeId}::uuid
        ) AS any_candidate_ready,
        public.__gooes_workflow_task_projection(
          ${input.tenantId}::uuid, reachable.version_id,
          reachable.definition_id, 'supplier_purchase_batch',
          ${input.projectId}::text, reachable.node,
          reachable.workflow_context
        ) AS projection
      FROM reachable
    ), candidates AS (
      SELECT projected.budget_status, projected.node,
        projected.any_candidate_ready AND EXISTS (
          SELECT 1
          FROM public.employees AS employee
          WHERE employee.id = projected.actor_employee_id
            AND employee.tenant_id = ${input.tenantId}::uuid
            AND employee.status = 'active'
            AND employee.id <> ${input.applicantEmployeeId}::uuid
            AND (
              NULLIF(projected.projection->>'assignee_employee_id', '') IS NULL
              OR NULLIF(projected.projection->>'assignee_employee_id', '')::uuid
                = employee.id
            )
            AND (
              NULLIF(projected.projection->>'assignee_role_code', '') IS NULL
              OR EXISTS (
                SELECT 1
                FROM public.employee_roles AS employee_role
                JOIN public.roles AS role_record
                  ON role_record.id = employee_role.role_id
                 AND role_record.code =
                   projected.projection->>'assignee_role_code'
                 AND role_record.status = 'active'
                 AND (role_record.tenant_id = ${input.tenantId}::uuid
                   OR role_record.tenant_id IS NULL)
                WHERE employee_role.employee_id = employee.id
              )
            )
            AND (
              NULLIF(
                projected.projection->>'assignee_permission_code', ''
              ) IS NULL
              OR public.__gooes_employee_has_project_permission_scope(
                ${input.tenantId}::uuid, employee.id,
                ${input.projectId}::uuid,
                projected.projection->>'assignee_permission_code'
              )
            )
            AND public.__gooes_employee_has_project_permission_scope(
              ${input.tenantId}::uuid, employee.id, ${input.projectId}::uuid,
              COALESCE(NULLIF(
                projected.projection->>'assignee_permission_code', ''
              ), 'project.read')
            )
        ) AS explicit_approver_ready
      FROM projected
    )
    SELECT COALESCE(bool_and(explicit_approver_ready), false)
        AS all_candidates_ready,
      COALESCE(bool_or(
        budget_status = 'within_budget'
        AND node->>'node_key' = 'purchase_review'
        AND explicit_approver_ready
      ), false) AS purchase_node_ready,
      COALESCE(bool_or(
        budget_status = 'over_budget'
        AND node->>'node_key' = 'finance_review'
        AND explicit_approver_ready
      ), false) AS finance_node_ready
    FROM candidates;
  `;
}
