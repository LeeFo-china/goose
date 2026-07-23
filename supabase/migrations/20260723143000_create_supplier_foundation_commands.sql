-- Rollback: in a new migration, first DROP INDEX IF EXISTS
-- public.suppliers_available_directory_idx, then revoke and drop the nine
-- supplier command functions. Preserve/export supplier_command_events before
-- dropping the ledger because it is the lifecycle audit source of truth.

BEGIN;

CREATE TABLE public.supplier_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (
    resource_type IN ('supplier', 'supplier_qualification', 'tenant_supplier', 'supplier_contract')
  ),
  resource_id uuid NOT NULL,
  command text NOT NULL,
  from_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NULL,
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    btrim(idempotency_key) <> '' AND char_length(idempotency_key) <= 120
  ),
  result_version integer NOT NULL CHECK (result_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE public.supplier_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_command_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supplier_command_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.supplier_command_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.supplier_command_events FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX suppliers_available_directory_idx
ON public.suppliers(onboarding_status, operational_status, name, id);

CREATE FUNCTION public.create_platform_supplier(
  p_supplier_id uuid,
  p_code text,
  p_name text,
  p_legal_name text,
  p_unified_social_credit_code text,
  p_supplier_type text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_supplier_id IS NULL OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_expected_version IS DISTINCT FROM 0
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VERSION_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'code', p_code, 'name', p_name,
    'legal_name', p_legal_name,
    'unified_social_credit_code', p_unified_social_credit_code,
    'supplier_type', p_supplier_type, 'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier' OR v_event.resource_id <> p_supplier_id
      OR v_event.command <> 'create_platform_supplier'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;

  IF EXISTS (SELECT 1 FROM public.suppliers AS supplier WHERE supplier.id = p_supplier_id OR supplier.code = p_code) THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;

  BEGIN
    INSERT INTO public.suppliers (
      id, code, name, legal_name, unified_social_credit_code, supplier_type,
      onboarding_status, operational_status, version,
      created_by_employee_id, updated_by_employee_id
    )
    VALUES (
      p_supplier_id, p_code, p_name, p_legal_name, p_unified_social_credit_code,
      p_supplier_type, 'draft', 'active', 1, p_actor_employee_id, p_actor_employee_id
    )
    RETURNING * INTO v_supplier;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_STATE_CONFLICT'
      );
  END;

  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    'supplier', v_supplier.id, 'create_platform_supplier',
    jsonb_build_object('_request', v_request),
    to_jsonb(v_supplier), p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_supplier.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'supplier', to_jsonb(v_supplier), 'version', v_supplier.version);
END;
$$;

CREATE FUNCTION public.mutate_platform_supplier(
  p_supplier_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_before jsonb;
  v_next_onboarding text;
  v_next_operational text;
  v_request jsonb;
BEGIN
  IF p_supplier_id IS NULL OR p_action IS NULL OR p_expected_version IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'action', p_action,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier' OR v_event.resource_id <> p_supplier_id
      OR v_event.command <> 'mutate_platform_supplier:' || p_action
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;

  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  IF v_supplier.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_supplier.version);
  END IF;

  v_next_onboarding := v_supplier.onboarding_status;
  v_next_operational := v_supplier.operational_status;
  IF p_action = 'submit' AND v_supplier.onboarding_status IN ('draft', 'rejected') THEN
    v_next_onboarding := 'pending_review';
  ELSIF p_action = 'approve' AND v_supplier.onboarding_status = 'pending_review' THEN
    IF EXISTS (
      SELECT 1
      FROM public.supplier_qualification_types AS qualification_type
      WHERE qualification_type.status = 'active'
        AND qualification_type.is_required
        AND (
          cardinality(qualification_type.applicable_supplier_types) = 0
          OR v_supplier.supplier_type = ANY (qualification_type.applicable_supplier_types)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.supplier_qualifications AS qualification
          WHERE qualification.supplier_id = v_supplier.id
            AND qualification.qualification_type_id = qualification_type.id
            AND qualification.verification_status = 'verified'
            AND (qualification.valid_from IS NULL OR qualification.valid_from <= CURRENT_DATE)
            AND (qualification.valid_until IS NULL OR qualification.valid_until >= CURRENT_DATE)
        )
    ) THEN
      RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT', 'reason', 'required_qualification_missing');
    END IF;
    v_next_onboarding := 'approved';
  ELSIF p_action = 'reject' AND v_supplier.onboarding_status = 'pending_review' THEN
    v_next_onboarding := 'rejected';
  ELSIF p_action = 'suspend' AND v_supplier.operational_status = 'active' THEN
    v_next_operational := 'suspended';
  ELSIF p_action = 'resume' AND v_supplier.operational_status = 'suspended' THEN
    v_next_operational := 'active';
  ELSIF p_action = 'blacklist' AND v_supplier.operational_status IN ('active', 'suspended') THEN
    v_next_operational := 'blacklisted';
  ELSE
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;

  v_before := to_jsonb(v_supplier);
  UPDATE public.suppliers AS supplier
  SET onboarding_status = v_next_onboarding,
      operational_status = v_next_operational,
      review_remark = CASE WHEN p_action IN ('approve', 'reject') THEN p_reason ELSE supplier.review_remark END,
      reviewed_by_employee_id = CASE WHEN p_action IN ('approve', 'reject') THEN p_actor_employee_id ELSE supplier.reviewed_by_employee_id END,
      reviewed_at = CASE WHEN p_action IN ('approve', 'reject') THEN now() ELSE supplier.reviewed_at END,
      blacklisted_by_employee_id = CASE WHEN p_action = 'blacklist' THEN p_actor_employee_id ELSE supplier.blacklisted_by_employee_id END,
      blacklisted_at = CASE WHEN p_action = 'blacklist' THEN now() ELSE supplier.blacklisted_at END,
      blacklist_reason = CASE WHEN p_action = 'blacklist' THEN p_reason ELSE supplier.blacklist_reason END,
      updated_by_employee_id = p_actor_employee_id,
      version = supplier.version + 1
  WHERE supplier.id = p_supplier_id
  RETURNING * INTO v_supplier;

  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    'supplier', v_supplier.id, 'mutate_platform_supplier:' || p_action,
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_supplier), p_reason, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, v_supplier.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'supplier', to_jsonb(v_supplier), 'version', v_supplier.version);
END;
$$;

CREATE FUNCTION public.review_supplier_qualification(
  p_supplier_id uuid,
  p_qualification_id uuid,
  p_verification_status text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_qualification public.supplier_qualifications%ROWTYPE;
  v_qualification_supplier_id uuid;
  v_before jsonb;
  v_request jsonb;
BEGIN
  IF p_supplier_id IS NULL OR p_qualification_id IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  IF p_verification_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'qualification_id', p_qualification_id,
    'verification_status', p_verification_status,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_qualification'
      OR v_event.resource_id <> p_qualification_id
      OR v_event.command <> 'review_supplier_qualification:' || p_verification_status
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'qualification', v_event.to_state, 'version', v_event.result_version);
  END IF;
  SELECT qualification.supplier_id
  INTO v_qualification_supplier_id
  FROM public.supplier_qualifications AS qualification
  WHERE qualification.id = p_qualification_id;
  IF NOT FOUND OR v_qualification_supplier_id IS DISTINCT FROM p_supplier_id THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_qualification_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT qualification.* INTO v_qualification
  FROM public.supplier_qualifications AS qualification
  WHERE qualification.id = p_qualification_id
  FOR UPDATE;
  IF NOT FOUND OR v_qualification.supplier_id IS DISTINCT FROM p_supplier_id THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  IF v_qualification.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_qualification.version);
  END IF;
  v_before := to_jsonb(v_qualification);
  UPDATE public.supplier_qualifications AS qualification
  SET verification_status = p_verification_status,
      verified_by_employee_id = p_actor_employee_id,
      verified_at = now(),
      rejection_reason = CASE WHEN p_verification_status = 'rejected' THEN p_reason ELSE NULL END,
      updated_by_employee_id = p_actor_employee_id,
      version = qualification.version + 1
  WHERE qualification.id = p_qualification_id
  RETURNING * INTO v_qualification;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    'supplier_qualification', v_qualification.id,
    'review_supplier_qualification:' || p_verification_status,
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_qualification), p_reason, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, v_qualification.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'qualification', to_jsonb(v_qualification), 'version', v_qualification.version);
END;
$$;

CREATE FUNCTION public.set_tenant_supplier_module(
  p_tenant_id uuid,
  p_module_enabled boolean,
  p_require_active_contract_for_new_order boolean,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_before jsonb := '{}'::jsonb;
  v_request jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_module_enabled IS NULL
    OR p_require_active_contract_for_new_order IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order', p_require_active_contract_for_new_order,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier' OR v_event.resource_id <> p_tenant_id
      OR v_event.command <> 'set_tenant_supplier_module'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'setting', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1 FROM public.tenants AS tenant WHERE tenant.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT setting.* INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_setting.version <> p_expected_version THEN
      RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_setting.version);
    END IF;
    v_before := to_jsonb(v_setting);
    UPDATE public.tenant_supplier_settings AS setting
    SET module_enabled = p_module_enabled,
        require_active_contract_for_new_order = p_require_active_contract_for_new_order,
        enabled_by_employee_id = CASE WHEN p_module_enabled THEN p_actor_employee_id ELSE NULL END,
        enabled_at = CASE WHEN p_module_enabled THEN now() ELSE NULL END,
        version = setting.version + 1
    WHERE setting.tenant_id = p_tenant_id
    RETURNING * INTO v_setting;
  ELSE
    IF p_expected_version <> 0 THEN
      RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', 0);
    END IF;
    INSERT INTO public.tenant_supplier_settings (
      tenant_id, module_enabled, require_active_contract_for_new_order,
      enabled_by_employee_id, enabled_at, version
    )
    VALUES (
      p_tenant_id, p_module_enabled, p_require_active_contract_for_new_order,
      CASE WHEN p_module_enabled THEN p_actor_employee_id ELSE NULL END,
      CASE WHEN p_module_enabled THEN now() ELSE NULL END, 1
    )
    RETURNING * INTO v_setting;
  END IF;
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'tenant_supplier', p_tenant_id, 'set_tenant_supplier_module',
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_setting), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_setting.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'setting', to_jsonb(v_setting), 'version', v_setting.version);
END;
$$;

CREATE FUNCTION public.create_tenant_supplier(
  p_tenant_supplier_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_tenant_supplier_id IS NULL OR p_tenant_id IS NULL OR p_supplier_id IS NULL
    OR p_expected_version IS DISTINCT FROM 0 OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VERSION_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_supplier_id', p_tenant_supplier_id, 'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id, 'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier' OR v_event.resource_id <> p_tenant_supplier_id
      OR v_event.command <> 'create_tenant_supplier'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'tenant_supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR UPDATE;
  SELECT setting.* INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;
  IF NOT v_setting.module_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;
  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  IF v_supplier.onboarding_status <> 'approved'
    OR v_supplier.operational_status <> 'active'
  THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_suppliers AS relationship
    WHERE relationship.tenant_id = p_tenant_id AND relationship.supplier_id = p_supplier_id
  ) THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  INSERT INTO public.tenant_suppliers (
    id, tenant_id, supplier_id, relationship_status, version,
    created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_tenant_supplier_id, p_tenant_id, p_supplier_id, 'evaluating', 1,
    p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_relationship;
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'tenant_supplier', v_relationship.id, 'create_tenant_supplier',
    jsonb_build_object('_request', v_request),
    to_jsonb(v_relationship), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_relationship.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'tenant_supplier', to_jsonb(v_relationship), 'version', v_relationship.version);
END;
$$;

CREATE FUNCTION public.mutate_tenant_supplier(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_before jsonb;
  v_next_status text;
  v_request jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_supplier_id IS NULL OR p_action IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'tenant_supplier_id', p_tenant_supplier_id,
    'action', p_action, 'expected_version', p_expected_version,
    'reason', p_reason, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier' OR v_event.resource_id <> p_tenant_supplier_id
      OR v_event.command <> 'mutate_tenant_supplier:' || p_action
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'tenant_supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id AND relationship.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'tenant_supplier_not_found', 'error_code', 'TENANT_SUPPLIER_NOT_FOUND');
  END IF;
  IF v_relationship.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_relationship.version);
  END IF;
  IF p_action = 'activate' AND v_relationship.relationship_status IN ('evaluating', 'suspended') THEN
    v_next_status := 'active';
  ELSIF p_action = 'suspend' AND v_relationship.relationship_status = 'active' THEN
    v_next_status := 'suspended';
  ELSIF p_action = 'terminate' AND v_relationship.relationship_status IN ('evaluating', 'active', 'suspended') THEN
    v_next_status := 'terminated';
  ELSIF p_action = 'blacklist' AND v_relationship.relationship_status IN ('evaluating', 'active', 'suspended') THEN
    v_next_status := 'blacklisted';
  ELSE
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  v_before := to_jsonb(v_relationship);
  UPDATE public.tenant_suppliers AS relationship
  SET relationship_status = v_next_status,
      started_at = CASE WHEN p_action = 'activate' THEN COALESCE(relationship.started_at, CURRENT_DATE) ELSE relationship.started_at END,
      ended_at = CASE WHEN p_action IN ('terminate', 'blacklist') THEN CURRENT_DATE ELSE relationship.ended_at END,
      remark = COALESCE(p_reason, relationship.remark),
      updated_by_employee_id = p_actor_employee_id,
      version = relationship.version + 1
  WHERE relationship.id = p_tenant_supplier_id
  RETURNING * INTO v_relationship;
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'tenant_supplier', v_relationship.id,
    'mutate_tenant_supplier:' || p_action,
    v_before || jsonb_build_object('_request', v_request), to_jsonb(v_relationship),
    p_reason, p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_relationship.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'tenant_supplier', to_jsonb(v_relationship), 'version', v_relationship.version);
END;
$$;

CREATE FUNCTION public.mutate_supplier_contract(
  p_tenant_id uuid,
  p_contract_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_contract public.supplier_contracts%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_before jsonb;
  v_next_status text;
  v_request jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_contract_id IS NULL OR p_action IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'contract_id', p_contract_id,
    'action', p_action, 'expected_version', p_expected_version,
    'reason', p_reason, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_contract' OR v_event.resource_id <> p_contract_id
      OR v_event.command <> 'mutate_supplier_contract:' || p_action
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'contract', v_event.to_state, 'version', v_event.result_version);
  END IF;
  SELECT contract.* INTO v_contract
  FROM public.supplier_contracts AS contract
  WHERE contract.id = p_contract_id AND contract.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'tenant_supplier_not_found', 'error_code', 'TENANT_SUPPLIER_NOT_FOUND');
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = v_contract.tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.tenant_id IS DISTINCT FROM v_contract.tenant_id THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  IF v_contract.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_contract.version);
  END IF;
  IF p_action = 'activate' AND v_contract.lifecycle_status = 'draft' THEN
    v_next_status := 'active';
  ELSIF p_action = 'terminate' AND v_contract.lifecycle_status IN ('draft', 'active') THEN
    v_next_status := 'terminated';
  ELSE
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  v_before := to_jsonb(v_contract);
  UPDATE public.supplier_contracts AS contract
  SET lifecycle_status = v_next_status,
      updated_by_employee_id = p_actor_employee_id,
      version = contract.version + 1
  WHERE contract.id = p_contract_id
  RETURNING * INTO v_contract;
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_contract', v_contract.id,
    'mutate_supplier_contract:' || p_action,
    v_before || jsonb_build_object('_request', v_request), to_jsonb(v_contract),
    p_reason, p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_contract.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'contract', to_jsonb(v_contract), 'version', v_contract.version);
END;
$$;

CREATE FUNCTION public.get_tenant_supplier_order_eligibility(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_checked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_qualification_type public.supplier_qualification_types%ROWTYPE;
  v_reasons text[] := '{}'::text[];
  v_has_verified boolean;
  v_current_valid boolean;
  v_all_verified_expired boolean;
BEGIN
  IF p_checked_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false, 'blocking_reasons', jsonb_build_array('relationship_not_active'),
      'checked_at', p_checked_at, 'tenant_id', p_tenant_id,
      'tenant_supplier_id', p_tenant_supplier_id, 'error_code', 'TENANT_SUPPLIER_NOT_FOUND'
    );
  END IF;
  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_relationship.supplier_id;
  SELECT setting.* INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id;

  IF NOT FOUND OR NOT COALESCE(v_setting.module_enabled, false) THEN
    v_reasons := array_append(v_reasons, 'module_disabled');
  END IF;
  IF v_supplier.onboarding_status <> 'approved' THEN
    v_reasons := array_append(v_reasons, 'supplier_not_approved');
  END IF;
  IF v_supplier.operational_status = 'suspended' THEN
    v_reasons := array_append(v_reasons, 'supplier_suspended');
  END IF;
  IF v_supplier.operational_status = 'blacklisted' THEN
    v_reasons := array_append(v_reasons, 'supplier_blacklisted');
  END IF;
  IF v_relationship.relationship_status <> 'active' THEN
    v_reasons := array_append(v_reasons, 'relationship_not_active');
  END IF;

  FOR v_qualification_type IN
    SELECT qualification_type.*
    FROM public.supplier_qualification_types AS qualification_type
    WHERE qualification_type.status = 'active'
      AND qualification_type.blocks_new_orders
      AND (
        cardinality(qualification_type.applicable_supplier_types) = 0
        OR v_supplier.supplier_type = ANY (qualification_type.applicable_supplier_types)
      )
    ORDER BY qualification_type.sort_order, qualification_type.id
  LOOP
    SELECT
      COALESCE(bool_or(qualification.verification_status = 'verified'), false),
      COALESCE(bool_or(
        qualification.verification_status = 'verified'
        AND (qualification.valid_from IS NULL OR qualification.valid_from <= p_checked_at::date)
        AND (qualification.valid_until IS NULL OR qualification.valid_until >= p_checked_at::date)
      ), false),
      COALESCE(bool_and(
        qualification.valid_until IS NOT NULL
        AND qualification.valid_until < p_checked_at::date
      ) FILTER (WHERE qualification.verification_status = 'verified'), false)
    INTO v_has_verified, v_current_valid, v_all_verified_expired
    FROM public.supplier_qualifications AS qualification
    WHERE qualification.supplier_id = v_supplier.id
      AND qualification.qualification_type_id = v_qualification_type.id;

    IF v_current_valid THEN
      NULL;
    ELSIF v_has_verified AND v_all_verified_expired THEN
      IF NOT 'required_qualification_expired' = ANY (v_reasons) THEN
        v_reasons := array_append(v_reasons, 'required_qualification_expired');
      END IF;
    ELSE
      IF NOT 'required_qualification_missing' = ANY (v_reasons) THEN
        v_reasons := array_append(v_reasons, 'required_qualification_missing');
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(v_setting.require_active_contract_for_new_order, false)
    AND NOT EXISTS (
      SELECT 1
      FROM public.supplier_contracts AS contract
      WHERE contract.tenant_id = p_tenant_id
        AND contract.tenant_supplier_id = p_tenant_supplier_id
        AND contract.lifecycle_status = 'active'
        AND contract.valid_from <= p_checked_at::date
        AND contract.valid_until >= p_checked_at::date
    )
  THEN
    v_reasons := array_append(v_reasons, 'active_contract_required');
  END IF;

  RETURN jsonb_build_object(
    'eligible', cardinality(v_reasons) = 0,
    'blocking_reasons', to_jsonb(v_reasons),
    'checked_at', p_checked_at,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', v_relationship.id,
    'supplier_id', v_supplier.id,
    'supplier_version', v_supplier.version,
    'tenant_supplier_version', v_relationship.version
  );
END;
$$;

CREATE FUNCTION public.list_available_suppliers_for_tenant(
  p_tenant_id uuid,
  p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(p_page_size, 1), 100);
  v_items jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(directory_row)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      supplier.id,
      supplier.code,
      supplier.name,
      supplier.legal_name,
      supplier.supplier_type,
      supplier.onboarding_status,
      supplier.operational_status,
      supplier.version
    FROM public.suppliers AS supplier
    WHERE supplier.onboarding_status = 'approved'
      AND supplier.operational_status = 'active'
      AND (
        p_keyword IS NULL OR btrim(p_keyword) = ''
        OR supplier.code ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.legal_name ILIKE '%' || btrim(p_keyword) || '%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_suppliers AS blocked_relationship
        WHERE blocked_relationship.tenant_id = p_tenant_id
          AND blocked_relationship.supplier_id = supplier.id
          AND blocked_relationship.relationship_status IN ('blacklisted', 'terminated')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_suppliers AS existing_relationship
        WHERE existing_relationship.tenant_id = p_tenant_id
          AND existing_relationship.supplier_id = supplier.id
      )
    ORDER BY supplier.name ASC, supplier.id ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  ) AS directory_row;
  RETURN jsonb_build_object('items', v_items, 'page', v_page, 'page_size', v_page_size);
END;
$$;

REVOKE ALL ON FUNCTION public.create_platform_supplier(uuid, text, text, text, text, text, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_platform_supplier(uuid, text, text, text, text, text, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_platform_supplier(uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_platform_supplier(uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.review_supplier_qualification(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_supplier_qualification(uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.set_tenant_supplier_module(uuid, boolean, boolean, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_module(uuid, boolean, boolean, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_tenant_supplier(uuid, uuid, uuid, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_supplier(uuid, uuid, uuid, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_tenant_supplier(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_tenant_supplier(uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_supplier_contract(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_supplier_contract(uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_tenant_supplier_order_eligibility(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_supplier_order_eligibility(uuid, uuid, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.list_available_suppliers_for_tenant(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_suppliers_for_tenant(uuid, text, integer, integer) TO service_role;

COMMIT;
