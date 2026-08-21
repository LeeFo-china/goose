-- Rollback: CREATE OR REPLACE the function body from migration 20260821105660.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.list_tenant_douyin_lead_assignee_filter_options(
  p_tenant_id uuid,
  p_visible_employee_ids uuid[],
  p_page integer,
  p_page_size integer,
  p_keyword text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_keyword text;
  v_list jsonb;
  v_total bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_page IS NULL
    OR p_page < 1 OR p_page > 10000
    OR p_page_size IS NULL
    OR p_page_size < 1 OR p_page_size > 100
    OR (p_visible_employee_ids IS NOT NULL
      AND array_position(p_visible_employee_ids, NULL) IS NOT NULL)
    OR (p_keyword IS NOT NULL
      AND char_length(pg_catalog.btrim(p_keyword)) > 100)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'tenant_douyin_lead_assignee_filter_options_invalid';
  END IF;

  v_keyword := NULLIF(pg_catalog.btrim(p_keyword), '');

  SELECT pg_catalog.count(*)
  INTO v_total
  FROM public.employees AS employee
  WHERE employee.tenant_id = p_tenant_id
    AND (p_visible_employee_ids IS NULL
      OR employee.id = ANY(p_visible_employee_ids))
    AND (v_keyword IS NULL OR employee.name ILIKE '%' || v_keyword || '%');

  SELECT pg_catalog.coalesce(
    jsonb_agg(jsonb_build_object('id', page.id, 'name', page.name)
      ORDER BY page.name ASC NULLS LAST, page.id ASC),
    '[]'::jsonb
  )
  INTO v_list
  FROM (
    SELECT employee.id, employee.name
    FROM public.employees AS employee
    WHERE employee.tenant_id = p_tenant_id
      AND (p_visible_employee_ids IS NULL
        OR employee.id = ANY(p_visible_employee_ids))
      AND (v_keyword IS NULL OR employee.name ILIKE '%' || v_keyword || '%')
    ORDER BY employee.name ASC NULLS LAST, employee.id ASC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  ) AS page;

  RETURN jsonb_build_object(
    'data', jsonb_build_object('list', v_list, 'total', v_total)
  );
END;
$function$;

COMMIT;
