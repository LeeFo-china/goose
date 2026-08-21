CREATE FUNCTION public.list_tenant_douyin_leads(
  p_tenant_id uuid,
  p_visible_assignee_ids uuid[],
  p_status text,
  p_assignee_id uuid,
  p_date_from timestamptz,
  p_date_to_exclusive timestamptz,
  p_keyword text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_keyword text;
  v_list jsonb;
  v_total bigint;
BEGIN
  v_keyword := NULLIF(pg_catalog.btrim(p_keyword), '');
  IF p_tenant_id IS NULL
    OR p_page IS NULL OR p_page < 1 OR p_page > 10000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
    OR (p_status IS NOT NULL AND p_status NOT IN (
      'new', 'contacted', 'converted', 'invalid'
    ))
    OR (p_keyword IS NOT NULL AND p_keyword IS DISTINCT FROM pg_catalog.btrim(p_keyword))
    OR (v_keyword IS NOT NULL AND (
      pg_catalog.char_length(v_keyword) > 80
      OR v_keyword !~ '^[[:alnum:][:space:]#号栋室-]+$'
    ))
    OR (p_date_from IS NOT NULL AND p_date_to_exclusive IS NOT NULL
      AND p_date_from >= p_date_to_exclusive)
    OR (p_visible_assignee_ids IS NOT NULL
      AND pg_catalog.array_position(p_visible_assignee_ids, NULL) IS NOT NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'DOUYIN_LEAD_LIST_COMMAND_INVALID';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_total
  FROM public.marketing_leads AS lead
  WHERE lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp'
    AND (p_visible_assignee_ids IS NULL
      OR lead.assigned_employee_id = ANY(p_visible_assignee_ids))
    AND (p_status IS NULL OR lead.lead_status = p_status)
    AND (p_assignee_id IS NULL OR lead.assigned_employee_id = p_assignee_id)
    AND (p_date_from IS NULL OR lead.created_at >= p_date_from)
    AND (p_date_to_exclusive IS NULL OR lead.created_at < p_date_to_exclusive)
    AND (v_keyword IS NULL OR lead.name ILIKE '%' || v_keyword || '%'
      OR lead.phone ILIKE '%' || v_keyword || '%'
      OR lead.community ILIKE '%' || v_keyword || '%');

  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.created_at DESC,
    page.id DESC), '[]'::jsonb)
  INTO v_list
  FROM (
    SELECT lead.id, lead.created_at, pg_catalog.jsonb_build_object(
      'id', lead.id,
      'tenant_id', lead.tenant_id,
      'douyin_miniapp_installation_id', lead.douyin_miniapp_installation_id,
      'customer_id', lead.customer_id,
      'assigned_employee_id', lead.assigned_employee_id,
      'name', lead.name,
      'phone', lead.phone,
      'community', lead.community,
      'lead_status', lead.lead_status,
      'created_at', lead.created_at,
      'followed_at', lead.followed_at,
      'follow_remark', lead.follow_remark,
      'version', lead.version
    ) AS item
    FROM public.marketing_leads AS lead
    WHERE lead.tenant_id = p_tenant_id
      AND lead.source = 'douyin_miniapp'
      AND (p_visible_assignee_ids IS NULL
        OR lead.assigned_employee_id = ANY(p_visible_assignee_ids))
      AND (p_status IS NULL OR lead.lead_status = p_status)
      AND (p_assignee_id IS NULL OR lead.assigned_employee_id = p_assignee_id)
      AND (p_date_from IS NULL OR lead.created_at >= p_date_from)
      AND (p_date_to_exclusive IS NULL OR lead.created_at < p_date_to_exclusive)
      AND (v_keyword IS NULL OR lead.name ILIKE '%' || v_keyword || '%'
        OR lead.phone ILIKE '%' || v_keyword || '%'
        OR lead.community ILIKE '%' || v_keyword || '%')
    ORDER BY lead.created_at DESC, lead.id DESC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  ) AS page;

  RETURN pg_catalog.jsonb_build_object(
    'data', pg_catalog.jsonb_build_object('list', v_list, 'total', v_total)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_douyin_leads(
  uuid, uuid[], text, uuid, timestamptz, timestamptz, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_douyin_leads(
  uuid, uuid[], text, uuid, timestamptz, timestamptz, text, integer, integer
) TO service_role;
