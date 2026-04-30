CREATE TABLE IF NOT EXISTS public.ai_decoration_qa_suggestion_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  scene text NOT NULL,
  project_id uuid NULL,
  questions jsonb NOT NULL,
  source text NOT NULL DEFAULT 'ai',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_decoration_qa_suggestion_cache_scene_check
    CHECK (scene IN ('visitor', 'customer', 'employee')),
  CONSTRAINT ai_decoration_qa_suggestion_cache_source_check
    CHECK (source IN ('ai', 'fallback'))
);

CREATE INDEX IF NOT EXISTS idx_ai_decoration_qa_suggestion_cache_expires_at
  ON public.ai_decoration_qa_suggestion_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_ai_decoration_qa_suggestion_cache_project_id
  ON public.ai_decoration_qa_suggestion_cache (project_id);

DROP TRIGGER IF EXISTS tr_ai_decoration_qa_suggestion_cache_updated_at
  ON public.ai_decoration_qa_suggestion_cache;

CREATE TRIGGER tr_ai_decoration_qa_suggestion_cache_updated_at
  BEFORE UPDATE ON public.ai_decoration_qa_suggestion_cache
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();
