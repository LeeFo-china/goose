UPDATE public.platform_partner_applications
SET phone = '13907051105'
WHERE phone = '1390705110522';

DO $$
BEGIN
  ALTER TABLE public.platform_partner_applications
    ADD CONSTRAINT platform_partner_applications_phone_mobile_check
    CHECK (phone ~ '^1[3-9][0-9]{9}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.platform_partners
    ADD CONSTRAINT platform_partners_phone_mobile_check
    CHECK (phone ~ '^1[3-9][0-9]{9}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.platform_partner_members
    ADD CONSTRAINT platform_partner_members_phone_mobile_check
    CHECK (phone ~ '^1[3-9][0-9]{9}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
