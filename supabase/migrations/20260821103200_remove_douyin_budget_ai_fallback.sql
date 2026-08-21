-- Rollback: forward-only. If rollback is required, assign an explicitly
-- approved fallback model in a later migration after re-evaluating the
-- 60-second lease and provider timeout budget. Preserve route and call history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.ai_scene_routes
SET fallback_model_id = NULL
WHERE scene_code = 'douyin_budget_explanation'
  AND fallback_model_id IS NOT NULL;

DO $block$
BEGIN
  IF (
    SELECT count(*)
    FROM public.ai_scene_routes AS route
    JOIN public.ai_models AS model
      ON model.id = route.primary_model_id
    JOIN public.ai_providers AS provider
      ON provider.id = model.provider_id
    WHERE route.scene_code = 'douyin_budget_explanation'
      AND route.fallback_model_id IS NULL
      AND route.temperature = 0.200::numeric
      AND route.response_format = 'json_object'
      AND route.timeout_ms = 30000
      AND route.status = 'active'
      AND model.code = 'deepseek-chat'
      AND model.status = 'active'
      AND provider.code = 'deepseek'
      AND provider.status = 'active'
  ) <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_AI_FALLBACK_REPAIR_INVALID';
  END IF;
END;
$block$;

COMMIT;
