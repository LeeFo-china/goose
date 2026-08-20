-- Forward rollback procedure:
-- 1. First disable new public-project publication writes and keep the compatibility route.
-- 2. Confirm no published client depends on the RPC or its response envelope.
-- 3. Only then use a forward migration to revoke EXECUTE and run:
--    DROP FUNCTION IF EXISTS public.upsert_douyin_project_public_profile(
--      uuid, uuid, text, text, text[], text[], text, text
--    );
-- Existing profile rows are business data and must not be deleted during rollback.
-- This migration defines the command but never invokes it.

BEGIN;

CREATE FUNCTION public.upsert_douyin_project_public_profile(
  p_tenant_id uuid,
  p_project_id uuid,
  p_public_title text,
  p_public_description text,
  p_public_image_urls text[],
  p_style_tags text[],
  p_budget_band text,
  p_publication_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_public_title text := pg_catalog.btrim(p_public_title);
  v_public_description text := pg_catalog.btrim(p_public_description);
  v_image_references text[] := ARRAY[]::text[];
  v_style_tags text[] := ARRAY[]::text[];
  v_budget_band text := CASE
    WHEN p_budget_band IS NULL THEN NULL
    ELSE pg_catalog.btrim(p_budget_band)
  END;
  v_scope_prefix text :=
    'tenants/' || p_tenant_id::text ||
    '/project-log/projects/' || p_project_id::text || '/';
  v_candidate_references text[] := ARRAY[]::text[];
  v_project_log record;
  image_reference record;
  selected_reference record;
  v_saved_profile public.douyin_project_public_profiles%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL
    OR p_project_id IS NULL
    OR p_public_title IS NULL
    OR p_public_description IS NULL
    OR p_public_image_urls IS NULL
    OR p_style_tags IS NULL
    OR p_publication_status IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_PROJECT_PUBLICATION_INVALID',
        'message', '公开项目资料参数无效'
      )
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(
      pg_catalog.btrim(image_reference.value)
      ORDER BY image_reference.ordinality
    ),
    ARRAY[]::text[]
  )
  INTO v_image_references
  FROM pg_catalog.unnest(p_public_image_urls)
    WITH ORDINALITY AS image_reference(value, ordinality);

  SELECT COALESCE(
    pg_catalog.array_agg(
      pg_catalog.btrim(style_tag.value)
      ORDER BY style_tag.ordinality
    ),
    ARRAY[]::text[]
  )
  INTO v_style_tags
  FROM pg_catalog.unnest(p_style_tags)
    WITH ORDINALITY AS style_tag(value, ordinality);

  IF v_public_title IS NULL
    OR NOT (
      pg_catalog.char_length(v_public_title) BETWEEN 2 AND 100
    )
    OR v_public_description IS NULL
    OR NOT (
      pg_catalog.char_length(v_public_description) BETWEEN 20 AND 2000
    )
    OR pg_catalog.cardinality(v_style_tags) > 8
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(v_style_tags) AS style_tag(value)
      WHERE style_tag.value IS NULL
        OR NOT (
          pg_catalog.char_length(style_tag.value) BETWEEN 1 AND 40
        )
    )
    OR (
      p_budget_band IS NOT NULL
      AND (
        v_budget_band IS NULL
        OR NOT (pg_catalog.char_length(v_budget_band) BETWEEN 1 AND 80)
      )
    )
    OR NOT (
      p_publication_status IN ('draft', 'published', 'hidden')
    )
    OR NOT public.douyin_public_image_urls_are_valid(v_image_references)
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(v_image_references)
        AS image_reference(value)
      WHERE image_reference.value ~ '^https://'
        AND (
          pg_catalog.strpos(image_reference.value, '?') > 0
          OR pg_catalog.strpos(image_reference.value, '#') > 0
        )
    )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_PROJECT_PUBLICATION_INVALID',
        'message', '公开项目资料参数无效'
      )
    );
  END IF;

  IF p_publication_status = 'published'
    AND pg_catalog.cardinality(v_image_references) < 3
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_PROJECT_PUBLICATION_IMAGES_REQUIRED',
        'message', '发布项目至少需要 3 张公开图片'
      )
    );
  END IF;

  -- This row lock serializes profile commands and prevents project deletion or
  -- tenant reassignment until the profile upsert commits.
  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_PROJECT_NOT_FOUND',
        'message', '项目不存在'
      )
    );
  END IF;

  FOR image_reference IN
    SELECT reference.value
    FROM pg_catalog.unnest(v_image_references) AS reference(value)
  LOOP
    IF image_reference.value !~ '^https://'
      AND image_reference.value NOT LIKE v_scope_prefix || '%'
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'error', pg_catalog.jsonb_build_object(
          'status_code', 400,
          'code', 'DOUYIN_PROJECT_IMAGE_REFERENCE_SCOPE_MISMATCH',
          'message', '公开图片不属于当前项目'
        )
      );
    END IF;
  END LOOP;

  IF pg_catalog.cardinality(v_image_references) > 0 THEN
    -- FOR SHARE locks exactly the deterministic latest-100 window used below.
    -- Concurrent UPDATE/DELETE of those rows waits until this command commits.
    FOR v_project_log IN
      SELECT project_log.id, project_log.images
      FROM public.project_logs AS project_log
      WHERE project_log.tenant_id = p_tenant_id
        AND project_log.project_id = p_project_id
      ORDER BY project_log.created_at DESC, project_log.id DESC
      LIMIT 100
      FOR SHARE
    LOOP
      IF v_project_log.images IS NOT NULL
        AND pg_catalog.jsonb_typeof(v_project_log.images) = 'array'
      THEN
        -- Match the application contract: keep the first 30 JSON string items,
        -- trim them, ignore unsupported legacy forms, and retain first-seen order.
        FOR image_reference IN
          SELECT pg_catalog.btrim(raw_image.value #>> '{}') AS value
          FROM pg_catalog.jsonb_array_elements(v_project_log.images)
            WITH ORDINALITY AS raw_image(value, ordinality)
          WHERE pg_catalog.jsonb_typeof(raw_image.value) = 'string'
          ORDER BY raw_image.ordinality
          LIMIT 30
        LOOP
          IF public.douyin_public_image_urls_are_valid(
              ARRAY[image_reference.value]
            )
            AND NOT (
              image_reference.value ~ '^https://'
              AND (
                pg_catalog.strpos(image_reference.value, '?') > 0
                OR pg_catalog.strpos(image_reference.value, '#') > 0
              )
            )
            AND (
              image_reference.value ~ '^https://'
              OR image_reference.value LIKE v_scope_prefix || '%'
            )
            AND pg_catalog.array_position(
              v_candidate_references,
              image_reference.value
            ) IS NULL
            AND pg_catalog.cardinality(v_candidate_references) < 300
          THEN
            v_candidate_references := pg_catalog.array_append(
              v_candidate_references,
              image_reference.value
            );
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    FOR selected_reference IN
      SELECT reference.value
      FROM pg_catalog.unnest(v_image_references) AS reference(value)
    LOOP
      IF pg_catalog.array_position(
        v_candidate_references,
        selected_reference.value
      ) IS NULL
      THEN
        RETURN pg_catalog.jsonb_build_object(
          'error', pg_catalog.jsonb_build_object(
            'status_code', 400,
            'code', 'DOUYIN_PROJECT_IMAGE_NOT_ATTACHED',
            'message', '公开图片必须来自当前项目的施工日志'
          )
        );
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.douyin_project_public_profiles AS profile (
    tenant_id,
    project_id,
    public_title,
    public_description,
    public_image_urls,
    style_tags,
    budget_band,
    publication_status
  )
  VALUES (
    p_tenant_id,
    p_project_id,
    v_public_title,
    v_public_description,
    v_image_references,
    v_style_tags,
    v_budget_band,
    p_publication_status
  )
  ON CONFLICT (tenant_id, project_id) DO UPDATE
  SET public_title = EXCLUDED.public_title,
    public_description = EXCLUDED.public_description,
    public_image_urls = EXCLUDED.public_image_urls,
    style_tags = EXCLUDED.style_tags,
    budget_band = EXCLUDED.budget_band,
    publication_status = EXCLUDED.publication_status
  RETURNING profile.* INTO v_saved_profile;

  -- The locks above guarantee write-time atomicity.
  -- Later project-log deletion can detach a saved reference; lifecycle policy
  -- must handle that later detachment.
  RETURN pg_catalog.jsonb_build_object(
    'data', pg_catalog.to_jsonb(v_saved_profile)
  );
END;
$function$;

COMMENT ON FUNCTION public.upsert_douyin_project_public_profile(
  uuid, uuid, text, text, text[], text[], text, text
) IS 'Atomically validates tenant-owned project-log image references and saves a Douyin public project profile; later project-log deletion can detach a saved reference.';

REVOKE ALL ON FUNCTION public.upsert_douyin_project_public_profile(
  uuid, uuid, text, text, text[], text[], text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_douyin_project_public_profile(
  uuid, uuid, text, text, text[], text[], text, text
)
TO service_role;

COMMIT;
