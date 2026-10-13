-- Admin workspace only: project paging and totals use persisted recent status.
-- The API supplies its authorized tenant and project.read scope. NULL visible IDs
-- means all projects IN THAT TENANT; an empty UUID array means no access.
-- Additive migration; rollback application first, leave function/index in place.
-- A later removal must be a separately reviewed migration. No data is rewritten.
SET lock_timeout = '5s';

-- Supports bounded expanded-device pages; also covers scoped aggregate columns.
CREATE INDEX IF NOT EXISTS idx_camera_workspace_tenant_project_page
ON public.project_cameras (tenant_id, project_id, sort_order, created_at, id)
INCLUDE (status, can_view, vendor)
WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.list_camera_workspace_projects(
  p_tenant_id uuid,
  p_visible_project_ids uuid[],
  p_keyword text DEFAULT NULL,
  p_binding text DEFAULT 'bound',
  p_project_status text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_keyword text := NULLIF(btrim(p_keyword), '');
  v_pattern text;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF p_binding IS NULL OR p_binding NOT IN ('bound', 'unbound', 'all')
     OR p_page IS NULL OR p_page < 1
     OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
     OR length(v_keyword) > 100 THEN
    RAISE EXCEPTION 'invalid camera workspace filters or pagination' USING ERRCODE = '22023';
  END IF;
  -- Literal substring search, including unmasked phone. Escape LIKE metacharacters;
  -- values are parameters, never dynamic SQL or PostgREST filter expressions.
  v_pattern := '%' || replace(replace(replace(v_keyword, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  WITH scoped_projects AS MATERIALIZED (
    SELECT p.id, p.tenant_id, p.name, p.status, p.address,
           p.customer_id, p.property_id, p.updated_at
    FROM public.projects p
    WHERE p.tenant_id = p_tenant_id
      AND (p_visible_project_ids IS NULL OR p.id = ANY(p_visible_project_ids))
      AND (p_project_status IS NULL OR p.status = p_project_status)
      AND (v_keyword IS NULL
        OR p.name ILIKE v_pattern OR p.address ILIKE v_pattern
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = p.customer_id AND c.tenant_id = p_tenant_id
            AND (c.name ILIKE v_pattern OR c.phone ILIKE v_pattern)
        )
        OR EXISTS (
          SELECT 1 FROM public.properties r
          WHERE r.id = p.property_id AND r.tenant_id = p_tenant_id
            AND (r.community ILIKE v_pattern OR r.building_info ILIKE v_pattern
                 OR r.layout ILIKE v_pattern)
        )
      )
  ), camera_counts AS (
    -- Aggregate in PostgreSQL, only for authorized, matching projects. No camera
    -- arrays cross the RPC boundary and no per-project network queries occur.
    SELECT c.project_id, count(*) AS camera_count,
      count(*) FILTER (WHERE c.status = 'online') AS online_count,
      count(*) FILTER (WHERE c.status = 'offline') AS offline_count,
      count(*) FILTER (WHERE c.status = 'unknown') AS unknown_count,
      count(*) FILTER (WHERE NOT c.can_view) AS hidden_count,
      count(*) FILTER (WHERE c.vendor = 'tencent_iotvideo_industry') AS tencent_count
    FROM public.project_cameras c
    JOIN scoped_projects p ON p.id = c.project_id
    WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    GROUP BY c.project_id
  ), filtered AS MATERIALIZED (
    SELECT p.*, coalesce(c.camera_count, 0) AS camera_count,
      coalesce(c.online_count, 0) AS online_count,
      coalesce(c.offline_count, 0) AS offline_count,
      coalesce(c.unknown_count, 0) AS unknown_count,
      coalesce(c.hidden_count, 0) AS hidden_count,
      coalesce(c.tencent_count, 0) AS tencent_count
    FROM scoped_projects p
    LEFT JOIN camera_counts c ON c.project_id = p.id
    WHERE p_binding = 'all'
      OR (p_binding = 'bound' AND coalesce(c.camera_count, 0) > 0)
      OR (p_binding = 'unbound' AND coalesce(c.camera_count, 0) = 0)
  ), page_projects AS (
    SELECT * FROM filtered
    ORDER BY updated_at DESC NULLS LAST, id DESC
    LIMIT p_page_size OFFSET (p_page::bigint - 1) * p_page_size
  ), totals AS (
    SELECT count(*) AS project_count,
      coalesce(sum(camera_count), 0) AS total_camera_count,
      coalesce(sum(online_count), 0) AS online_count,
      coalesce(sum(offline_count), 0) AS offline_count,
      coalesce(sum(unknown_count), 0) AS unknown_count,
      coalesce(sum(hidden_count), 0) AS hidden_count,
      coalesce(sum(tencent_count), 0) AS tencent_count
    FROM filtered
  )
  SELECT jsonb_build_object(
    'total', totals.project_count,
    'summary', to_jsonb(totals),
    'list', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'project', jsonb_build_object(
          'id', p.id, 'tenant_id', p.tenant_id, 'name', p.name,
          'status', p.status, 'address', p.address,
          'customer_id', p.customer_id, 'property_id', p.property_id,
          'customer', CASE WHEN c.id IS NULL THEN NULL ELSE
            jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) END,
          'property', CASE WHEN r.id IS NULL THEN NULL ELSE
            jsonb_build_object('id', r.id, 'community', r.community,
              'building_info', r.building_info, 'layout', r.layout, 'area', r.area) END
        ),
        'summary', jsonb_build_object(
          'camera_count', p.camera_count, 'online_count', p.online_count,
          'offline_count', p.offline_count, 'unknown_count', p.unknown_count,
          'hidden_count', p.hidden_count, 'tencent_count', p.tencent_count
        )
      ) ORDER BY p.updated_at DESC NULLS LAST, p.id DESC)
      FROM page_projects p
      LEFT JOIN public.customers c ON c.id = p.customer_id AND c.tenant_id = p_tenant_id
      LEFT JOIN public.properties r ON r.id = p.property_id AND r.tenant_id = p_tenant_id
    ), '[]'::jsonb)
  ) INTO v_result FROM totals;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_camera_workspace_projects(uuid, uuid[], text, text, text, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_camera_workspace_projects(uuid, uuid[], text, text, text, integer, integer)
TO service_role;
COMMENT ON FUNCTION public.list_camera_workspace_projects(uuid, uuid[], text, text, text, integer, integer)
IS 'Admin camera workspace; DB-project pagination, tenant/read-scope filters, full filtered-scope persisted-status totals. API masks phone after searching.';

RESET lock_timeout;
