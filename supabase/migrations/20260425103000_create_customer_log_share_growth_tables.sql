CREATE TABLE IF NOT EXISTS public.customer_log_share_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  log_id uuid NOT NULL REFERENCES public.project_logs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'reward_claimed', 'closed')),
  channel text NULL,
  target_assist_count integer NOT NULL DEFAULT 10 CHECK (target_assist_count > 0),
  assist_count integer NOT NULL DEFAULT 0 CHECK (assist_count >= 0),
  assist_uv integer NOT NULL DEFAULT 0 CHECK (assist_uv >= 0),
  poster_generated_at timestamptz NULL,
  poster_saved_at timestamptz NULL,
  achieved_at timestamptz NULL,
  reward_claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_campaigns_customer_id
ON public.customer_log_share_campaigns(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_campaigns_project_id
ON public.customer_log_share_campaigns(project_id);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_campaigns_log_id
ON public.customer_log_share_campaigns(log_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_log_share_campaigns_active_unique
ON public.customer_log_share_campaigns(customer_id, project_id, log_id)
WHERE status = 'active';

DROP TRIGGER IF EXISTS tr_customer_log_share_campaigns_updated_at ON public.customer_log_share_campaigns;

CREATE TRIGGER tr_customer_log_share_campaigns_updated_at
  BEFORE UPDATE ON public.customer_log_share_campaigns
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

COMMENT ON TABLE public.customer_log_share_campaigns IS '客户施工日志分享助力活动';

CREATE TABLE IF NOT EXISTS public.customer_log_share_assists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.customer_log_share_campaigns(id) ON DELETE CASCADE,
  share_token text NOT NULL,
  helper_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  helper_openid text NULL,
  helper_device_id text NULL,
  helper_ip text NULL,
  source text NOT NULL CHECK (source IN ('qrcode', 'poster')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_assists_campaign_id
ON public.customer_log_share_assists(campaign_id);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_assists_share_token
ON public.customer_log_share_assists(share_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_log_share_assists_campaign_helper_user_unique
ON public.customer_log_share_assists(campaign_id, helper_auth_user_id)
WHERE helper_auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_log_share_assists_campaign_helper_openid_unique
ON public.customer_log_share_assists(campaign_id, helper_openid)
WHERE helper_auth_user_id IS NULL AND helper_openid IS NOT NULL;

COMMENT ON TABLE public.customer_log_share_assists IS '客户施工日志分享活动助力记录';

CREATE TABLE IF NOT EXISTS public.customer_log_share_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.customer_log_share_campaigns(id) ON DELETE CASCADE,
  share_token text NOT NULL,
  visitor_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_openid text NULL,
  visitor_device_id text NULL,
  visitor_ip text NULL,
  source text NOT NULL CHECK (source IN ('qrcode', 'poster')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_opens_campaign_id
ON public.customer_log_share_opens(campaign_id);

CREATE INDEX IF NOT EXISTS idx_customer_log_share_opens_share_token
ON public.customer_log_share_opens(share_token);

COMMENT ON TABLE public.customer_log_share_opens IS '客户施工日志分享活动打开记录';
