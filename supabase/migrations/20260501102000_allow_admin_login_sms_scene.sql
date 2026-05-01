ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check
CHECK (
  scene = ANY (
    ARRAY[
      'bind_customer'::text,
      'bind_employee'::text,
      'admin_login'::text
    ]
  )
);
