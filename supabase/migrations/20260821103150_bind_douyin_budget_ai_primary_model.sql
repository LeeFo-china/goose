-- Rollback: forward-only. If the product-approved primary model changes,
-- bind the replacement explicitly in a later migration. Preserve route and
-- call history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.ai_scene_routes AS route
SET primary_model_id = model.id
FROM public.ai_models AS model
JOIN public.ai_providers AS provider
  ON provider.id = model.provider_id
WHERE route.scene_code = 'douyin_budget_explanation'
  AND model.code = 'deepseek-chat'
  AND model.status = 'active'
  AND provider.code = 'deepseek'
  AND provider.status = 'active';

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
      MESSAGE = 'DOUYIN_BUDGET_AI_PRIMARY_BINDING_INVALID';
  END IF;
END;
$block$;

COMMIT;
