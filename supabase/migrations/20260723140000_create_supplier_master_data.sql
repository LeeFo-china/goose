-- Rollback: in a new migration, drop the six updated_at triggers, then drop
-- supplier_contacts, supplier_addresses, supplier_service_regions,
-- supplier_qualifications, suppliers, and supplier_qualification_types in that
-- order. This is destructive and removes supplier records and qualification
-- document references, so export and reconcile dependent business data first.

BEGIN;

CREATE TABLE public.supplier_qualification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  applicable_supplier_types text[] NOT NULL DEFAULT '{}'::text[],
  warning_days integer NOT NULL DEFAULT 30,
  is_required boolean NOT NULL DEFAULT false,
  blocks_new_orders boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_qualification_types_code_not_blank_check
    CHECK (btrim(code) <> ''),
  CONSTRAINT supplier_qualification_types_name_not_blank_check
    CHECK (btrim(name) <> ''),
  CONSTRAINT supplier_qualification_types_applicable_supplier_types_check CHECK (
    applicable_supplier_types <@ ARRAY[
      'manufacturer',
      'brand_agent',
      'distributor',
      'retailer',
      'other'
    ]::text[]
    AND array_position(applicable_supplier_types, NULL) IS NULL
    AND cardinality(array_positions(applicable_supplier_types, 'manufacturer')) <= 1
    AND cardinality(array_positions(applicable_supplier_types, 'brand_agent')) <= 1
    AND cardinality(array_positions(applicable_supplier_types, 'distributor')) <= 1
    AND cardinality(array_positions(applicable_supplier_types, 'retailer')) <= 1
    AND cardinality(array_positions(applicable_supplier_types, 'other')) <= 1
  ),
  CONSTRAINT supplier_qualification_types_warning_days_check
    CHECK (warning_days BETWEEN 0 AND 3650),
  CONSTRAINT supplier_qualification_types_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT supplier_qualification_types_version_check
    CHECK (version > 0)
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text NOT NULL,
  unified_social_credit_code text NULL,
  supplier_type text NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'draft',
  operational_status text NOT NULL DEFAULT 'active',
  review_remark text NULL,
  reviewed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  blacklisted_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  blacklisted_at timestamptz NULL,
  blacklist_reason text NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_code_not_blank_check
    CHECK (btrim(code) <> ''),
  CONSTRAINT suppliers_name_not_blank_check
    CHECK (btrim(name) <> ''),
  CONSTRAINT suppliers_legal_name_not_blank_check
    CHECK (btrim(legal_name) <> ''),
  CONSTRAINT suppliers_credit_code_not_blank_check
    CHECK (
      unified_social_credit_code IS NULL
      OR btrim(unified_social_credit_code) <> ''
    ),
  CONSTRAINT suppliers_supplier_type_check
    CHECK (
      supplier_type IN ('manufacturer', 'brand_agent', 'distributor', 'retailer', 'other')
    ),
  CONSTRAINT suppliers_onboarding_status_check
    CHECK (
      onboarding_status IN ('draft', 'pending_review', 'approved', 'rejected')
    ),
  CONSTRAINT suppliers_operational_status_check
    CHECK (operational_status IN ('active', 'suspended', 'blacklisted')),
  CONSTRAINT suppliers_version_check
    CHECK (version > 0)
);

CREATE UNIQUE INDEX suppliers_credit_code_unique_idx
ON public.suppliers(upper(btrim(unified_social_credit_code)))
WHERE unified_social_credit_code IS NOT NULL
  AND btrim(unified_social_credit_code) <> '';

CREATE INDEX suppliers_platform_queue_idx
ON public.suppliers(
  onboarding_status,
  operational_status,
  updated_at DESC,
  id DESC
);

CREATE INDEX suppliers_code_trgm_idx
ON public.suppliers USING gin (code extensions.gin_trgm_ops);

CREATE INDEX suppliers_name_trgm_idx
ON public.suppliers USING gin (name extensions.gin_trgm_ops);

CREATE INDEX suppliers_legal_name_trgm_idx
ON public.suppliers USING gin (legal_name extensions.gin_trgm_ops);

CREATE INDEX suppliers_credit_code_trgm_idx
ON public.suppliers
USING gin (unified_social_credit_code extensions.gin_trgm_ops);

CREATE TABLE public.supplier_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  qualification_type_id uuid NOT NULL
    REFERENCES public.supplier_qualification_types(id) ON DELETE RESTRICT,
  document_file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  certificate_no text NULL,
  valid_from date NULL,
  valid_until date NULL,
  verification_status text NOT NULL DEFAULT 'pending',
  verified_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  verified_at timestamptz NULL,
  rejection_reason text NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_qualifications_date_order_check
    CHECK (
      valid_from IS NULL
      OR valid_until IS NULL
      OR valid_until >= valid_from
    ),
  CONSTRAINT supplier_qualifications_verification_status_check
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  CONSTRAINT supplier_qualifications_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_qualifications_supplier_type_document_key
    UNIQUE (supplier_id, qualification_type_id, document_file_id)
);

CREATE INDEX supplier_qualifications_health_lookup_idx
ON public.supplier_qualifications(
  supplier_id,
  qualification_type_id,
  verification_status,
  valid_until DESC
);

CREATE TABLE public.supplier_service_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  region_code text NOT NULL,
  region_level text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  valid_from date NULL,
  valid_until date NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_service_regions_region_code_not_blank_check
    CHECK (btrim(region_code) <> ''),
  CONSTRAINT supplier_service_regions_region_level_check
    CHECK (region_level IN ('province', 'city', 'district')),
  CONSTRAINT supplier_service_regions_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT supplier_service_regions_date_order_check
    CHECK (
      valid_from IS NULL
      OR valid_until IS NULL
      OR valid_until >= valid_from
    ),
  CONSTRAINT supplier_service_regions_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_service_regions_supplier_region_key
    UNIQUE (supplier_id, region_code)
);

CREATE INDEX supplier_service_regions_lookup_idx
ON public.supplier_service_regions(
  region_code,
  status,
  valid_until DESC,
  supplier_id
);

CREATE TABLE public.supplier_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  address_type text NOT NULL,
  province text NULL,
  city text NULL,
  district text NULL,
  region_code text NOT NULL,
  address_detail text NOT NULL,
  longitude numeric(10, 7) NULL,
  latitude numeric(9, 7) NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_addresses_address_type_check
    CHECK (address_type IN ('registered', 'shipping', 'return', 'other')),
  CONSTRAINT supplier_addresses_region_code_not_blank_check
    CHECK (btrim(region_code) <> ''),
  CONSTRAINT supplier_addresses_address_detail_not_blank_check
    CHECK (btrim(address_detail) <> ''),
  CONSTRAINT supplier_addresses_longitude_check
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT supplier_addresses_latitude_check
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT supplier_addresses_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT supplier_addresses_version_check
    CHECK (version > 0)
);

CREATE INDEX supplier_addresses_supplier_type_status_default_idx
ON public.supplier_addresses(
  supplier_id,
  address_type,
  status,
  is_default DESC
);

CREATE UNIQUE INDEX supplier_addresses_active_default_type_unique_idx
ON public.supplier_addresses(supplier_id, address_type)
WHERE is_default AND status = 'active';

CREATE TABLE public.supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  contact_type text NOT NULL,
  name text NOT NULL,
  phone text NULL,
  email text NULL,
  is_public boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_contacts_contact_type_check
    CHECK (
      contact_type IN ('primary', 'sales', 'finance', 'logistics', 'after_sales')
    ),
  CONSTRAINT supplier_contacts_name_not_blank_check
    CHECK (btrim(name) <> ''),
  CONSTRAINT supplier_contacts_phone_not_blank_check
    CHECK (phone IS NULL OR btrim(phone) <> ''),
  CONSTRAINT supplier_contacts_email_not_blank_check
    CHECK (email IS NULL OR btrim(email) <> ''),
  CONSTRAINT supplier_contacts_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT supplier_contacts_version_check
    CHECK (version > 0)
);

CREATE INDEX supplier_contacts_supplier_type_idx
ON public.supplier_contacts(
  supplier_id,
  contact_type,
  is_primary DESC
);

CREATE UNIQUE INDEX supplier_contacts_active_primary_type_unique_idx
ON public.supplier_contacts(supplier_id, contact_type)
WHERE is_primary AND status = 'active';

CREATE TRIGGER tr_supplier_qualification_types_updated_at
BEFORE UPDATE ON public.supplier_qualification_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_supplier_qualifications_updated_at
BEFORE UPDATE ON public.supplier_qualifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_supplier_service_regions_updated_at
BEFORE UPDATE ON public.supplier_service_regions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_supplier_addresses_updated_at
BEFORE UPDATE ON public.supplier_addresses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_supplier_contacts_updated_at
BEFORE UPDATE ON public.supplier_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_qualification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_qualification_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_qualifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_service_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_service_regions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplier_qualification_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_qualifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_service_regions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_addresses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_contacts FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.supplier_qualification_types FROM service_role;
REVOKE ALL ON TABLE public.suppliers FROM service_role;
REVOKE ALL ON TABLE public.supplier_qualifications FROM service_role;
REVOKE ALL ON TABLE public.supplier_service_regions FROM service_role;
REVOKE ALL ON TABLE public.supplier_addresses FROM service_role;
REVOKE ALL ON TABLE public.supplier_contacts FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_qualification_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_qualifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_service_regions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_addresses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_contacts TO service_role;

INSERT INTO public.supplier_qualification_types (
  code,
  name,
  applicable_supplier_types,
  warning_days,
  is_required,
  blocks_new_orders,
  sort_order
)
VALUES (
  'business_license',
  '营业执照',
  ARRAY[
    'manufacturer',
    'brand_agent',
    'distributor',
    'retailer',
    'other'
  ]::text[],
  30,
  true,
  true,
  10
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  applicable_supplier_types = EXCLUDED.applicable_supplier_types,
  warning_days = EXCLUDED.warning_days,
  is_required = EXCLUDED.is_required,
  blocks_new_orders = EXCLUDED.blocks_new_orders,
  sort_order = EXCLUDED.sort_order;

COMMIT;
