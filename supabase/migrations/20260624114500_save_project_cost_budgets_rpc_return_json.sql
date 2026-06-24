-- Return JSON from save_project_cost_budgets.
--
-- Bun fetch / supabase-js can hang on this RPC when PostgREST returns a 204
-- empty response for a void function. Returning a small JSON payload keeps the
-- RPC response explicit for API runtime calls.

DROP FUNCTION IF EXISTS public.save_project_cost_budgets(uuid, uuid, uuid, jsonb);

CREATE FUNCTION public.save_project_cost_budgets(
  p_tenant_id uuid,
  p_project_id uuid,
  p_employee_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  INSERT INTO public.project_cost_budgets (
    tenant_id,
    project_id,
    cost_category_id,
    budget_amount,
    warning_threshold_percent,
    status,
    remark,
    created_by,
    updated_by
  )
  SELECT
    p_tenant_id,
    p_project_id,
    item.cost_category_id,
    item.budget_amount,
    COALESCE(item.warning_threshold_percent, 100),
    'active',
    NULLIF(BTRIM(item.remark), ''),
    p_employee_id,
    p_employee_id
  FROM jsonb_to_recordset(p_items) AS item(
    cost_category_id uuid,
    budget_amount numeric,
    warning_threshold_percent numeric,
    remark text
  )
  ON CONFLICT (tenant_id, project_id, cost_category_id)
  WHERE status = 'active'
  DO UPDATE SET
    budget_amount = EXCLUDED.budget_amount,
    warning_threshold_percent = EXCLUDED.warning_threshold_percent,
    remark = EXCLUDED.remark,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.save_project_cost_budgets(uuid, uuid, uuid, jsonb)
IS 'Bulk upsert active project cost budgets for one project in a single database call';
