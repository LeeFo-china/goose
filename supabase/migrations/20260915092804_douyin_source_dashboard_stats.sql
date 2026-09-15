-- Source statistics are read from existing tenant-scoped marketing facts.
-- Client capture_version=2 distinguishes launches recorded after official
-- attribution from older launches recorded before the async callback.

CREATE OR REPLACE FUNCTION public.douyin_source_dashboard_basis(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public AS $$
  SELECT CASE
    WHEN p_payload #>> '{analysis_info,type}' = '1'
      AND nullif(p_payload #>> '{analysis_info,video_item_id}', '') IS NOT NULL
      THEN 'official_video'
    WHEN p_payload #>> '{analysis_info,type}' = '2'
      AND nullif(p_payload #>> '{analysis_info,live_room_id}', '') IS NOT NULL
      THEN 'official_live'
    WHEN p_payload #>> '{analysis_info,type}' IN ('3', '4')
      AND nullif(p_payload #>> '{analysis_info,unique_id}', '') IS NOT NULL
      THEN 'official_account'
    WHEN nullif(p_payload ->> 'campaign_code', '') IS NOT NULL
      OR nullif(p_payload ->> 'content_id', '') IS NOT NULL
      THEN 'manual'
    ELSE 'unidentified'
  END;
$$;

CREATE OR REPLACE FUNCTION public.douyin_source_dashboard_key(
  p_payload jsonb, p_group_by text
) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public AS $$
  SELECT CASE
    WHEN public.douyin_source_dashboard_basis(p_payload) LIKE 'official_%'
      AND p_group_by = 'account'
      THEN COALESCE(
        'account:' || nullif(p_payload #>> '{analysis_info,unique_id}', ''),
        'author:' || nullif(p_payload #>> '{analysis_info,author_open_id}', ''),
        'anchor:' || nullif(p_payload #>> '{analysis_info,anchor_open_id}', ''),
        'unidentified'
      )
    WHEN public.douyin_source_dashboard_basis(p_payload) = 'official_video'
      THEN 'video:' || (p_payload #>> '{analysis_info,video_item_id}')
    WHEN public.douyin_source_dashboard_basis(p_payload) = 'official_live'
      THEN 'live:' || (p_payload #>> '{analysis_info,live_room_id}')
    WHEN public.douyin_source_dashboard_basis(p_payload) = 'official_account'
      THEN 'account:' || (p_payload #>> '{analysis_info,unique_id}')
    WHEN public.douyin_source_dashboard_basis(p_payload) = 'manual'
      THEN 'manual:' || COALESCE(nullif(p_payload ->> 'content_id', ''),
        nullif(p_payload ->> 'campaign_code', ''))
    ELSE 'unidentified'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_douyin_source_stats(
  p_tenant_id uuid,
  p_days integer DEFAULT 7,
  p_group_by text DEFAULT 'content',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_days NOT IN (7, 30, 90)
    OR p_group_by NOT IN ('content', 'account')
    OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'DOUYIN_SOURCE_STATS_ARGUMENT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  v_start := (v_today - (p_days - 1))::timestamp
    AT TIME ZONE 'Asia/Shanghai';
  v_end := (v_today + 1)::timestamp AT TIME ZONE 'Asia/Shanghai';

  WITH captured AS MATERIALIZED (
    SELECT e.event_name, e.subject_hash, e.created_at, e.payload,
      public.douyin_source_dashboard_key(e.payload, p_group_by) AS source_key,
      public.douyin_source_dashboard_key(e.payload, 'content') AS content_key,
      public.douyin_source_dashboard_basis(e.payload) AS basis
    FROM public.marketing_events AS e
    WHERE e.tenant_id = p_tenant_id
      AND e.source = 'douyin_miniapp'
      AND e.event_name IN ('app_launch', 'page_view', 'lead_cta_click')
      AND e.created_at >= v_start AND e.created_at < v_end
      AND e.payload ->> 'capture_version' = '2'
  ), eligible_leads AS (
    SELECT e.event_name, e.subject_hash, e.created_at, e.payload,
      public.douyin_source_dashboard_key(e.payload, p_group_by) AS source_key,
      public.douyin_source_dashboard_key(e.payload, 'content') AS content_key,
      public.douyin_source_dashboard_basis(e.payload) AS basis
    FROM public.marketing_events AS e
    WHERE e.tenant_id = p_tenant_id
      AND e.source = 'douyin_miniapp'
      AND e.event_name = 'lead_submit_success'
      AND e.created_at >= v_start AND e.created_at < v_end
      AND jsonb_typeof(e.payload -> 'appointment_id') = 'string'
      AND EXISTS (
        SELECT 1 FROM captured AS launch
        WHERE launch.event_name = 'app_launch'
          AND launch.subject_hash = e.subject_hash
          AND launch.content_key = public.douyin_source_dashboard_key(
            e.payload, 'content')
          AND launch.created_at <= e.created_at
          AND launch.created_at >= e.created_at - interval '24 hours'
      )
  ), events AS (
    SELECT * FROM captured
    UNION ALL
    SELECT * FROM eligible_leads
  ), overview AS (
    SELECT count(*) FILTER (WHERE event_name = 'app_launch')::integer AS entries,
      count(DISTINCT subject_hash) FILTER
        (WHERE event_name = 'app_launch')::integer AS visitors,
      count(*) FILTER (WHERE event_name = 'page_view')::integer AS page_views,
      count(*) FILTER (WHERE event_name = 'lead_cta_click')::integer AS lead_clicks,
      count(DISTINCT payload ->> 'appointment_id') FILTER
        (WHERE event_name = 'lead_submit_success')::integer AS appointments,
      count(DISTINCT subject_hash) FILTER
        (WHERE event_name = 'lead_submit_success')::integer AS lead_people
    FROM events
  ), per_day AS (
    SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
      count(*) FILTER (WHERE event_name = 'app_launch')::integer AS entries,
      count(DISTINCT subject_hash) FILTER
        (WHERE event_name = 'app_launch')::integer AS visitors,
      count(*) FILTER (WHERE event_name = 'page_view')::integer AS page_views,
      count(*) FILTER (WHERE event_name = 'lead_cta_click')::integer AS lead_clicks,
      count(DISTINCT payload ->> 'appointment_id') FILTER
        (WHERE event_name = 'lead_submit_success')::integer AS appointments
    FROM events GROUP BY 1
  ), per_basis AS (
    SELECT basis,
      count(*) FILTER (WHERE event_name = 'app_launch')::integer AS entries,
      count(DISTINCT subject_hash) FILTER
        (WHERE event_name = 'app_launch')::integer AS visitors,
      count(*) FILTER (WHERE event_name = 'page_view')::integer AS page_views,
      count(*) FILTER (WHERE event_name = 'lead_cta_click')::integer AS lead_clicks,
      count(DISTINCT payload ->> 'appointment_id') FILTER
        (WHERE event_name = 'lead_submit_success')::integer AS appointments
    FROM events GROUP BY basis
  ), per_source AS (
    SELECT source_key, basis,
      max(payload ->> 'source_type') AS source_type,
      max(payload #>> '{analysis_info,unique_id}') AS account_id,
      CASE WHEN p_group_by = 'content' THEN
        max(payload #>> '{analysis_info,video_item_id}') END AS video_id,
      CASE WHEN p_group_by = 'content' THEN
        max(payload #>> '{analysis_info,live_room_id}') END AS live_room_id,
      count(*) FILTER (WHERE event_name = 'app_launch')::integer AS entries,
      count(DISTINCT subject_hash) FILTER
        (WHERE event_name = 'app_launch')::integer AS visitors,
      count(*) FILTER (WHERE event_name = 'page_view')::integer AS page_views,
      count(*) FILTER (WHERE event_name = 'lead_cta_click')::integer AS lead_clicks,
      count(DISTINCT payload ->> 'appointment_id') FILTER
        (WHERE event_name = 'lead_submit_success')::integer AS appointments
    FROM events GROUP BY source_key, basis
  ), source_page AS (
    SELECT * FROM per_source
    ORDER BY entries DESC, appointments DESC, source_key, basis
    LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  )
  SELECT jsonb_build_object(
    'window_start', v_start,
    'window_end', v_end,
    'first_captured_at', (SELECT min(created_at) FROM captured
      WHERE event_name = 'app_launch'),
    'overview', (SELECT to_jsonb(o) FROM overview AS o),
    'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', d.day::text,
      'entries', coalesce(p.entries, 0),
      'visitors', coalesce(p.visitors, 0),
      'page_views', coalesce(p.page_views, 0),
      'lead_clicks', coalesce(p.lead_clicks, 0),
      'appointments', coalesce(p.appointments, 0)
    ) ORDER BY d.day), '[]'::jsonb)
      FROM generate_series(v_today - (p_days - 1), v_today,
        interval '1 day') AS d(day)
      LEFT JOIN per_day AS p ON p.day = d.day::date),
    'source_types', (SELECT coalesce(jsonb_agg(to_jsonb(b)
      ORDER BY b.entries DESC, b.basis), '[]'::jsonb) FROM per_basis AS b),
    'sources', jsonb_build_object(
      'list', (SELECT coalesce(jsonb_agg(to_jsonb(s)
        ORDER BY s.entries DESC, s.appointments DESC, s.source_key, s.basis),
        '[]'::jsonb) FROM source_page AS s),
      'pagination', jsonb_build_object(
        'page', p_page, 'pageSize', p_page_size,
        'total', (SELECT count(*) FROM per_source),
        'totalPages', (SELECT (count(*) + p_page_size - 1) / p_page_size
          FROM per_source)
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.douyin_source_dashboard_basis(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.douyin_source_dashboard_key(jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_douyin_source_stats(
  uuid, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_douyin_source_stats(
  uuid, integer, text, integer, integer)
  TO service_role;

-- Rollback: withdraw the service-role grant and drop the three functions in a
-- new forward migration after the API is reverted. No existing data is changed.
