DROP FUNCTION IF EXISTS public.list_customer_home_projects(uuid, uuid, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.list_customer_home_projects(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_recent_logs_per_project integer DEFAULT 2
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  name text,
  status text,
  budget numeric,
  address text,
  property_id uuid,
  start_date date,
  style_tags jsonb,
  property jsonb,
  recent_logs jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH project_page AS (
    SELECT
      project.id,
      project.tenant_id,
      project.name,
      project.status,
      project.budget,
      project.address,
      project.property_id,
      project.start_date,
      project.style_tags,
      property.community,
      property.building_info,
      property.layout,
      property.area,
      property.latitude,
      property.longitude,
      property.province,
      property.city,
      property.district,
      property.adcode,
      property.location_status,
      property.location_source,
      property.location_confidence,
      property.location_confirmed_at
    FROM public.projects AS project
    LEFT JOIN public.properties AS property
      ON property.id = project.property_id
      AND property.tenant_id = project.tenant_id
    WHERE project.tenant_id = p_tenant_id
      AND project.customer_id = p_customer_id
    ORDER BY project.created_at DESC
    OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1)
    LIMIT GREATEST(p_page_size, 1)
  )
  SELECT
    project_page.id,
    project_page.tenant_id,
    project_page.name,
    project_page.status,
    project_page.budget,
    project_page.address,
    project_page.property_id,
    project_page.start_date,
    project_page.style_tags,
    jsonb_build_object(
      'id', project_page.property_id,
      'community', project_page.community,
      'building_info', project_page.building_info,
      'layout', project_page.layout,
      'area', project_page.area,
      'latitude', project_page.latitude,
      'longitude', project_page.longitude,
      'province', project_page.province,
      'city', project_page.city,
      'district', project_page.district,
      'adcode', project_page.adcode,
      'location_status', project_page.location_status,
      'location_source', project_page.location_source,
      'location_confidence', project_page.location_confidence,
      'location_confirmed_at', project_page.location_confirmed_at
    ) AS property,
    COALESCE(logs.recent_logs, '[]'::jsonb) AS recent_logs
  FROM project_page
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'project_id', log_rows.project_id,
        'id', log_rows.id,
        'employee_id', log_rows.employee_id,
        'employee_name', employee.name,
        'employee_avatar', employee.avatar,
        'stage_code', log_rows.stage_code,
        'node_name', log_rows.node_name,
        'created_at', log_rows.created_at,
        'image_count', COALESCE(images.image_count, 0),
        'cover_image_path', images.cover_image_path,
        'comment_count', COALESCE(comment_stats.comment_count, 0),
        'rating_count', COALESCE(comment_stats.rating_count, 0),
        'average_rating', comment_stats.average_rating
      )
      ORDER BY log_rows.created_at DESC
    ) AS recent_logs
    FROM (
      SELECT
        project_log.id,
        project_log.project_id,
        project_log.employee_id,
        project_log.stage_code,
        project_log.node_name,
        project_log.created_at,
        project_log.images,
        project_log.tenant_id
      FROM public.project_logs AS project_log
      WHERE project_log.tenant_id = project_page.tenant_id
        AND project_log.project_id = project_page.id
      ORDER BY project_log.created_at DESC
      LIMIT GREATEST(LEAST(COALESCE(p_recent_logs_per_project, 2), 10), 0)
    ) AS log_rows
    LEFT JOIN public.employees AS employee
      ON employee.id = log_rows.employee_id
      AND employee.tenant_id = log_rows.tenant_id
    LEFT JOIN LATERAL (
      SELECT
        jsonb_array_length(image_array.images) AS image_count,
        (
          SELECT image_value
          FROM jsonb_array_elements_text(image_array.images)
          WITH ORDINALITY AS image_items(image_value, image_index)
          ORDER BY image_index ASC
          LIMIT 1
        ) AS cover_image_path
      FROM (
        SELECT CASE
          WHEN log_rows.images IS NULL THEN '[]'::jsonb
          WHEN jsonb_typeof(log_rows.images::jsonb) = 'array'
            THEN log_rows.images::jsonb
          ELSE '[]'::jsonb
        END AS images
      ) AS image_array
    ) AS images ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS comment_count,
        COUNT(project_log_comments.rating) AS rating_count,
        ROUND(AVG(project_log_comments.rating)::numeric, 1) AS average_rating
      FROM public.project_log_comments AS project_log_comments
      WHERE project_log_comments.tenant_id = log_rows.tenant_id
        AND project_log_comments.log_id = log_rows.id
        AND project_log_comments.deleted_at IS NULL
    ) AS comment_stats ON true
  ) AS logs ON true;
$$;

GRANT EXECUTE ON FUNCTION public.list_customer_home_projects(uuid, uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_home_projects(uuid, uuid, integer, integer, integer) TO service_role;
