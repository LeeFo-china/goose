CREATE TABLE IF NOT EXISTS public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  provider_type text NOT NULL,
  endpoint_url text NULL,
  api_key_setting_key text NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_providers_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT ai_providers_type_check CHECK (
    provider_type = ANY (ARRAY['openai_compatible'::text])
  ),
  CONSTRAINT ai_providers_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'inactive'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_providers_code
ON public.ai_providers(code);

CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  model_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_models_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT ai_models_model_name_not_blank CHECK (btrim(model_name) <> ''),
  CONSTRAINT ai_models_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'inactive'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_models_code
ON public.ai_models(code);

CREATE INDEX IF NOT EXISTS idx_ai_models_provider
ON public.ai_models(provider_id, status);

CREATE TABLE IF NOT EXISTS public.ai_scene_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_code text NOT NULL,
  name text NOT NULL,
  primary_model_id uuid NULL REFERENCES public.ai_models(id) ON DELETE SET NULL,
  fallback_model_id uuid NULL REFERENCES public.ai_models(id) ON DELETE SET NULL,
  temperature numeric(4, 3) NULL,
  response_format text NULL,
  timeout_ms integer NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_scene_routes_scene_code_not_blank CHECK (btrim(scene_code) <> ''),
  CONSTRAINT ai_scene_routes_response_format_check CHECK (
    response_format IS NULL
    OR response_format = ANY (ARRAY['json_object'::text, 'text'::text])
  ),
  CONSTRAINT ai_scene_routes_timeout_check CHECK (
    timeout_ms IS NULL OR (timeout_ms >= 1000 AND timeout_ms <= 300000)
  ),
  CONSTRAINT ai_scene_routes_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'inactive'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_scene_routes_scene
ON public.ai_scene_routes(scene_code);

CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id),
  scene_code text NOT NULL,
  provider_code text NULL,
  model_code text NULL,
  model_name text NULL,
  status text NOT NULL,
  request_id text NULL,
  duration_ms integer NULL,
  prompt_tokens integer NULL,
  completion_tokens integer NULL,
  total_tokens integer NULL,
  error_code text NULL,
  error_message text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_call_logs_status_check CHECK (
    status = ANY (ARRAY['success'::text, 'failure'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_tenant_scene_created
ON public.ai_call_logs(tenant_id, scene_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_scene_created
ON public.ai_call_logs(scene_code, created_at DESC);

DROP TRIGGER IF EXISTS tr_ai_providers_updated_at ON public.ai_providers;
CREATE TRIGGER tr_ai_providers_updated_at
BEFORE UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_ai_models_updated_at ON public.ai_models;
CREATE TRIGGER tr_ai_models_updated_at
BEFORE UPDATE ON public.ai_models
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_ai_scene_routes_updated_at ON public.ai_scene_routes;
CREATE TRIGGER tr_ai_scene_routes_updated_at
BEFORE UPDATE ON public.ai_scene_routes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.ai_providers (
  code,
  name,
  provider_type,
  endpoint_url,
  api_key_setting_key,
  status,
  sort_order
)
VALUES
  ('deepseek', 'DeepSeek', 'openai_compatible', 'https://api.deepseek.com/chat/completions', 'DEEPSEEK_API_KEY', 'active', 10),
  ('openai', 'OpenAI Compatible', 'openai_compatible', 'https://api.openai.com/v1/chat/completions', 'AI_API_KEY', 'active', 20)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  endpoint_url = EXCLUDED.endpoint_url,
  api_key_setting_key = EXCLUDED.api_key_setting_key,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.ai_models (
  provider_id,
  code,
  name,
  model_name,
  status,
  sort_order
)
SELECT provider.id, 'deepseek-chat', 'DeepSeek Chat', 'deepseek-chat', 'active', 10
FROM public.ai_providers provider
WHERE provider.code = 'deepseek'
ON CONFLICT (code) DO UPDATE SET
  provider_id = EXCLUDED.provider_id,
  name = EXCLUDED.name,
  model_name = EXCLUDED.model_name,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.ai_scene_routes (
  scene_code,
  name,
  primary_model_id,
  temperature,
  response_format,
  timeout_ms,
  status
)
SELECT scene.scene_code, scene.name, model.id, scene.temperature, scene.response_format, scene.timeout_ms, 'active'
FROM (
  VALUES
    ('marketing_page_block_fill', 'H5 活动页模块 AI 回填', 0.400::numeric, 'json_object', 60000),
    ('marketing_page_settings_fill', 'H5 活动页配置 AI 回填', 0.350::numeric, 'json_object', 60000),
    ('social_video_script', '短视频脚本生成', 0.450::numeric, 'json_object', 25000),
    ('customer_log_share_copy', '客户施工日志分享文案', 0.800::numeric, 'json_object', 30000),
    ('decoration_qa', '装修问答', 0.700::numeric, 'json_object', 60000),
    ('decoration_qa_title', '装修问答标题生成', 0.300::numeric, 'json_object', 60000)
) AS scene(scene_code, name, temperature, response_format, timeout_ms)
CROSS JOIN public.ai_models model
WHERE model.code = 'deepseek-chat'
ON CONFLICT (scene_code) DO UPDATE SET
  name = EXCLUDED.name,
  primary_model_id = EXCLUDED.primary_model_id,
  temperature = EXCLUDED.temperature,
  response_format = EXCLUDED.response_format,
  timeout_ms = EXCLUDED.timeout_ms,
  status = EXCLUDED.status;

COMMENT ON TABLE public.ai_providers IS '平台级 AI 供应商配置，不存储密钥明文';
COMMENT ON TABLE public.ai_models IS '平台级 AI 模型配置';
COMMENT ON TABLE public.ai_scene_routes IS 'AI 业务场景到模型的路由配置';
COMMENT ON TABLE public.ai_call_logs IS 'AI 调用日志，用于租户用量归因和 token 统计';
