-- Forward fix: GREATEST is PostgreSQL expression syntax and cannot be called
-- through the pg_catalog schema. Keep the helper contract and ACL unchanged.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.__gooes_supplier_purchase_batch_budget_preflight(
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
      COALESCE(pg_catalog.sum(greatest(
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

COMMIT;
