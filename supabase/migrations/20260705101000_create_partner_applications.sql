CREATE TABLE IF NOT EXISTS public.platform_partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL UNIQUE,
  applicant_name text NOT NULL,
  subject_type text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  region_codes text[] NOT NULL DEFAULT '{}'::text[],
  region_name text NULL,
  business_description text NULL,
  resource_description text NULL,
  message text NULL,
  source_channel text NOT NULL DEFAULT 'official_website',
  source_url text NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id),
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  converted_partner_id uuid NULL REFERENCES public.platform_partners(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_applications_subject_type_check CHECK (
    subject_type IN ('personal', 'individual_business', 'company')
  ),
  CONSTRAINT platform_partner_applications_status_check CHECK (
    status IN ('submitted', 'reviewing', 'approved', 'rejected')
  ),
  CONSTRAINT platform_partner_applications_applicant_name_not_blank CHECK (
    btrim(applicant_name) <> ''
  ),
  CONSTRAINT platform_partner_applications_contact_name_not_blank CHECK (
    btrim(contact_name) <> ''
  ),
  CONSTRAINT platform_partner_applications_phone_not_blank CHECK (
    btrim(phone) <> ''
  )
);

DROP TRIGGER IF EXISTS tr_platform_partner_applications_updated_at
  ON public.platform_partner_applications;
CREATE TRIGGER tr_platform_partner_applications_updated_at
  BEFORE UPDATE ON public.platform_partner_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS platform_partner_applications_status_created_idx
  ON public.platform_partner_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_partner_applications_phone_created_idx
  ON public.platform_partner_applications(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_partner_applications_region_codes_idx
  ON public.platform_partner_applications USING gin(region_codes);

CREATE INDEX IF NOT EXISTS platform_partner_applications_converted_partner_idx
  ON public.platform_partner_applications(converted_partner_id)
  WHERE converted_partner_id IS NOT NULL;

COMMENT ON TABLE public.platform_partner_applications IS '官网城市合伙人申请线索';
COMMENT ON COLUMN public.platform_partner_applications.application_no IS '申请编号，用于后台检索和人工沟通';
COMMENT ON COLUMN public.platform_partner_applications.converted_partner_id IS '审核通过后创建的正式城市合伙人 ID';
