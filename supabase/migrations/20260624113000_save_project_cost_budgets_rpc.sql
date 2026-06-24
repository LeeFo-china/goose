-- Save project cost budgets in one database call.
--
-- The API previously updated each category row through separate Supabase
-- requests. When a client-side smoke was interrupted, those separate requests
-- could time out independently and leave partially updated rows. This function
-- keeps one save operation inside a single SQL statement and preserves
-- created_by on updates.

CREATE OR REPLACE FUNCTION public.save_project_cost_budgets(
  p_tenant_id uuid,
  p_project_id uuid,
  p_employee_id uuid,
  p_items jsonb
)
RETURNS void
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
END;
$$;

COMMENT ON FUNCTION public.save_project_cost_budgets(uuid, uuid, uuid, jsonb)
IS 'Bulk upsert active project cost budgets for one project in a single database call';
