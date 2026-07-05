ALTER TABLE public.platform_partner_members
ADD COLUMN IF NOT EXISTS remark text NULL;
