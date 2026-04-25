CREATE TABLE IF NOT EXISTS public.customer_project_log_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  log_id uuid NOT NULL REFERENCES public.project_logs(id) ON DELETE CASCADE,
  selected_copy_id text NULL,
  selected_copy_text text NULL,
  action text NOT NULL CHECK (action IN ('generate_copy', 'copy_text', 'save_image')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_project_log_shares_customer_id
ON public.customer_project_log_shares(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_project_log_shares_project_id
ON public.customer_project_log_shares(project_id);

CREATE INDEX IF NOT EXISTS idx_customer_project_log_shares_log_id
ON public.customer_project_log_shares(log_id);

COMMENT ON TABLE public.customer_project_log_shares IS '客户施工日志分享行为记录';
COMMENT ON COLUMN public.customer_project_log_shares.selected_copy_id IS '客户选择的 AI 文案 ID';
COMMENT ON COLUMN public.customer_project_log_shares.selected_copy_text IS '客户最终选择的分享文案';
COMMENT ON COLUMN public.customer_project_log_shares.action IS '分享行为: generate_copy/copy_text/save_image';
