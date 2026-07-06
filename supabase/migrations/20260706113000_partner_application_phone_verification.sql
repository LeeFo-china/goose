ALTER TABLE public.sms_verification_codes
ADD COLUMN IF NOT EXISTS request_device text NULL;

ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check
CHECK (
  scene = ANY (
    ARRAY[
      'bind_customer'::text,
      'bind_employee'::text,
      'admin_login'::text,
      'rebind_wechat'::text,
      'bind_platform_partner'::text,
      'partner_application'::text
    ]
  )
);

CREATE INDEX IF NOT EXISTS sms_verification_codes_scene_phone_created_idx
ON public.sms_verification_codes (scene, phone, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_verification_codes_scene_ip_created_idx
ON public.sms_verification_codes (scene, request_ip, created_at DESC)
WHERE request_ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_verification_codes_scene_device_created_idx
ON public.sms_verification_codes (scene, request_device, created_at DESC)
WHERE request_device IS NOT NULL;
