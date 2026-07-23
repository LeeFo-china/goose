-- Rollback: in a new migration, drop the four triggers and
-- set_supplier_contract_tenant_id(), then drop supplier_contracts,
-- tenant_suppliers, and tenant_supplier_settings in that order. This is
-- destructive and removes tenant cooperation settings and contract records,
-- so export and reconcile dependent procurement data first.

BEGIN;

CREATE TABLE public.tenant_supplier_settings (
  tenant_id uuid PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_enabled boolean NOT NULL DEFAULT false,
  require_active_contract_for_new_order boolean NOT NULL DEFAULT false,
  enabled_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  enabled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_supplier_settings_enabled_metadata_check CHECK (
    NOT module_enabled
    OR (
      enabled_by_employee_id IS NOT NULL
      AND enabled_at IS NOT NULL
    )
  ),
  CONSTRAINT tenant_supplier_settings_version_check
    CHECK (version > 0)
);

CREATE TABLE public.tenant_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  relationship_status text NOT NULL DEFAULT 'evaluating',
  settlement_term_days integer NOT NULL DEFAULT 0,
  credit_limit_minor bigint NOT NULL DEFAULT 0,
  invoice_required_before_payment boolean NOT NULL DEFAULT false,
  default_currency char(3) NOT NULL DEFAULT 'CNY',
  default_tax_inclusive boolean NOT NULL DEFAULT true,
  tenant_owner_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  started_at date NULL,
  ended_at date NULL,
  remark text NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_suppliers_relationship_status_check
    CHECK (
      relationship_status IN ('evaluating', 'active', 'suspended', 'terminated', 'blacklisted')
    ),
  CONSTRAINT tenant_suppliers_settlement_term_days_check
    CHECK (settlement_term_days BETWEEN 0 AND 3650),
  CONSTRAINT tenant_suppliers_credit_limit_minor_check
    CHECK (credit_limit_minor >= 0),
  CONSTRAINT tenant_suppliers_default_currency_check
    CHECK (default_currency::text ~ '^[A-Z]{3}$'),
  CONSTRAINT tenant_suppliers_date_order_check
    CHECK (
      started_at IS NULL
      OR ended_at IS NULL
      OR ended_at >= started_at
    ),
  CONSTRAINT tenant_suppliers_remark_not_blank_check
    CHECK (remark IS NULL OR btrim(remark) <> ''),
  CONSTRAINT tenant_suppliers_version_check
    CHECK (version > 0),
  CONSTRAINT tenant_suppliers_tenant_supplier_key
    UNIQUE (tenant_id, supplier_id),
  CONSTRAINT tenant_suppliers_id_tenant_key
    UNIQUE (id, tenant_id)
);

CREATE INDEX tenant_suppliers_tenant_status_updated_idx
ON public.tenant_suppliers(
  tenant_id,
  relationship_status,
  updated_at DESC,
  id DESC
);

CREATE INDEX tenant_suppliers_supplier_status_idx
ON public.tenant_suppliers(
  supplier_id,
  relationship_status,
  tenant_id
);

CREATE TABLE public.supplier_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  tenant_supplier_id uuid NOT NULL
    REFERENCES public.tenant_suppliers(id) ON DELETE RESTRICT,
  contract_no text NOT NULL,
  name text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'draft',
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  settlement_term_days integer NOT NULL DEFAULT 0,
  invoice_required_before_payment boolean NOT NULL DEFAULT false,
  document_file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_contracts_contract_no_not_blank_check
    CHECK (btrim(contract_no) <> ''),
  CONSTRAINT supplier_contracts_name_not_blank_check
    CHECK (btrim(name) <> ''),
  CONSTRAINT supplier_contracts_lifecycle_status_check
    CHECK (lifecycle_status IN ('draft', 'active', 'terminated')),
  CONSTRAINT supplier_contracts_date_order_check
    CHECK (valid_until >= valid_from),
  CONSTRAINT supplier_contracts_settlement_term_days_check
    CHECK (settlement_term_days BETWEEN 0 AND 3650),
  CONSTRAINT supplier_contracts_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_contracts_tenant_contract_no_key
    UNIQUE (tenant_id, contract_no),
  CONSTRAINT supplier_contracts_tenant_supplier_tenant_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id)
    REFERENCES public.tenant_suppliers(id, tenant_id)
    ON DELETE RESTRICT
);

CREATE INDEX supplier_contracts_active_lookup_idx
ON public.supplier_contracts(
  tenant_id,
  tenant_supplier_id,
  lifecycle_status,
  valid_until DESC
);

CREATE FUNCTION public.set_supplier_contract_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_tenant_id uuid;
BEGIN
  SELECT relationship.tenant_id
  INTO parent_tenant_id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = NEW.tenant_supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '租户供应商合作关系不存在';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tenant_id;
  ELSIF NEW.tenant_id <> parent_tenant_id THEN
    RAISE EXCEPTION '供应商合同租户与合作关系租户不一致';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_supplier_contract_tenant_id()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_contracts_set_tenant_id
BEFORE INSERT OR UPDATE ON public.supplier_contracts
FOR EACH ROW
EXECUTE FUNCTION public.set_supplier_contract_tenant_id();

CREATE TRIGGER tr_tenant_supplier_settings_updated_at
BEFORE UPDATE ON public.tenant_supplier_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_suppliers_updated_at
BEFORE UPDATE ON public.tenant_suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_supplier_contracts_updated_at
BEFORE UPDATE ON public.supplier_contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_supplier_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_supplier_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contracts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_supplier_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_suppliers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_contracts FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.tenant_supplier_settings FROM service_role;
REVOKE ALL ON TABLE public.tenant_suppliers FROM service_role;
REVOKE ALL ON TABLE public.supplier_contracts FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_supplier_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_suppliers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_contracts TO service_role;

COMMIT;
