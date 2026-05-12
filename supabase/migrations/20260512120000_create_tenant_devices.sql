CREATE TABLE IF NOT EXISTS public.tenant_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  vendor text NOT NULL,
  vendor_device_serial text NOT NULL,
  vendor_device_code text NULL,
  vendor_device_name text NULL,
  vendor_channel_id text NULL,
  vendor_channel_code text NULL,
  vendor_channel_name text NULL,
  device_type text NULL,
  source_project_id uuid NULL REFERENCES public.projects(id),
  bound_project_id uuid NULL REFERENCES public.projects(id),
  bound_camera_id uuid NULL REFERENCES public.project_cameras(id),
  status text NOT NULL DEFAULT 'unknown',
  raw_status text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.employees(id),
  updated_by uuid NULL REFERENCES public.employees(id),
  last_synced_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_devices_vendor_check
    CHECK (vendor IN ('ezviz', 'tencent_iotvideo_industry')),
  CONSTRAINT tenant_devices_status_check
    CHECK (status IN ('online', 'offline', 'unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_devices_vendor_device_channel_unique
  ON public.tenant_devices (
    vendor,
    vendor_device_serial,
    COALESCE(vendor_channel_id, '')
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_devices_tenant_vendor_idx
  ON public.tenant_devices(tenant_id, vendor, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_devices_tenant_bound_project_idx
  ON public.tenant_devices(tenant_id, bound_project_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS tr_tenant_devices_updated_at ON public.tenant_devices;

CREATE TRIGGER tr_tenant_devices_updated_at
  BEFORE UPDATE ON public.tenant_devices
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO public.tenant_devices (
  tenant_id,
  vendor,
  vendor_device_serial,
  vendor_device_code,
  vendor_channel_id,
  vendor_channel_code,
  vendor_channel_name,
  source_project_id,
  bound_project_id,
  bound_camera_id,
  status,
  metadata,
  last_synced_at,
  created_at,
  updated_at
)
SELECT
  camera.tenant_id,
  camera.vendor,
  camera.vendor_device_serial,
  camera.vendor_device_code,
  camera.vendor_channel_id,
  camera.vendor_channel_code,
  camera.name,
  camera.project_id,
  camera.project_id,
  camera.id,
  camera.status,
  jsonb_build_object(
    'position', camera.position,
    'channel_no', camera.channel_no,
    'play_protocol', camera.play_protocol
  ),
  camera.last_status_checked_at,
  camera.created_at,
  camera.updated_at
FROM public.project_cameras camera
WHERE camera.deleted_at IS NULL
  AND camera.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.tenant_devices IS '租户设备资产表，记录第三方设备或通道的本地租户归属';
COMMENT ON COLUMN public.tenant_devices.tenant_id IS '设备所属租户，由登录上下文和项目归属推导，不接受前端直接指定';
COMMENT ON COLUMN public.tenant_devices.vendor_device_serial IS '第三方设备主ID，腾讯云为DeviceId，萤石为设备序列号';
COMMENT ON COLUMN public.tenant_devices.vendor_channel_id IS '第三方通道ID，腾讯云为ChannelId，萤石可为空';
COMMENT ON COLUMN public.tenant_devices.source_project_id IS '创建设备或首次纳入资产时使用的项目ID';
COMMENT ON COLUMN public.tenant_devices.bound_project_id IS '当前绑定项目ID，未绑定为空';
COMMENT ON COLUMN public.tenant_devices.bound_camera_id IS '当前绑定的project_cameras记录ID，未绑定为空';
