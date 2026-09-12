-- Rollback: application rollback preserves this registry, its history, and guards.
-- Only a separately reviewed repair migration may remove them after proving no
-- deployed caller depends on the identity constraints.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.ai_scene_routes IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  conflicting_scene_code text;
BEGIN
  SELECT route.scene_code
  INTO conflicting_scene_code
  FROM public.ai_scene_routes AS route
  GROUP BY route.scene_code
  HAVING count(DISTINCT route.modality) > 1
  ORDER BY route.scene_code
  LIMIT 1;

  IF conflicting_scene_code IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ai_system_scene_historical_modality_conflict',
      DETAIL = conflicting_scene_code;
  END IF;

  SELECT route.scene_code
  INTO conflicting_scene_code
  FROM public.ai_scene_routes AS route
  JOIN (VALUES
    ('customer_log_share_copy', 'text'),
    ('decoration_qa', 'text'),
    ('decoration_qa_title', 'text'),
    ('decoration_raw_drawing', 'image'),
    ('douyin_budget_explanation', 'text'),
    ('marketing_page_block_fill', 'text'),
    ('marketing_page_create_fill', 'text'),
    ('marketing_page_settings_fill', 'text'),
    ('project_operational_risk_summary', 'text'),
    ('social_video_script', 'text')
  ) AS expected(scene_code, modality)
    ON expected.scene_code = route.scene_code
  WHERE route.modality <> expected.modality
  ORDER BY route.scene_code
  LIMIT 1;

  IF conflicting_scene_code IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ai_system_scene_historical_modality_conflict',
      DETAIL = conflicting_scene_code;
  END IF;
END;
$$;

CREATE TABLE public.ai_system_scenes (
  code text PRIMARY KEY,
  name text NOT NULL,
  modality text NOT NULL,
  required_input_modalities text[] NOT NULL,
  runtime_status text NOT NULL,
  requirements_source text NOT NULL,
  requires_streaming boolean NOT NULL,
  min_reference_images integer NOT NULL,
  source text NOT NULL,
  allow_new_configuration boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ai_system_scenes_code_check CHECK (
    source = 'legacy'
    OR (code = btrim(code) AND char_length(code) BETWEEN 1 AND 120)
  ),
  CONSTRAINT ai_system_scenes_name_check CHECK (
    source = 'legacy'
    OR (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120)
  ),
  CONSTRAINT ai_system_scenes_modality_check CHECK (
    modality = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'speech'::text])
  ),
  CONSTRAINT ai_system_scenes_required_input_modalities_check CHECK (
    cardinality(required_input_modalities) BETWEEN 1 AND 4
    AND required_input_modalities <@ ARRAY['text'::text, 'image'::text, 'video'::text, 'speech'::text]
  ),
  CONSTRAINT ai_system_scenes_runtime_status_check CHECK (
    runtime_status = ANY (ARRAY['connected'::text, 'not_connected'::text])
  ),
  CONSTRAINT ai_system_scenes_requirements_source_check CHECK (
    requirements_source = ANY (ARRAY['runtime'::text, 'planned_adapter'::text])
  ),
  CONSTRAINT ai_system_scenes_min_reference_images_check CHECK (min_reference_images >= 0),
  CONSTRAINT ai_system_scenes_source_check CHECK (
    source = ANY (ARRAY['system'::text, 'legacy'::text])
  ),
  CONSTRAINT ai_system_scenes_configuration_source_check CHECK (
    (source = 'system' AND allow_new_configuration)
    OR (source = 'legacy' AND NOT allow_new_configuration)
  )
);

CREATE UNIQUE INDEX ai_system_scenes_code_modality_key
ON public.ai_system_scenes(code, modality);

INSERT INTO public.ai_system_scenes (
  code,
  name,
  modality,
  required_input_modalities,
  runtime_status,
  requirements_source,
  requires_streaming,
  min_reference_images,
  source,
  allow_new_configuration
)
SELECT
  definition.code,
  definition.name,
  definition.modality,
  definition.required_input_modalities,
  definition.runtime_status,
  definition.requirements_source,
  definition.requires_streaming,
  definition.min_reference_images,
  'system'::text,
  true
FROM (VALUES
  ('customer_log_share_copy', '客户施工日志分享文案', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('decoration_qa', '装修问答', 'text', ARRAY['text']::text[], 'connected', 'runtime', true, 0),
  ('decoration_qa_title', '装修问答标题生成', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('decoration_raw_drawing', '装修生图', 'image', ARRAY['text', 'image']::text[], 'not_connected', 'planned_adapter', false, 2),
  ('douyin_budget_explanation', '抖音预算初算解释', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('marketing_page_block_fill', 'H5 活动页模块 AI 回填', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('marketing_page_create_fill', 'H5 活动页创建 AI 回填', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('marketing_page_settings_fill', 'H5 活动页配置 AI 回填', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('project_operational_risk_summary', '项目运营风险摘要', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0),
  ('social_video_script', '短视频脚本生成', 'text', ARRAY['text']::text[], 'connected', 'runtime', false, 0)
) AS definition(
  code,
  name,
  modality,
  required_input_modalities,
  runtime_status,
  requirements_source,
  requires_streaming,
  min_reference_images
);

INSERT INTO public.ai_system_scenes (
  code,
  name,
  modality,
  required_input_modalities,
  runtime_status,
  requirements_source,
  requires_streaming,
  min_reference_images,
  source,
  allow_new_configuration
)
SELECT
  route.scene_code,
  (array_agg(route.name ORDER BY route.created_at, route.id))[1],
  route.modality,
  ARRAY[route.modality],
  'connected'::text,
  'runtime'::text,
  false,
  0,
  'legacy'::text,
  false
FROM public.ai_scene_routes AS route
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_system_scenes AS registered
  WHERE registered.code = route.scene_code
)
GROUP BY route.scene_code, route.modality;

ALTER TABLE public.ai_scene_routes
  ADD CONSTRAINT ai_scene_routes_system_scene_identity_fkey
  FOREIGN KEY (scene_code, modality)
  REFERENCES public.ai_system_scenes(code, modality)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.ai_scene_routes
  VALIDATE CONSTRAINT ai_scene_routes_system_scene_identity_fkey;

CREATE FUNCTION public.ai_system_scene_registry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'ai_system_scene_registry_immutable';
END;
$function$;

CREATE TRIGGER tr_ai_system_scene_registry_immutable
BEFORE UPDATE OR DELETE ON public.ai_system_scenes
FOR EACH ROW EXECUTE FUNCTION public.ai_system_scene_registry_immutable();

CREATE FUNCTION public.ai_scene_route_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scene public.ai_system_scenes%ROWTYPE;
BEGIN
  SELECT * INTO scene
  FROM public.ai_system_scenes
  WHERE code = NEW.scene_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ai_scene_not_registered';
  END IF;

  IF TG_OP = 'INSERT' AND NOT scene.allow_new_configuration THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_route_new_configuration_forbidden';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.scene_code IS DISTINCT FROM OLD.scene_code
      OR NEW.modality IS DISTINCT FROM OLD.modality THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_route_identity_immutable';
    END IF;
  END IF;

  IF scene.source = 'system' AND scene.runtime_status = 'not_connected' THEN
    IF TG_OP = 'INSERT' AND (
      NEW.primary_model_id IS NOT NULL OR NEW.fallback_model_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_runtime_not_connected';
    ELSIF TG_OP = 'UPDATE' AND (
      (NEW.primary_model_id IS NOT NULL AND NEW.primary_model_id IS DISTINCT FROM OLD.primary_model_id)
      OR (NEW.fallback_model_id IS NOT NULL AND NEW.fallback_model_id IS DISTINCT FROM OLD.fallback_model_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ai_scene_runtime_not_connected';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_ai_scene_route_identity_guard
BEFORE INSERT OR UPDATE ON public.ai_scene_routes
FOR EACH ROW EXECUTE FUNCTION public.ai_scene_route_identity_guard();

ALTER TABLE public.ai_system_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_system_scenes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_system_scenes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_system_scenes TO service_role;

REVOKE ALL ON FUNCTION public.ai_system_scene_registry_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_scene_route_identity_guard() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.ai_system_scenes IS '固定 AI 场景注册表；历史未知路由以 legacy 只读身份保留';

COMMIT;
