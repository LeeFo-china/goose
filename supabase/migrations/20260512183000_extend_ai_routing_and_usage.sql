ALTER TABLE public.ai_call_logs
ADD COLUMN IF NOT EXISTS raw_usage jsonb NULL,
ADD COLUMN IF NOT EXISTS cached_input_tokens integer NULL,
ADD COLUMN IF NOT EXISTS reasoning_tokens integer NULL;

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_model_created
ON public.ai_call_logs(model_code, created_at DESC);

INSERT INTO public.ai_scene_routes (
  scene_code,
  name,
  primary_model_id,
  temperature,
  response_format,
  timeout_ms,
  status
)
SELECT
  'marketing_page_create_fill',
  'H5 活动页创建 AI 回填',
  model.id,
  0.450::numeric,
  'json_object',
  60000,
  'active'
FROM public.ai_models model
WHERE model.code = 'deepseek-chat'
ON CONFLICT (scene_code) DO UPDATE SET
  name = EXCLUDED.name,
  primary_model_id = COALESCE(public.ai_scene_routes.primary_model_id, EXCLUDED.primary_model_id),
  temperature = EXCLUDED.temperature,
  response_format = EXCLUDED.response_format,
  timeout_ms = EXCLUDED.timeout_ms,
  status = EXCLUDED.status;

COMMENT ON COLUMN public.ai_call_logs.raw_usage IS 'AI 供应商返回的原始 usage，用于后续精细计费';
COMMENT ON COLUMN public.ai_call_logs.cached_input_tokens IS '缓存命中的输入 token 数';
COMMENT ON COLUMN public.ai_call_logs.reasoning_tokens IS '推理 token 数';
