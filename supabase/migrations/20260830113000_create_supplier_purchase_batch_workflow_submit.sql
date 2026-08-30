-- Atomically submit a supplier purchase batch and start its tenant workflow.
-- Rollback: revoke the dedicated RPC first. Forward-fix any runtime records;
-- never delete command events, requisitions, commitments, or workflow history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- This projection is the single source of truth used by both task creation and
-- supplier submission preflight. Keep its branches aligned with the historical
-- task trigger, including the two subject-specific assignee rules.
CREATE FUNCTION public.__gooes_workflow_task_projection(
  p_tenant_id uuid,
  p_version_id uuid,
  p_definition_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_node jsonb,
  p_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_permission_code text := COALESCE(
    NULLIF(pg_catalog.btrim(p_node->'config'->>'assignee_permission_code'), ''),
    NULLIF(pg_catalog.btrim(p_node->'config'->'required_permissions'->>0), '')
  );
  v_assignee_rule text :=
    NULLIF(pg_catalog.btrim(p_node->'config'->>'assignee_rule'), '');
  v_assignee_id text :=
    NULLIF(pg_catalog.btrim(p_node->'config'->>'assignee_id'), '');
  v_employee_id uuid;
  v_role_code text;
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_node IS NULL OR p_node->>'id' IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.workflow_versions AS version
      WHERE version.id = p_version_id
        AND version.tenant_id = p_tenant_id
        AND version.definition_id = p_definition_id
        AND version.status = 'published'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements(
            COALESCE(version.snapshot->'nodes', '[]'::jsonb)
          ) AS snapshot_node
          WHERE snapshot_node->>'id' = p_node->>'id'
        )
    )
  THEN
    RETURN NULL;
  END IF;

  IF p_subject_type = 'project'
    AND p_node->>'business_kind' = 'payment_collection'
    AND NULLIF(pg_catalog.btrim(
      p_node->'config'->>'finance_reviewer_employee_id'
    ), '') ~* v_uuid_pattern
  THEN
    SELECT employee.id INTO v_employee_id
    FROM public.employees AS employee
    WHERE employee.id = (
        p_node->'config'->>'finance_reviewer_employee_id'
      )::uuid
      AND employee.tenant_id = p_tenant_id
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL
    AND v_assignee_rule = 'applicant_department_manager'
    AND p_subject_type = 'expense_request'
    AND p_subject_id ~* v_uuid_pattern
    AND v_permission_code IS NOT NULL
  THEN
    SELECT manager.id INTO v_employee_id
    FROM public.expense_requests AS request
    JOIN public.employees AS applicant
      ON applicant.id = request.employee_id
     AND applicant.tenant_id = p_tenant_id
    JOIN public.tenant_departments AS department
      ON department.id = applicant.tenant_department_id
     AND department.tenant_id = p_tenant_id
    JOIN public.employees AS manager
      ON manager.id = department.manager_employee_id
     AND manager.tenant_id = p_tenant_id
     AND manager.status = 'active'
     AND manager.tenant_department_id = department.id
    WHERE request.id = p_subject_id::uuid
      AND request.tenant_id = p_tenant_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.employee_permission_overrides AS denied
        JOIN public.permissions AS permission_record
          ON permission_record.id = denied.permission_id
         AND permission_record.code = v_permission_code
         AND permission_record.status = 'active'
        WHERE denied.employee_id = manager.id AND denied.effect = 'deny'
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.employee_roles AS employee_role
          JOIN public.roles AS role_record
            ON role_record.id = employee_role.role_id
           AND role_record.status = 'active'
           AND (
             role_record.tenant_id = p_tenant_id
             OR role_record.tenant_id IS NULL
           )
          JOIN public.role_permissions AS role_permission
            ON role_permission.role_id = role_record.id
           AND role_permission.access_scope IN ('department', 'all')
          JOIN public.permissions AS permission_record
            ON permission_record.id = role_permission.permission_id
           AND permission_record.code = v_permission_code
           AND permission_record.status = 'active'
          WHERE employee_role.employee_id = manager.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.employee_permission_overrides AS allowed
          JOIN public.permissions AS permission_record
            ON permission_record.id = allowed.permission_id
           AND permission_record.code = v_permission_code
           AND permission_record.status = 'active'
          WHERE allowed.employee_id = manager.id
            AND allowed.effect = 'allow'
            AND allowed.access_scope IN ('department', 'all')
        )
      )
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL AND v_assignee_rule = 'employee'
    AND v_assignee_id ~* v_uuid_pattern
  THEN
    SELECT employee.id INTO v_employee_id
    FROM public.employees AS employee
    WHERE employee.id = v_assignee_id::uuid
      AND employee.tenant_id = p_tenant_id
      AND employee.status = 'active'
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL AND v_assignee_rule = 'role'
    AND v_assignee_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.roles AS role_record
      WHERE role_record.code = v_assignee_id
        AND role_record.tenant_id = p_tenant_id
        AND role_record.status = 'active'
    )
  THEN
    v_role_code := v_assignee_id;
  END IF;

  IF v_employee_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'assignee_employee_id', v_employee_id,
      'assignee_role_code', NULL,
      'assignee_permission_code', NULL
    );
  END IF;

  IF p_subject_type = 'project'
    AND p_node->>'business_kind' = 'payment_collection'
  THEN
    v_permission_code := COALESCE(
      v_permission_code,
      'finance.payment.confirm'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'assignee_employee_id', NULL,
    'assignee_role_code', v_role_code,
    'assignee_permission_code', v_permission_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.__gooes_workflow_task_projection(
  uuid, uuid, uuid, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_workflow_task_assignee_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_node jsonb;
  v_instance public.workflow_instances%ROWTYPE;
  v_projection jsonb;
  v_permission_code text;
BEGIN
  SELECT node INTO v_node
  FROM public.workflow_versions AS version,
       pg_catalog.jsonb_array_elements(
         COALESCE(version.snapshot->'nodes', '[]'::jsonb)
       ) AS node
  WHERE version.id = NEW.version_id
    AND version.tenant_id = NEW.tenant_id
    AND version.definition_id = NEW.definition_id
    AND node->>'id' = NEW.node_id::text
  LIMIT 1;
  IF v_node IS NULL THEN RETURN NEW; END IF;

  v_permission_code := COALESCE(
    NULLIF(pg_catalog.btrim(v_node->'config'->>'assignee_permission_code'), ''),
    NULLIF(pg_catalog.btrim(v_node->'config'->'required_permissions'->>0), '')
  );
  IF NEW.assignee_employee_id IS NOT NULL THEN
    NEW.assignee_role_code := NULL;
    NEW.assignee_permission_code := NULL;
    RETURN NEW;
  END IF;
  IF NEW.assignee_role_code IS NOT NULL
    OR NEW.assignee_permission_code IS NOT NULL
  THEN
    IF NEW.assignee_role_code IS NOT NULL
      AND NEW.assignee_permission_code IS NULL
    THEN
      NEW.assignee_permission_code := v_permission_code;
    END IF;
    RETURN NEW;
  END IF;

  SELECT instance.* INTO v_instance
  FROM public.workflow_instances AS instance
  WHERE instance.id = NEW.instance_id
    AND instance.tenant_id = NEW.tenant_id
  LIMIT 1;
  v_projection := public.__gooes_workflow_task_projection(
    NEW.tenant_id, NEW.version_id, NEW.definition_id,
    v_instance.subject_type, v_instance.subject_id, v_node, v_instance.context
  );
  NEW.assignee_employee_id :=
    NULLIF(v_projection->>'assignee_employee_id', '')::uuid;
  NEW.assignee_role_code :=
    NULLIF(v_projection->>'assignee_role_code', '');
  NEW.assignee_permission_code :=
    NULLIF(v_projection->>'assignee_permission_code', '');
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.__gooes_employee_has_project_permission_scope(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_project_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH effective_scopes AS (
    SELECT role_permission.access_scope AS scope
    FROM public.employee_roles AS employee_role
    JOIN public.roles AS role_record
      ON role_record.id = employee_role.role_id
     AND role_record.status = 'active'
     AND (role_record.tenant_id = p_tenant_id OR role_record.tenant_id IS NULL)
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_id = role_record.id
    JOIN public.permissions AS permission_record
      ON permission_record.id = role_permission.permission_id
     AND permission_record.code = p_permission_code
     AND permission_record.status = 'active'
    WHERE employee_role.employee_id = p_employee_id
    UNION ALL
    SELECT allowed.access_scope
    FROM public.employee_permission_overrides AS allowed
    JOIN public.permissions AS permission_record
      ON permission_record.id = allowed.permission_id
     AND permission_record.code = p_permission_code
     AND permission_record.status = 'active'
    WHERE allowed.employee_id = p_employee_id AND allowed.effect = 'allow'
  ), allowed_scopes AS (
    SELECT scope FROM effective_scopes
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.employee_permission_overrides AS denied
      JOIN public.permissions AS permission_record
        ON permission_record.id = denied.permission_id
       AND permission_record.code = p_permission_code
       AND permission_record.status = 'active'
      WHERE denied.employee_id = p_employee_id AND denied.effect = 'deny'
    )
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.projects AS project
    JOIN public.employees AS employee
      ON employee.id = p_employee_id
     AND employee.tenant_id = p_tenant_id
     AND employee.status = 'active'
    WHERE project.id = p_project_id AND project.tenant_id = p_tenant_id
      AND EXISTS (
        SELECT 1 FROM allowed_scopes
        WHERE scope = 'all'
          OR (
            scope IN ('self', 'assigned')
            AND (
              EXISTS (
                SELECT 1 FROM public.project_members AS member
                WHERE member.project_id = project.id
                  AND member.employee_id = employee.id
                  AND member.deleted_at IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM public.customers AS customer
                WHERE customer.id = project.customer_id
                  AND customer.owner_id = employee.id
                  AND customer.tenant_id = p_tenant_id
              )
            )
          )
          OR (
            scope = 'department'
            AND employee.tenant_department_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM public.project_members AS member
                JOIN public.employees AS scoped_employee
                  ON scoped_employee.id = member.employee_id
                 AND scoped_employee.tenant_id = p_tenant_id
                 AND scoped_employee.tenant_department_id =
                   employee.tenant_department_id
                WHERE member.project_id = project.id
                  AND member.deleted_at IS NULL
              )
              OR EXISTS (
                SELECT 1
                FROM public.customers AS customer
                JOIN public.employees AS owner
                  ON owner.id = customer.owner_id
                 AND owner.tenant_id = p_tenant_id
                 AND owner.tenant_department_id = employee.tenant_department_id
                WHERE customer.id = project.customer_id
                  AND customer.tenant_id = p_tenant_id
              )
            )
          )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.__gooes_employee_has_project_permission_scope(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.__gooes_workflow_node_has_candidate(
  p_tenant_id uuid,
  p_version_id uuid,
  p_definition_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_node jsonb,
  p_context jsonb,
  p_project_id uuid,
  p_submitter_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projection jsonb := public.__gooes_workflow_task_projection(
    p_tenant_id, p_version_id, p_definition_id, p_subject_type,
    p_subject_id, p_node, p_context
  );
  v_employee_id uuid :=
    NULLIF(v_projection->>'assignee_employee_id', '')::uuid;
  v_role_code text := NULLIF(v_projection->>'assignee_role_code', '');
  v_permission_code text :=
    NULLIF(v_projection->>'assignee_permission_code', '');
  v_project_permission text := COALESCE(
    NULLIF(v_projection->>'assignee_permission_code', ''),
    'project.read'
  );
BEGIN
  IF p_node->>'node_type' <> 'approval' OR v_projection IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.tenant_id = p_tenant_id
      AND employee.status = 'active'
      AND employee.id <> p_submitter_employee_id
      AND (v_employee_id IS NULL OR employee.id = v_employee_id)
      AND (
        v_role_code IS NULL OR EXISTS (
          SELECT 1
          FROM public.employee_roles AS employee_role
          JOIN public.roles AS role_record
            ON role_record.id = employee_role.role_id
           AND role_record.code = v_role_code
           AND role_record.status = 'active'
           AND (
             role_record.tenant_id = p_tenant_id
             OR role_record.tenant_id IS NULL
           )
          WHERE employee_role.employee_id = employee.id
        )
      )
      AND (
        v_permission_code IS NULL
        OR public.__gooes_employee_has_project_permission_scope(
          p_tenant_id, employee.id, p_project_id, v_permission_code
        )
      )
      AND public.__gooes_employee_has_project_permission_scope(
        p_tenant_id, employee.id, p_project_id, v_project_permission
      )
    LIMIT 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.__gooes_workflow_node_has_candidate(
  uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.__gooes_supplier_purchase_batch_budget_preflight(
  p_tenant_id uuid,
  p_batch_id uuid,
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_budget_status text;
  v_budget_snapshot jsonb;
  v_supplier_id uuid;
BEGIN
  -- Preserve the legacy submit lock order before taking the project budget
  -- scope lock. The legacy RPC re-enters these locks later in this transaction.
  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN (
    SELECT DISTINCT item.tenant_supplier_id, item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id
      AND item.purchase_batch_id = p_batch_id
  ) AS selected
    ON selected.tenant_supplier_id = relationship.id
   AND selected.supplier_id = relationship.supplier_id
  WHERE relationship.tenant_id = p_tenant_id
  ORDER BY relationship.id
  FOR UPDATE OF relationship;
  FOR v_supplier_id IN
    SELECT DISTINCT item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id
      AND item.purchase_batch_id = p_batch_id
    ORDER BY item.supplier_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        v_supplier_id::text,
      6720240729160000
    ));
  END LOOP;

  -- These are the same budget fact locks used by the legacy submit RPC.
  -- Holding them through the outer transaction pins the preflight snapshot.
  PERFORM public.lock_project_cost_budget_scope(p_tenant_id, p_project_id);
  PERFORM finance_category.id
  FROM public.finance_cost_categories AS finance_category
  WHERE finance_category.tenant_id = p_tenant_id
    AND finance_category.status = 'active'
    AND finance_category.id IN (
      SELECT item.cost_category_id
      FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id
        AND item.purchase_batch_id = p_batch_id
    )
  ORDER BY finance_category.id
  FOR UPDATE OF finance_category;
  PERFORM budget.id
  FROM public.project_cost_budgets AS budget
  WHERE budget.tenant_id = p_tenant_id
    AND budget.project_id = p_project_id
    AND budget.status = 'active'
    AND budget.cost_category_id IN (
      SELECT item.cost_category_id
      FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id
        AND item.purchase_batch_id = p_batch_id
    )
  ORDER BY budget.cost_category_id, budget.id
  FOR UPDATE;
  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.project_id = p_project_id
    AND commitment.status IN ('reserved', 'converted', 'consumed')
    AND commitment.cost_category_id IN (
      SELECT item.cost_category_id
      FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id
        AND item.purchase_batch_id = p_batch_id
    )
  ORDER BY commitment.cost_category_id, commitment.id
  FOR UPDATE;

  WITH requested_by_category AS MATERIALIZED (
    SELECT item.cost_category_id,
      pg_catalog.sum(item.line_total_amount)::numeric(18,2) AS amount
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id
      AND item.purchase_batch_id = p_batch_id
    GROUP BY item.cost_category_id
  ), budget_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(pg_catalog.max(budget.budget_amount), 0)::numeric(18,2)
        AS budget_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_budgets AS budget
      ON budget.tenant_id = p_tenant_id
     AND budget.project_id = p_project_id
     AND budget.cost_category_id = requested.cost_category_id
     AND budget.status = 'active'
    GROUP BY requested.cost_category_id
  ), expense_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(pg_catalog.sum(cost_event.amount), 0)::numeric(18,2)
        AS expense_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_events AS cost_event
      ON cost_event.tenant_id = p_tenant_id
     AND cost_event.project_id = p_project_id
     AND cost_event.cost_category_id = requested.cost_category_id
    GROUP BY requested.cost_category_id
  ), current_generation_children AS MATERIALIZED (
    SELECT requisition.id
    FROM public.supplier_purchase_requisitions AS requisition
    JOIN public.supplier_purchase_batches AS batch
      ON batch.id = requisition.purchase_batch_id
     AND batch.tenant_id = requisition.tenant_id
     AND batch.split_generation = requisition.split_generation
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
  ), other_commitment_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(pg_catalog.sum(pg_catalog.greatest(
        commitment.amount - commitment.recognized_amount, 0
      )), 0)::numeric(18,2) AS other_commitment_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_commitments AS commitment
      ON commitment.tenant_id = p_tenant_id
     AND commitment.project_id = p_project_id
     AND commitment.cost_category_id = requested.cost_category_id
     AND commitment.status IN ('reserved', 'converted')
     AND commitment.source_id NOT IN (
       SELECT child.id FROM current_generation_children AS child
     )
    GROUP BY requested.cost_category_id
  ), snapshots AS MATERIALIZED (
    SELECT requested.cost_category_id, requested.amount,
      budget.budget_amount, expense.expense_amount,
      other_commitment.other_commitment_amount,
      (budget.budget_amount - expense.expense_amount -
        other_commitment.other_commitment_amount)::numeric(18,2)
        AS available_amount
    FROM requested_by_category AS requested
    JOIN budget_totals AS budget USING (cost_category_id)
    JOIN expense_totals AS expense USING (cost_category_id)
    JOIN other_commitment_totals AS other_commitment USING (cost_category_id)
  )
  SELECT CASE WHEN pg_catalog.bool_and(amount <= available_amount)
      THEN 'within_budget' ELSE 'over_budget' END,
    pg_catalog.jsonb_object_agg(
      cost_category_id::text,
      pg_catalog.jsonb_build_object(
        'requested_amount', amount::text,
        'budget_amount', budget_amount::text,
        'expense_amount', expense_amount::text,
        'other_commitment_amount', other_commitment_amount::text,
        'available_amount', available_amount::text
      ) ORDER BY cost_category_id
    )
  INTO v_budget_status, v_budget_snapshot
  FROM snapshots;

  IF v_budget_status NOT IN ('within_budget', 'over_budget') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'budget_status', v_budget_status,
    'budget_snapshot', v_budget_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.__gooes_supplier_purchase_batch_budget_preflight(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.__gooes_supplier_workflow_reachable_approvals(
  p_snapshot jsonb,
  p_context jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start_id text;
  v_start_target_id text;
  v_node_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_snapshot->'nodes') <> 'array'
    OR pg_catalog.jsonb_typeof(p_snapshot->'edges') <> 'array'
    OR pg_catalog.jsonb_typeof(p_context) <> 'object'
    OR p_context->>'budget_status' NOT IN ('within_budget', 'over_budget')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'condition_indeterminate';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_node_count
  FROM pg_catalog.jsonb_array_elements(p_snapshot->'nodes');
  IF v_node_count < 2 OR v_node_count > 100
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'nodes') AS node
      GROUP BY node->>'id'
      HAVING node->>'id' IS NULL OR pg_catalog.count(*) > 1
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'graph_ambiguous';
  END IF;

  SELECT pg_catalog.min(node->>'id') INTO v_start_id
  FROM pg_catalog.jsonb_array_elements(p_snapshot->'nodes') AS node
  WHERE node->>'node_type' = 'start';
  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'nodes') AS node
      WHERE node->>'node_type' = 'start') <> 1
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'graph_ambiguous';
  END IF;

  SELECT pg_catalog.min(edge->>'target_node_id') INTO v_start_target_id
  FROM pg_catalog.jsonb_array_elements(p_snapshot->'edges') AS edge
  WHERE edge->>'source_node_id' = v_start_id;
  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'edges') AS edge
      WHERE edge->>'source_node_id' = v_start_id) <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'nodes') AS node
      WHERE node->>'id' = v_start_target_id
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'graph_ambiguous';
  END IF;

  -- Only start-connected edges are relevant. Unknown fields/operators on those
  -- paths cannot be safely predicted from the server-trusted completion output.
  IF EXISTS (
    WITH RECURSIVE structural(node_id) AS (
      SELECT v_start_target_id
      UNION
      SELECT edge->>'target_node_id'
      FROM structural
      JOIN LATERAL pg_catalog.jsonb_array_elements(
        p_snapshot->'edges'
      ) AS edge ON edge->>'source_node_id' = structural.node_id
    )
    SELECT 1
    FROM structural
    JOIN LATERAL pg_catalog.jsonb_array_elements(
      p_snapshot->'edges'
    ) AS edge ON edge->>'source_node_id' = structural.node_id
    WHERE COALESCE(edge->'condition'->>'operator', 'always') NOT IN (
        'always', 'eq', 'neq', 'in'
      )
      OR (
        COALESCE(edge->'condition'->>'operator', 'always') <> 'always'
        AND edge->'condition'->>'field' NOT IN ('decision', 'budget_status')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'condition_indeterminate';
  END IF;

  -- The runtime is priority ordered. Equal-ranked matching edges are rejected
  -- because their winner would depend on non-semantic JSON timestamps.
  IF EXISTS (
    WITH RECURSIVE structural(node_id) AS (
      SELECT v_start_target_id
      UNION
      SELECT edge->>'target_node_id'
      FROM structural
      JOIN LATERAL pg_catalog.jsonb_array_elements(
        p_snapshot->'edges'
      ) AS edge ON edge->>'source_node_id' = structural.node_id
    ), decisions(decision) AS (
      VALUES ('approved'::text), ('rejected'::text)
    ), matching AS (
      SELECT structural.node_id, decisions.decision,
        CASE WHEN COALESCE(edge->'condition'->>'operator', 'always') = 'always'
          THEN 1 ELSE 0 END AS always_rank,
        COALESCE((edge->>'priority')::integer, 100) AS priority,
        COALESCE(edge->>'created_at', '') AS created_at
      FROM structural CROSS JOIN decisions
      JOIN LATERAL pg_catalog.jsonb_array_elements(
        p_snapshot->'edges'
      ) AS edge ON edge->>'source_node_id' = structural.node_id
      WHERE public.workflow_edge_condition_matches(
        edge->'condition',
        p_context || pg_catalog.jsonb_build_object(
          'decision', decisions.decision
        )
      )
    )
    SELECT 1 FROM matching
    GROUP BY node_id, decision, always_rank, priority, created_at
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'graph_ambiguous';
  END IF;

  IF EXISTS (
    WITH RECURSIVE states(node_id, decision, path, graph_cycle) AS (
      SELECT v_start_target_id, decision,
        ARRAY[v_start_id, v_start_target_id], false
      FROM (VALUES ('approved'::text), ('rejected'::text)) AS d(decision)
      UNION ALL
      SELECT chosen.target_id, next_decision.decision,
        states.path || chosen.target_id,
        chosen.target_id = ANY(states.path)
      FROM states
      JOIN LATERAL (
        SELECT edge->>'target_node_id' AS target_id
        FROM pg_catalog.jsonb_array_elements(p_snapshot->'edges') AS edge
        WHERE edge->>'source_node_id' = states.node_id
          AND public.workflow_edge_condition_matches(
            edge->'condition',
            p_context || pg_catalog.jsonb_build_object(
              'decision', states.decision
            )
          )
        ORDER BY
          CASE WHEN COALESCE(edge->'condition'->>'operator', 'always') =
            'always' THEN 1 ELSE 0 END,
          COALESCE((edge->>'priority')::integer, 100),
          edge->>'created_at'
        LIMIT 1
      ) AS chosen ON NOT states.graph_cycle
      CROSS JOIN (VALUES ('approved'::text), ('rejected'::text))
        AS next_decision(decision)
      WHERE pg_catalog.cardinality(states.path) <= v_node_count + 1
    )
    SELECT 1 FROM states WHERE graph_cycle
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'graph_cycle';
  END IF;

  IF EXISTS (
    WITH RECURSIVE states(node_id, decision, path) AS (
      SELECT v_start_target_id, decision, ARRAY[v_start_id, v_start_target_id]
      FROM (VALUES ('approved'::text), ('rejected'::text)) AS d(decision)
      UNION ALL
      SELECT chosen.target_id, next_decision.decision,
        states.path || chosen.target_id
      FROM states
      JOIN LATERAL (
        SELECT edge->>'target_node_id' AS target_id
        FROM pg_catalog.jsonb_array_elements(p_snapshot->'edges') AS edge
        WHERE edge->>'source_node_id' = states.node_id
          AND public.workflow_edge_condition_matches(
            edge->'condition', p_context || pg_catalog.jsonb_build_object(
              'decision', states.decision
            )
          )
        ORDER BY
          CASE WHEN COALESCE(edge->'condition'->>'operator', 'always') =
            'always' THEN 1 ELSE 0 END,
          COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
        LIMIT 1
      ) AS chosen ON chosen.target_id <> ALL(states.path)
      CROSS JOIN (VALUES ('approved'::text), ('rejected'::text))
        AS next_decision(decision)
    )
    SELECT 1
    FROM states
    JOIN LATERAL (
      SELECT node FROM pg_catalog.jsonb_array_elements(
        p_snapshot->'nodes'
      ) AS node WHERE node->>'id' = states.node_id LIMIT 1
    ) AS current_node ON true
    LEFT JOIN LATERAL (
      SELECT edge
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'edges') AS edge
      WHERE edge->>'source_node_id' = states.node_id
        AND public.workflow_edge_condition_matches(
          edge->'condition', p_context || pg_catalog.jsonb_build_object(
            'decision', states.decision
          )
        )
      LIMIT 1
    ) AS matched ON true
    WHERE current_node.node->>'node_type' <> 'end' AND matched.edge IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING',
      DETAIL = 'condition_indeterminate';
  END IF;

  RETURN QUERY
  WITH RECURSIVE states(node_id, decision, path) AS (
    SELECT v_start_target_id, decision, ARRAY[v_start_id, v_start_target_id]
    FROM (VALUES ('approved'::text), ('rejected'::text)) AS d(decision)
    UNION ALL
    SELECT chosen.target_id, next_decision.decision,
      states.path || chosen.target_id
    FROM states
    JOIN LATERAL (
      SELECT edge->>'target_node_id' AS target_id
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'edges') AS edge
      WHERE edge->>'source_node_id' = states.node_id
        AND public.workflow_edge_condition_matches(
          edge->'condition', p_context || pg_catalog.jsonb_build_object(
            'decision', states.decision
          )
        )
      ORDER BY
        CASE WHEN COALESCE(edge->'condition'->>'operator', 'always') =
          'always' THEN 1 ELSE 0 END,
        COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
      LIMIT 1
    ) AS chosen ON chosen.target_id <> ALL(states.path)
    CROSS JOIN (VALUES ('approved'::text), ('rejected'::text))
      AS next_decision(decision)
  )
  SELECT DISTINCT node
  FROM states
  JOIN LATERAL pg_catalog.jsonb_array_elements(
    p_snapshot->'nodes'
  ) AS node ON node->>'id' = states.node_id
  WHERE node->>'node_type' = 'approval';
END;
$$;

REVOKE ALL ON FUNCTION public.__gooes_supplier_workflow_reachable_approvals(
  jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_definition public.workflow_definitions%ROWTYPE;
  v_version public.workflow_versions%ROWTYPE;
  v_subject_state public.workflow_subject_states%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_budget_preflight jsonb;
  v_workflow_context jsonb;
  v_approval_node jsonb;
  v_submit_result jsonb;
  v_start_result jsonb;
  v_result jsonb;
  v_changed_count integer;
  v_instance_id uuid;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    OR pg_catalog.char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR';
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'batch_id', p_batch_id,
    'expected_version', p_expected_version,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_request::text, 'UTF8'),
    'sha256'
  ), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':submit:' || p_idempotency_key,
    6720240826142000
  ));

  SELECT event.*
  INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'submit'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_event.result->'workflow_state' IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
    END IF;
    RETURN v_event.result || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT setting.*
  INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_setting.module_enabled
    OR NOT v_setting.procurement_snapshot_v1_enabled
    OR NOT v_setting.purchase_batch_workflow_enabled
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text,
    6720240826142000
  ));

  SELECT batch.*
  INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_NOT_FOUND';
  END IF;
  IF v_batch.version <> p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT';
  END IF;
  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = v_batch.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID';
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  SELECT definition.*
  INTO v_definition
  FROM public.workflow_definitions AS definition
  WHERE definition.tenant_id = p_tenant_id
    AND definition.workflow_key = 'supplier_purchase_batch_approval'
    AND definition.status = 'active'
    AND definition.active_version_id IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  SELECT version.*
  INTO v_version
  FROM public.workflow_versions AS version
  WHERE version.id = v_definition.active_version_id
    AND version.tenant_id = p_tenant_id
    AND version.definition_id = v_definition.id
    AND version.status = 'published'
  FOR SHARE;

  IF NOT FOUND
    OR v_version.snapshot->>'workflow_key' IS DISTINCT FROM
      'supplier_purchase_batch_approval'
    OR v_version.snapshot->>'subject_type' IS DISTINCT FROM
      'supplier_purchase_batch'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workflow_instances AS instance
    WHERE instance.tenant_id = p_tenant_id
      AND instance.subject_type = 'supplier_purchase_batch'
      AND instance.subject_id = p_batch_id::text
      AND instance.status = 'running'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  v_budget_preflight :=
    public.__gooes_supplier_purchase_batch_budget_preflight(
      p_tenant_id, p_batch_id, v_batch.project_id
    );
  v_workflow_context := pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'batch_version', p_expected_version + 1,
    'approval_round', v_batch.approval_round + 1,
    'budget_status', v_budget_preflight->>'budget_status',
    'project_id', v_batch.project_id,
    'submitted_by_employee_id', p_actor_employee_id
  );

  FOR v_approval_node IN
    SELECT approval_node
    FROM public.__gooes_supplier_workflow_reachable_approvals(
      v_version.snapshot, v_workflow_context
    ) AS approval_node
  LOOP
    IF NOT public.__gooes_workflow_node_has_candidate(
      p_tenant_id,
      v_version.id,
      v_definition.id,
      'supplier_purchase_batch',
      p_batch_id::text,
      v_approval_node,
      v_workflow_context,
      v_batch.project_id,
      p_actor_employee_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_NO_APPROVER',
        DETAIL = COALESCE(v_approval_node->>'node_key', 'unknown');
    END IF;
  END LOOP;

  v_submit_result := public.submit_supplier_purchase_batch(
    p_batch_id,
    p_tenant_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );

  IF v_submit_result->>'status' <> 'submitted' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = COALESCE(
        v_submit_result->>'error_code',
        'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT'
      );
  END IF;

  SELECT batch.*
  INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_batch.budget_status NOT IN ('within_budget', 'over_budget') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;
  IF v_batch.budget_status IS DISTINCT FROM
    v_budget_preflight->>'budget_status'
    OR v_batch.budget_snapshot IS DISTINCT FROM
      v_budget_preflight->'budget_snapshot'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  UPDATE public.supplier_purchase_batches AS batch
  SET approval_round = batch.approval_round + 1
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
    AND batch.version = (v_submit_result->>'version')::integer
    AND batch.status = 'pending_approval'
  RETURNING batch.* INTO v_batch;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT';
  END IF;

  v_start_result := public.start_workflow_instance(
    p_tenant_id,
    v_definition.id,
    'supplier_purchase_batch',
    p_batch_id::text,
    pg_catalog.jsonb_build_object(
      'batch_id', p_batch_id,
      'batch_version', v_batch.version,
      'approval_round', v_batch.approval_round,
      'budget_status', v_batch.budget_status,
      'project_id', v_batch.project_id,
      'submitted_by_employee_id', p_actor_employee_id
    ),
    p_actor_employee_id
  );

  IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = CASE v_start_result->>'reason'
        WHEN 'running_instance_exists' THEN
          'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT'
        ELSE 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING'
      END;
  END IF;

  v_instance_id := (v_start_result->'instance'->>'id')::uuid;

  INSERT INTO public.workflow_subject_states (
    tenant_id,
    subject_type,
    subject_id,
    definition_id,
    instance_id,
    instance_status,
    current_node_key,
    current_node_title,
    current_business_kind,
    pending_task_count
  )
  SELECT
    instance.tenant_id,
    instance.subject_type,
    instance.subject_id,
    instance.definition_id,
    instance.id,
    instance.status,
    instance.current_node_key,
    instance.current_node_snapshot->>'title',
    instance.current_node_snapshot->>'business_kind',
    (
      SELECT pg_catalog.count(*)::integer
      FROM public.workflow_tasks AS task
      WHERE task.tenant_id = instance.tenant_id
        AND task.instance_id = instance.id
        AND task.status = 'pending'
    )
  FROM public.workflow_instances AS instance
  WHERE instance.id = v_instance_id
    AND instance.tenant_id = p_tenant_id
    AND instance.status = 'running'
  ON CONFLICT (tenant_id, subject_type, subject_id)
  DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    instance_id = EXCLUDED.instance_id,
    instance_status = EXCLUDED.instance_status,
    current_node_key = EXCLUDED.current_node_key,
    current_node_title = EXCLUDED.current_node_title,
    current_business_kind = EXCLUDED.current_business_kind,
    pending_task_count = EXCLUDED.pending_task_count
  RETURNING * INTO v_subject_state;

  IF v_subject_state.id IS NULL OR v_subject_state.pending_task_count < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_NO_APPROVER';
  END IF;

  v_result := v_submit_result || pg_catalog.jsonb_build_object(
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'requisition_ids', v_submit_result->'requisition_ids',
    'workflow_state', pg_catalog.jsonb_build_object(
      'definition_id', v_subject_state.definition_id,
      'instance_id', v_subject_state.instance_id,
      'instance_status', v_subject_state.instance_status,
      'current_node_key', v_subject_state.current_node_key,
      'current_node_title', v_subject_state.current_node_title,
      'current_business_kind', v_subject_state.current_business_kind,
      'pending_task_count', v_subject_state.pending_task_count
    ),
    'version', v_batch.version,
    'idempotent', false
  );

  UPDATE public.supplier_purchase_batch_command_events AS event
  SET
    result = v_result,
    result_version = v_batch.version
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'submit'
    AND event.idempotency_key = p_idempotency_key
    AND event.request_fingerprint = v_fingerprint;

  GET DIAGNOSTICS v_changed_count = ROW_COUNT;
  IF v_changed_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  uuid, uuid, integer, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  uuid, uuid, integer, uuid, uuid, text
) IS 'Atomically submits a supplier purchase batch, starts its published tenant approval workflow, and refreshes workflow_subject_states.';

COMMIT;
