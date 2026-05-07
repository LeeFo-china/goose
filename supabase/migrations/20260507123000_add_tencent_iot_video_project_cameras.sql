ALTER TABLE public.project_cameras
ADD COLUMN IF NOT EXISTS vendor_channel_id text NULL,
ADD COLUMN IF NOT EXISTS vendor_device_code text NULL,
ADD COLUMN IF NOT EXISTS vendor_channel_code text NULL,
ADD COLUMN IF NOT EXISTS play_protocol text NOT NULL DEFAULT 'flv';

ALTER TABLE public.project_cameras
DROP CONSTRAINT IF EXISTS project_cameras_vendor_check;

ALTER TABLE public.project_cameras
ADD CONSTRAINT project_cameras_vendor_check
CHECK (vendor IN ('ezviz', 'tencent_iotvideo_industry'));

ALTER TABLE public.project_cameras
DROP CONSTRAINT IF EXISTS project_cameras_play_protocol_check;

ALTER TABLE public.project_cameras
ADD CONSTRAINT project_cameras_play_protocol_check
CHECK (play_protocol IN ('flv', 'rtmp', 'hls'));

ALTER TABLE public.project_cameras
DROP CONSTRAINT IF EXISTS project_cameras_tencent_channel_required_check;

ALTER TABLE public.project_cameras
ADD CONSTRAINT project_cameras_tencent_channel_required_check
CHECK (
  vendor <> 'tencent_iotvideo_industry'
  OR vendor_channel_id IS NOT NULL
);

DROP INDEX IF EXISTS public.uniq_project_cameras_vendor_device_channel;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_cameras_ezviz_device_channel
  ON public.project_cameras(vendor, vendor_device_serial, channel_no)
  WHERE deleted_at IS NULL AND vendor = 'ezviz';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_cameras_tencent_device_channel
  ON public.project_cameras(vendor, vendor_device_serial, vendor_channel_id)
  WHERE deleted_at IS NULL AND vendor = 'tencent_iotvideo_industry';

COMMENT ON COLUMN public.project_cameras.vendor_channel_id IS '厂商通道唯一ID，腾讯云行业版为 ChannelId';
COMMENT ON COLUMN public.project_cameras.vendor_device_code IS '厂商设备业务编码，腾讯云行业版为 DeviceCode';
COMMENT ON COLUMN public.project_cameras.vendor_channel_code IS '厂商通道业务编码，腾讯云行业版为 ChannelCode';
COMMENT ON COLUMN public.project_cameras.play_protocol IS '默认播放协议：flv、rtmp、hls';

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
VALUES
  ('TENCENTCLOUD_SECRET_ID', 'tencent_iot_video', '腾讯云 SecretId', '腾讯云物联网智能视频服务（行业版）SecretId，加密存储。', 'string', NULL, true, 'active'),
  ('TENCENTCLOUD_SECRET_KEY', 'tencent_iot_video', '腾讯云 SecretKey', '腾讯云物联网智能视频服务（行业版）SecretKey，加密存储。', 'string', NULL, true, 'active'),
  ('TENCENT_IOT_VIDEO_REGION', 'tencent_iot_video', '腾讯云区域', '物联网智能视频服务（行业版）API 区域。', 'string', NULL, false, 'active'),
  ('TENCENT_IOT_VIDEO_ENDPOINT', 'tencent_iot_video', '腾讯云 API Endpoint', '物联网智能视频服务（行业版）API 域名。', 'string', NULL, false, 'active'),
  ('TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL', 'tencent_iot_video', '腾讯云默认播放协议', '小程序播放优先使用协议，建议 flv。', 'string', NULL, false, 'active'),
  ('TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION', 'tencent_iot_video', '腾讯云实时地址接口', '默认使用新版 DescribeChannelLiveStreamURL；异常时后端会尝试旧接口兜底。', 'string', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
