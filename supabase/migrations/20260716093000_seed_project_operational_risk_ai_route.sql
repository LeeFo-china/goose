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
  'project_operational_risk_summary',
  '项目运营风险摘要',
  model.id,
  NULL,
  0.200::numeric,
  'json_object',
  30000,
  'active'
FROM public.ai_models model
WHERE model.code = 'deepseek-chat'
ON CONFLICT (scene_code) DO UPDATE SET
  name = EXCLUDED.name,
  primary_model_id = COALESCE(public.ai_scene_routes.primary_model_id, EXCLUDED.primary_model_id),
  fallback_model_id = COALESCE(public.ai_scene_routes.fallback_model_id, EXCLUDED.fallback_model_id),
  temperature = EXCLUDED.temperature,
  response_format = EXCLUDED.response_format,
  timeout_ms = EXCLUDED.timeout_ms,
  status = EXCLUDED.status;
