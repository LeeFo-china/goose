-- Rollback: forward-only. Disable the scene in a later migration while
-- preserving its route identity and AI usage history. Do not delete provider,
-- model, route, or call-log rows as rollback.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.ai_scene_routes (
  scene_code,
  name,
  primary_model_id,
  fallback_model_id,
  temperature,
  response_format,
  timeout_ms,
  status
)
SELECT
  'douyin_budget_explanation',
  '抖音预算初算解释',
  model.id,
  NULL,
  0.200::numeric,
  'json_object',
  30000,
  'active'
FROM public.ai_models AS model
JOIN public.ai_providers AS provider
  ON provider.id = model.provider_id
WHERE model.code = 'deepseek-chat'
  AND model.status = 'active'
  AND provider.status = 'active'
  AND provider.endpoint_url IS NOT NULL
  AND provider.api_key_setting_key IS NOT NULL
ON CONFLICT (scene_code) DO UPDATE SET
  name = EXCLUDED.name,
  primary_model_id = COALESCE(
    public.ai_scene_routes.primary_model_id,
    EXCLUDED.primary_model_id
  ),
  fallback_model_id = COALESCE(
    public.ai_scene_routes.fallback_model_id,
    EXCLUDED.fallback_model_id
  ),
  temperature = EXCLUDED.temperature,
  response_format = EXCLUDED.response_format,
  timeout_ms = EXCLUDED.timeout_ms,
  status = EXCLUDED.status;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.ai_scene_routes AS route
    JOIN public.ai_models AS model
      ON model.id = route.primary_model_id
    JOIN public.ai_providers AS provider
      ON provider.id = model.provider_id
    WHERE route.scene_code = 'douyin_budget_explanation'
      AND route.status = 'active'
      AND model.status = 'active'
      AND provider.status = 'active'
      AND provider.endpoint_url IS NOT NULL
      AND provider.api_key_setting_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_AI_ROUTE_MODEL_UNAVAILABLE';
  END IF;
END;
$block$;

COMMIT;
