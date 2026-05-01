CREATE TABLE IF NOT EXISTS public.project_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor text NOT NULL DEFAULT 'ezviz',
  vendor_device_serial text NOT NULL,
  channel_no integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  position text NULL,
  status text NOT NULL DEFAULT 'unknown',
  can_view boolean NOT NULL DEFAULT true,
  can_control boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_url text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  remark text NULL,
  video_encrypted boolean NOT NULL DEFAULT false,
  last_status_checked_at timestamptz NULL,
  last_status_error text NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_cameras_vendor_check CHECK (vendor IN ('ezviz')),
  CONSTRAINT project_cameras_status_check CHECK (status IN ('online', 'offline', 'unknown')),
  CONSTRAINT project_cameras_channel_no_check CHECK (channel_no > 0)
);

CREATE INDEX IF NOT EXISTS idx_project_cameras_project_id
  ON public.project_cameras(project_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_cameras_vendor_device_channel
  ON public.project_cameras(vendor, vendor_device_serial, channel_no)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS tr_project_cameras_updated_at ON public.project_cameras;

CREATE TRIGGER tr_project_cameras_updated_at
  BEFORE UPDATE ON public.project_cameras
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.ezviz_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ezviz_access_tokens_expires_at
  ON public.ezviz_access_tokens(expires_at);

DROP TRIGGER IF EXISTS tr_ezviz_access_tokens_updated_at ON public.ezviz_access_tokens;

CREATE TRIGGER tr_ezviz_access_tokens_updated_at
  BEFORE UPDATE ON public.ezviz_access_tokens
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.camera_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  camera_id uuid NOT NULL,
  user_id uuid NULL,
  user_role text NULL,
  action text NOT NULL,
  control_action text NULL,
  result text NOT NULL DEFAULT 'success',
  error_message text NULL,
  ip text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_access_logs_action_check
    CHECK (action IN ('list', 'play_params', 'refresh_status', 'control')),
  CONSTRAINT camera_access_logs_result_check
    CHECK (result IN ('success', 'failure'))
);

CREATE INDEX IF NOT EXISTS idx_camera_access_logs_project_id
  ON public.camera_access_logs(project_id);

CREATE INDEX IF NOT EXISTS idx_camera_access_logs_camera_id
  ON public.camera_access_logs(camera_id);

CREATE INDEX IF NOT EXISTS idx_camera_access_logs_created_at
  ON public.camera_access_logs(created_at);
