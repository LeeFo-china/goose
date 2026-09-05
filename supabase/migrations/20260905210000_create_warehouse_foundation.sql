-- Rollback: forward-only. First disable warehouse procurement through the
-- rollout gate, revoke and drop create_tenant_warehouse/update_tenant_warehouse,
-- then archive or export warehouse_command_events before dropping warehouse
-- foundation tables. Default warehouses created by this migration are tenant
-- bootstrap data and must be reconciled with downstream stock records before
-- removal.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.tenant_supplier_settings
ADD COLUMN warehouse_procurement_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_supplier_settings
ADD CONSTRAINT tenant_supplier_settings_warehouse_procurement_parent_check
CHECK (
  NOT warehouse_procurement_enabled
  OR (
    module_enabled
    AND procurement_snapshot_v1_enabled
    AND purchase_batch_workflow_enabled
  )
);

CREATE SEQUENCE public.warehouse_code_seq AS bigint START WITH 1;

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_code text NOT NULL DEFAULT (
    'WH-' || lpad(nextval('public.warehouse_code_seq')::text, 6, '0')
  ),
  name text NOT NULL,
  address text NULL,
  contact_name text NULL,
  contact_phone text NULL,
  manager_employee_id uuid NULL,
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NULL,
  updated_by_employee_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT warehouses_code_not_blank_check
    CHECK (btrim(warehouse_code) <> ''),
  CONSTRAINT warehouses_code_length_check
    CHECK (char_length(btrim(warehouse_code)) <= 30),
  CONSTRAINT warehouses_address_check
    CHECK (address IS NULL OR char_length(btrim(address)) <= 200),
  CONSTRAINT warehouses_contact_name_check
    CHECK (contact_name IS NULL OR char_length(btrim(contact_name)) <= 50),
  CONSTRAINT warehouses_contact_phone_check
    CHECK (contact_phone IS NULL OR char_length(btrim(contact_phone)) <= 30),
  CONSTRAINT warehouses_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT warehouses_default_active_check
    CHECK (NOT is_default OR status = 'active'),
  CONSTRAINT warehouses_version_check
    CHECK (version > 0),
  CONSTRAINT warehouses_id_tenant_key
    UNIQUE (id, tenant_id),
  CONSTRAINT warehouses_tenant_code_key
    UNIQUE (tenant_id, warehouse_code),
  CONSTRAINT warehouses_manager_tenant_fkey
    FOREIGN KEY (manager_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT warehouses_created_by_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT warehouses_updated_by_tenant_fkey
    FOREIGN KEY (updated_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT
);

ALTER SEQUENCE public.warehouse_code_seq
OWNED BY public.warehouses.warehouse_code;

CREATE INDEX warehouses_tenant_status_updated_idx
ON public.warehouses(tenant_id, status, updated_at DESC, id DESC);

CREATE UNIQUE INDEX warehouses_one_default_per_tenant_idx
ON public.warehouses(tenant_id)
WHERE status = 'active'
  AND is_default;

CREATE TABLE public.warehouse_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  command text NOT NULL CHECK (command IN ('create', 'update')),
  from_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (
    btrim(idempotency_key) <> ''
    AND char_length(idempotency_key) <= 120
  ),
  request_fingerprint text NOT NULL,
  result_version integer NOT NULL CHECK (result_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_command_events_warehouse_tenant_fkey
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES public.warehouses(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT warehouse_command_events_actor_tenant_fkey
    FOREIGN KEY (actor_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX warehouse_command_events_tenant_warehouse_idx
ON public.warehouse_command_events(
  tenant_id,
  warehouse_id,
  created_at DESC,
  id DESC
);

CREATE TRIGGER tr_warehouses_updated_at
BEFORE UPDATE ON public.warehouses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.create_tenant_warehouse(
  p_warehouse_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_address text,
  p_contact_name text,
  p_contact_phone text,
  p_manager_employee_id uuid,
  p_is_default boolean,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS public.warehouses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.warehouse_command_events%ROWTYPE;
  v_warehouse public.warehouses%ROWTYPE;
  v_name text;
  v_address text;
  v_contact_name text;
  v_contact_phone text;
  v_request jsonb;
  v_request_fingerprint text;
  v_is_default boolean;
BEGIN
  IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'WAREHOUSE_COMMAND_FORBIDDEN';
  END IF;

  v_name := NULLIF(btrim(p_name), '');
  v_address := NULLIF(btrim(p_address), '');
  v_contact_name := NULLIF(btrim(p_contact_name), '');
  v_contact_phone := NULLIF(btrim(p_contact_phone), '');

  IF p_warehouse_id IS NULL
    OR p_tenant_id IS NULL
    OR v_name IS NULL
    OR char_length(v_name) > 80
    OR (v_address IS NOT NULL AND char_length(v_address) > 200)
    OR (v_contact_name IS NOT NULL AND char_length(v_contact_name) > 50)
    OR (v_contact_phone IS NOT NULL AND char_length(v_contact_phone) > 30)
    OR p_is_default IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WAREHOUSE_COMMAND_INVALID';
  END IF;

  v_request := jsonb_build_object(
    'warehouse_id', p_warehouse_id,
    'tenant_id', p_tenant_id,
    'name', v_name,
    'address', v_address,
    'contact_name', v_contact_name,
    'contact_phone', v_contact_phone,
    'manager_employee_id', p_manager_employee_id,
    'is_default', p_is_default,
    'actor_employee_id', p_actor_employee_id
  );
  v_request_fingerprint := encode(sha256(v_request::text::bytea), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'warehouse-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.warehouse_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.warehouse_id <> p_warehouse_id
      OR v_event.command <> 'create'
      OR v_event.request_fingerprint <> v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WAREHOUSE_IDEMPOTENCY_CONFLICT';
    END IF;

    SELECT *
    INTO v_warehouse
    FROM jsonb_populate_record(NULL::public.warehouses, v_event.to_state);

    RETURN v_warehouse;
  END IF;

  PERFORM 1
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_TENANT_INVALID';
  END IF;

  PERFORM 1
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.user_id = p_actor_user_id
    AND employee.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_ACTOR_INVALID';
  END IF;

  IF p_manager_employee_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.id = p_manager_employee_id
        AND employee.tenant_id = p_tenant_id
        AND employee.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_MANAGER_INVALID';
  END IF;

  PERFORM warehouse.id
  FROM public.warehouses AS warehouse
  WHERE warehouse.tenant_id = p_tenant_id
  ORDER BY warehouse.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.warehouses AS warehouse
    WHERE warehouse.id = p_warehouse_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_STATE_CONFLICT';
  END IF;

  v_is_default := p_is_default;
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses AS warehouse
    WHERE warehouse.tenant_id = p_tenant_id
      AND warehouse.status = 'active'
  )
  THEN
    v_is_default := true;
  END IF;

  IF v_is_default THEN
    UPDATE public.warehouses AS warehouse
    SET is_default = false,
        updated_by_employee_id = p_actor_employee_id,
        version = warehouse.version + 1
    WHERE warehouse.tenant_id = p_tenant_id
      AND warehouse.status = 'active'
      AND warehouse.is_default;
  END IF;

  INSERT INTO public.warehouses (
    id,
    tenant_id,
    name,
    address,
    contact_name,
    contact_phone,
    manager_employee_id,
    is_default,
    version,
    created_by_employee_id,
    updated_by_employee_id
  )
  VALUES (
    p_warehouse_id,
    p_tenant_id,
    v_name,
    v_address,
    v_contact_name,
    v_contact_phone,
    p_manager_employee_id,
    v_is_default,
    1,
    p_actor_employee_id,
    p_actor_employee_id
  )
  RETURNING * INTO v_warehouse;

  INSERT INTO public.warehouse_command_events (
    tenant_id,
    warehouse_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    request_fingerprint,
    result_version
  )
  VALUES (
    p_tenant_id,
    v_warehouse.id,
    'create',
    jsonb_build_object('_request', v_request),
    to_jsonb(v_warehouse),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_request_fingerprint,
    v_warehouse.version
  );

  RETURN v_warehouse;
END;
$$;

CREATE FUNCTION public.update_tenant_warehouse(
  p_warehouse_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_name text,
  p_address text,
  p_address_set boolean,
  p_contact_name text,
  p_contact_name_set boolean,
  p_contact_phone text,
  p_contact_phone_set boolean,
  p_manager_employee_id uuid,
  p_manager_employee_id_set boolean,
  p_is_default boolean,
  p_status text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS public.warehouses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.warehouse_command_events%ROWTYPE;
  v_warehouse public.warehouses%ROWTYPE;
  v_before jsonb;
  v_name text;
  v_status text;
  v_address text;
  v_contact_name text;
  v_contact_phone text;
  v_manager_employee_id uuid;
  v_request jsonb;
  v_request_fingerprint text;
  v_is_default boolean;
BEGIN
  IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'WAREHOUSE_COMMAND_FORBIDDEN';
  END IF;

  v_name := NULLIF(btrim(p_name), '');
  v_address := NULLIF(btrim(p_address), '');
  v_contact_name := NULLIF(btrim(p_contact_name), '');
  v_contact_phone := NULLIF(btrim(p_contact_phone), '');
  v_status := lower(NULLIF(btrim(p_status), ''));

  IF p_warehouse_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_address_set IS NULL
    OR p_contact_name_set IS NULL
    OR p_contact_phone_set IS NULL
    OR p_manager_employee_id_set IS NULL
    OR (p_name IS NOT NULL AND (v_name IS NULL OR char_length(v_name) > 80))
    OR (p_address_set AND v_address IS NOT NULL AND char_length(v_address) > 200)
    OR (p_contact_name_set AND v_contact_name IS NOT NULL AND char_length(v_contact_name) > 50)
    OR (p_contact_phone_set AND v_contact_phone IS NOT NULL AND char_length(v_contact_phone) > 30)
    OR (p_status IS NOT NULL AND (v_status IS NULL OR v_status NOT IN ('active', 'inactive')))
    OR (
      p_name IS NULL
      AND NOT p_address_set
      AND NOT p_contact_name_set
      AND NOT p_contact_phone_set
      AND NOT p_manager_employee_id_set
      AND p_is_default IS NULL
      AND p_status IS NULL
    )
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WAREHOUSE_COMMAND_INVALID';
  END IF;

  v_request := jsonb_build_object(
    'warehouse_id', p_warehouse_id,
    'tenant_id', p_tenant_id,
    'expected_version', p_expected_version,
    'name', v_name,
    'address', v_address,
    'address_set', p_address_set,
    'contact_name', v_contact_name,
    'contact_name_set', p_contact_name_set,
    'contact_phone', v_contact_phone,
    'contact_phone_set', p_contact_phone_set,
    'manager_employee_id', p_manager_employee_id,
    'manager_employee_id_set', p_manager_employee_id_set,
    'is_default', p_is_default,
    'status', v_status,
    'actor_employee_id', p_actor_employee_id
  );
  v_request_fingerprint := encode(sha256(v_request::text::bytea), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'warehouse-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.warehouse_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.warehouse_id <> p_warehouse_id
      OR v_event.command <> 'update'
      OR v_event.request_fingerprint <> v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WAREHOUSE_IDEMPOTENCY_CONFLICT';
    END IF;

    SELECT *
    INTO v_warehouse
    FROM jsonb_populate_record(NULL::public.warehouses, v_event.to_state);

    RETURN v_warehouse;
  END IF;

  PERFORM 1
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_TENANT_INVALID';
  END IF;

  PERFORM 1
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.user_id = p_actor_user_id
    AND employee.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_ACTOR_INVALID';
  END IF;

  IF p_manager_employee_id_set
    AND p_manager_employee_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.id = p_manager_employee_id
        AND employee.tenant_id = p_tenant_id
        AND employee.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_MANAGER_INVALID';
  END IF;

  PERFORM warehouse.id
  FROM public.warehouses AS warehouse
  WHERE warehouse.tenant_id = p_tenant_id
  ORDER BY warehouse.id
  FOR UPDATE;

  SELECT warehouse.*
  INTO v_warehouse
  FROM public.warehouses AS warehouse
  WHERE warehouse.id = p_warehouse_id
    AND warehouse.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_NOT_FOUND';
  END IF;

  IF v_warehouse.version <> p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_VERSION_CONFLICT';
  END IF;

  v_name := COALESCE(v_name, v_warehouse.name);
  v_address := CASE WHEN p_address_set THEN v_address ELSE v_warehouse.address END;
  v_contact_name := CASE WHEN p_contact_name_set THEN v_contact_name ELSE v_warehouse.contact_name END;
  v_contact_phone := CASE WHEN p_contact_phone_set THEN v_contact_phone ELSE v_warehouse.contact_phone END;
  v_status := COALESCE(v_status, v_warehouse.status);
  v_is_default := COALESCE(p_is_default, v_warehouse.is_default);
  v_manager_employee_id := CASE
    WHEN p_manager_employee_id_set THEN p_manager_employee_id
    ELSE v_warehouse.manager_employee_id
  END;

  IF v_is_default AND v_status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_STATE_CONFLICT';
  END IF;

  IF v_warehouse.is_default
    AND (
      NOT v_is_default
      OR v_status <> 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_DEFAULT_REQUIRED';
  END IF;

  IF v_warehouse.status = 'active'
    AND v_status = 'inactive'
    AND NOT EXISTS (
      SELECT 1
      FROM public.warehouses AS warehouse
      WHERE warehouse.tenant_id = p_tenant_id
        AND warehouse.id <> p_warehouse_id
        AND warehouse.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WAREHOUSE_ACTIVE_REQUIRED';
  END IF;

  v_before := to_jsonb(v_warehouse);
  IF v_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.warehouses AS warehouse
      WHERE warehouse.tenant_id = p_tenant_id
        AND warehouse.id <> p_warehouse_id
        AND warehouse.status = 'active'
    )
  THEN
    v_is_default := true;
  END IF;

  IF v_is_default THEN
    UPDATE public.warehouses AS warehouse
    SET is_default = false,
        updated_by_employee_id = p_actor_employee_id,
        version = warehouse.version + 1
    WHERE warehouse.tenant_id = p_tenant_id
      AND warehouse.id <> p_warehouse_id
      AND warehouse.status = 'active'
      AND warehouse.is_default;
  END IF;

  UPDATE public.warehouses AS warehouse
  SET name = v_name,
      address = v_address,
      contact_name = v_contact_name,
      contact_phone = v_contact_phone,
      manager_employee_id = v_manager_employee_id,
      status = v_status,
      is_default = v_is_default,
      updated_by_employee_id = p_actor_employee_id,
      version = warehouse.version + 1
  WHERE warehouse.id = p_warehouse_id
    AND warehouse.tenant_id = p_tenant_id
  RETURNING * INTO v_warehouse;

  INSERT INTO public.warehouse_command_events (
    tenant_id,
    warehouse_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    request_fingerprint,
    result_version
  )
  VALUES (
    p_tenant_id,
    v_warehouse.id,
    'update',
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_warehouse),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_request_fingerprint,
    v_warehouse.version
  );

  RETURN v_warehouse;
END;
$$;

CREATE FUNCTION public.ensure_default_tenant_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_enabled_employee_id uuid;
BEGIN
  IF NEW.module_enabled
    AND (TG_OP = 'INSERT' OR OLD.module_enabled IS DISTINCT FROM true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.warehouses AS warehouse
      WHERE warehouse.tenant_id = NEW.tenant_id
    )
  THEN
    SELECT employee.id
    INTO v_enabled_employee_id
    FROM public.employees AS employee
    WHERE employee.id = NEW.enabled_by_employee_id
      AND employee.tenant_id = NEW.tenant_id;

    INSERT INTO public.warehouses (
      tenant_id,
      name,
      status,
      is_default,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      NEW.tenant_id,
      '公司仓库',
      'active',
      true,
      v_enabled_employee_id,
      v_enabled_employee_id
    );
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.warehouses (
  tenant_id,
  name,
  status,
  is_default,
  created_by_employee_id,
  updated_by_employee_id
)
SELECT
  setting.tenant_id,
  '公司仓库',
  'active',
  true,
  enabled_employee.id,
  enabled_employee.id
FROM public.tenant_supplier_settings AS setting
LEFT JOIN public.employees AS enabled_employee
  ON enabled_employee.id = setting.enabled_by_employee_id
  AND enabled_employee.tenant_id = setting.tenant_id
WHERE setting.module_enabled
  AND NOT EXISTS (
    SELECT 1
    FROM public.warehouses AS warehouse
    WHERE warehouse.tenant_id = setting.tenant_id
  );

CREATE TRIGGER tr_tenant_supplier_settings_ensure_default_warehouse
AFTER INSERT OR UPDATE OF module_enabled
ON public.tenant_supplier_settings
FOR EACH ROW
EXECUTE FUNCTION public.ensure_default_tenant_warehouse();

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_command_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.warehouses
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.warehouse_command_events
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.warehouse_code_seq
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.warehouses
TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.warehouse_command_events
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_tenant_warehouse(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_warehouse(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid,
  text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_warehouse(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_warehouse(
  uuid,
  uuid,
  integer,
  text,
  text,
  boolean,
  text,
  boolean,
  text,
  boolean,
  uuid,
  boolean,
  boolean,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tenant_warehouse(
  uuid,
  uuid,
  integer,
  text,
  text,
  boolean,
  text,
  boolean,
  text,
  boolean,
  uuid,
  boolean,
  boolean,
  text,
  uuid,
  uuid,
  text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_warehouse(
  uuid,
  uuid,
  integer,
  text,
  text,
  boolean,
  text,
  boolean,
  text,
  boolean,
  uuid,
  boolean,
  boolean,
  text,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_default_tenant_warehouse()
FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  (
    'inventory.warehouse.view',
    '查看仓库设置',
    'inventory',
    'warehouse',
    'view',
    '查看当前租户仓库设置',
    'active'
  ),
  (
    'inventory.warehouse.manage',
    '管理仓库设置',
    'inventory',
    'warehouse',
    'manage',
    '维护当前租户仓库设置',
    'active'
  ),
  (
    'inventory.stock.view',
    '查看库存',
    'inventory',
    'stock',
    'view',
    '查看当前租户库存',
    'active'
  ),
  (
    'inventory.issue.manage',
    '管理项目领料',
    'inventory',
    'issue',
    'manage',
    '维护项目领料申请',
    'active'
  ),
  (
    'inventory.issue.approve',
    '审批项目领料',
    'inventory',
    'issue',
    'approve',
    '审批项目领料申请',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'inventory.warehouse.view',
    'inventory.warehouse.manage',
    'inventory.stock.view',
    'inventory.issue.manage',
    'inventory.issue.approve'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
