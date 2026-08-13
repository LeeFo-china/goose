-- Rollback: forward-only. Disable private supplier writes and the new API routes,
-- then ship a forward migration that revokes the command grants. Preserve the
-- code registry, counters, supplier relationships, and command events because
-- allocated codes are permanent audit facts. Never drop ownership or reuse an
-- abandoned code. A timeout rolls back this entire migration; do not repair
-- partially migrated supplier codes manually.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    GROUP BY
      supplier.ownership_scope,
      supplier.owner_tenant_id,
      upper(btrim(supplier.code))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_SCOPE_DUPLICATE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE supplier.unified_social_credit_code IS NOT NULL
      AND btrim(supplier.unified_social_credit_code) <> ''
    GROUP BY
      supplier.ownership_scope,
      supplier.owner_tenant_id,
      upper(btrim(supplier.unified_social_credit_code))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CREDIT_CODE_SCOPE_DUPLICATE';
  END IF;
END;
$$;

ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_code_key;
DROP INDEX public.suppliers_credit_code_unique_idx;

CREATE UNIQUE INDEX suppliers_platform_code_unique_idx
ON public.suppliers(upper(btrim(code)))
WHERE ownership_scope = 'platform';

CREATE UNIQUE INDEX suppliers_tenant_code_unique_idx
ON public.suppliers(owner_tenant_id, upper(btrim(code)))
WHERE ownership_scope = 'tenant';

CREATE UNIQUE INDEX suppliers_platform_credit_code_unique_idx
ON public.suppliers(upper(btrim(unified_social_credit_code)))
WHERE ownership_scope = 'platform'
  AND unified_social_credit_code IS NOT NULL
  AND btrim(unified_social_credit_code) <> '';

CREATE UNIQUE INDEX suppliers_tenant_credit_code_unique_idx
ON public.suppliers(owner_tenant_id, upper(btrim(unified_social_credit_code)))
WHERE ownership_scope = 'tenant'
  AND unified_social_credit_code IS NOT NULL
  AND btrim(unified_social_credit_code) <> '';

CREATE TABLE public.tenant_supplier_code_counters (
  tenant_id uuid PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  next_value bigint NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_supplier_code_counters_next_value_check
    CHECK (next_value BETWEEN 1 AND 1000000),
  CONSTRAINT tenant_supplier_code_counters_version_check
    CHECK (version > 0)
);

CREATE TABLE public.tenant_supplier_code_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  normalized_code text NOT NULL,
  display_code text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  idempotency_key text NULL,
  request_digest jsonb NULL,
  tenant_supplier_id uuid NULL
    REFERENCES public.tenant_suppliers(id) ON DELETE RESTRICT,
  actor_user_id uuid NULL,
  actor_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz NULL,
  abandoned_at timestamptz NULL,
  CONSTRAINT tenant_supplier_code_registry_source_check
    CHECK (source IN ('generated', 'manual', 'migration')),
  CONSTRAINT tenant_supplier_code_registry_status_check
    CHECK (status IN ('reserved', 'used', 'abandoned')),
  CONSTRAINT tenant_supplier_code_registry_code_check CHECK (
    normalized_code = upper(btrim(normalized_code))
    AND display_code = normalized_code
    AND normalized_code ~ '^[A-Z0-9_-]{2,64}$'
  ),
  CONSTRAINT tenant_supplier_code_registry_idempotency_check CHECK (
    (
      source = 'generated'
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND char_length(idempotency_key) <= 120
      AND request_digest IS NOT NULL
      AND actor_user_id IS NOT NULL
      AND actor_employee_id IS NOT NULL
    )
    OR (
      source = 'manual'
      AND idempotency_key IS NULL
      AND request_digest IS NULL
      AND actor_user_id IS NOT NULL
      AND actor_employee_id IS NOT NULL
    )
    OR (
      source = 'migration'
      AND idempotency_key IS NULL
      AND request_digest IS NULL
      AND actor_user_id IS NULL
      AND actor_employee_id IS NULL
    )
  ),
  CONSTRAINT tenant_supplier_code_registry_lifecycle_check CHECK (
    (
      status = 'reserved'
      AND source = 'generated'
      AND tenant_supplier_id IS NULL
      AND consumed_at IS NULL
      AND abandoned_at IS NULL
    )
    OR (
      status = 'used'
      AND tenant_supplier_id IS NOT NULL
      AND consumed_at IS NOT NULL
      AND abandoned_at IS NULL
    )
    OR (
      status = 'abandoned'
      AND source = 'generated'
      AND tenant_supplier_id IS NULL
      AND consumed_at IS NULL
      AND abandoned_at IS NOT NULL
    )
  ),
  CONSTRAINT tenant_supplier_code_registry_tenant_code_key
    UNIQUE (tenant_id, normalized_code)
);

CREATE UNIQUE INDEX tenant_supplier_code_registry_generated_idempotency_idx
ON public.tenant_supplier_code_registry(tenant_id, idempotency_key)
WHERE source = 'generated' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX tenant_supplier_code_registry_relationship_idx
ON public.tenant_supplier_code_registry(tenant_supplier_id)
WHERE tenant_supplier_id IS NOT NULL;

CREATE INDEX tenant_supplier_code_registry_status_created_idx
ON public.tenant_supplier_code_registry(tenant_id, status, created_at, id);

ALTER TABLE public.tenant_suppliers
ADD COLUMN internal_supplier_code text NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT relationship.tenant_id
    FROM public.tenant_suppliers AS relationship
    GROUP BY relationship.tenant_id
    HAVING count(*) > 999999
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;
END;
$$;

WITH ranked_relationships AS (
  SELECT
    relationship.id,
    row_number() OVER (
      PARTITION BY relationship.tenant_id
      ORDER BY relationship.created_at, relationship.id
    ) AS sequence_value
  FROM public.tenant_suppliers AS relationship
)
UPDATE public.tenant_suppliers AS relationship
SET internal_supplier_code =
  'SUP-' || lpad(ranked.sequence_value::text, 6, '0')
FROM ranked_relationships AS ranked
WHERE ranked.id = relationship.id;

INSERT INTO public.tenant_supplier_code_registry (
  tenant_id,
  normalized_code,
  display_code,
  source,
  status,
  tenant_supplier_id,
  created_at,
  consumed_at
)
SELECT
  relationship.tenant_id,
  relationship.internal_supplier_code,
  relationship.internal_supplier_code,
  'migration',
  'used',
  relationship.id,
  relationship.created_at,
  now()
FROM public.tenant_suppliers AS relationship;

INSERT INTO public.tenant_supplier_code_counters (
  tenant_id,
  next_value,
  version
)
SELECT
  relationship.tenant_id,
  count(*) + 1,
  1
FROM public.tenant_suppliers AS relationship
GROUP BY relationship.tenant_id;

ALTER TABLE public.tenant_suppliers
ALTER COLUMN internal_supplier_code SET NOT NULL,
ADD CONSTRAINT tenant_suppliers_internal_code_normalized_check CHECK (
  internal_supplier_code = upper(btrim(internal_supplier_code))
  AND internal_supplier_code ~ '^[A-Z0-9_-]{2,64}$'
),
ADD CONSTRAINT tenant_suppliers_tenant_internal_code_key UNIQUE (
  tenant_id,
  internal_supplier_code
);

CREATE FUNCTION public.guard_tenant_supplier_internal_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.internal_supplier_code IS DISTINCT FROM OLD.internal_supplier_code THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_tenant_suppliers_guard_internal_code_immutable
BEFORE UPDATE OF internal_supplier_code
ON public.tenant_suppliers
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_supplier_internal_code_immutable();

CREATE FUNCTION public.validate_tenant_supplier_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_supplier public.suppliers%ROWTYPE;
BEGIN
  SELECT supplier.*
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_supplier.ownership_scope = 'tenant'
    AND (
      v_supplier.owner_tenant_id IS DISTINCT FROM NEW.tenant_id
      OR upper(btrim(v_supplier.code)) IS DISTINCT FROM NEW.internal_supplier_code
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_tenant_suppliers_validate_ownership
BEFORE INSERT OR UPDATE OF tenant_id, supplier_id, internal_supplier_code
ON public.tenant_suppliers
FOR EACH ROW
EXECUTE FUNCTION public.validate_tenant_supplier_ownership();

CREATE FUNCTION public.guard_tenant_supplier_code_registry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.normalized_code IS DISTINCT FROM OLD.normalized_code
    OR NEW.display_code IS DISTINCT FROM OLD.display_code
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_digest IS DISTINCT FROM OLD.request_digest
    OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.actor_employee_id IS DISTINCT FROM OLD.actor_employee_id
    OR OLD.status <> 'reserved'
    OR NEW.status NOT IN ('used', 'abandoned')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_tenant_supplier_code_registry_guard
BEFORE UPDATE ON public.tenant_supplier_code_registry
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_supplier_code_registry();

CREATE FUNCTION public.assert_tenant_supplier_actor(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.user_id = p_actor_user_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;
END;
$$;

CREATE FUNCTION public.consume_tenant_supplier_code(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_code_source text,
  p_internal_supplier_code text,
  p_allocation_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_creation_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_registry public.tenant_supplier_code_registry%ROWTYPE;
  v_normalized_code text := upper(btrim(p_internal_supplier_code));
BEGIN
  IF v_normalized_code !~ '^[A-Z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END IF;

  IF p_code_source = 'generated' THEN
    IF p_allocation_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
    END IF;

    SELECT registry.*
    INTO v_registry
    FROM public.tenant_supplier_code_registry AS registry
    WHERE registry.id = p_allocation_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_registry.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_registry.source <> 'generated'
      OR v_registry.status <> 'reserved'
      OR v_registry.normalized_code <> v_normalized_code
      OR v_registry.idempotency_key = p_creation_idempotency_key
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
    END IF;

    UPDATE public.tenant_supplier_code_registry AS registry
    SET status = 'used',
        tenant_supplier_id = p_tenant_supplier_id,
        consumed_at = now()
    WHERE registry.id = v_registry.id
    RETURNING registry.id INTO v_registry.id;

    RETURN v_registry.id;
  END IF;

  IF p_code_source <> 'manual' OR p_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  BEGIN
    INSERT INTO public.tenant_supplier_code_registry (
      tenant_id,
      normalized_code,
      display_code,
      source,
      status,
      tenant_supplier_id,
      actor_user_id,
      actor_employee_id,
      consumed_at
    )
    VALUES (
      p_tenant_id,
      v_normalized_code,
      v_normalized_code,
      'manual',
      'used',
      p_tenant_supplier_id,
      p_actor_user_id,
      p_actor_employee_id,
      now()
    )
    RETURNING id INTO v_registry.id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END;

  RETURN v_registry.id;
END;
$$;

CREATE FUNCTION public.allocate_tenant_supplier_code(
  p_tenant_id uuid,
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
  v_existing_registry public.tenant_supplier_code_registry%ROWTYPE;
  v_registry public.tenant_supplier_code_registry%ROWTYPE;
  v_counter public.tenant_supplier_code_counters%ROWTYPE;
  v_request jsonb;
  v_candidate bigint;
  v_code text;
BEGIN
  IF p_tenant_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
    AND setting.private_supplier_writes_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.command <> 'allocate_tenant_supplier_code'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
    END IF;

    RETURN v_event.to_state || jsonb_build_object('idempotent', true);
  END IF;

  SELECT registry.*
  INTO v_existing_registry
  FROM public.tenant_supplier_code_registry AS registry
  WHERE registry.tenant_id = p_tenant_id
    AND registry.source = 'generated'
    AND registry.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  INSERT INTO public.tenant_supplier_code_counters (
    tenant_id,
    next_value,
    version
  )
  SELECT
    p_tenant_id,
    greatest(
      coalesce((
        SELECT max(
          substring(registry.normalized_code FROM '^SUP-([0-9]{6})$')::bigint
        )
        FROM public.tenant_supplier_code_registry AS registry
        WHERE registry.tenant_id = p_tenant_id
          AND registry.normalized_code ~ '^SUP-[0-9]{6}$'
      ), 0),
      coalesce((
        SELECT max(
          substring(relationship.internal_supplier_code FROM '^SUP-([0-9]{6})$')::bigint
        )
        FROM public.tenant_suppliers AS relationship
        WHERE relationship.tenant_id = p_tenant_id
          AND relationship.internal_supplier_code ~ '^SUP-[0-9]{6}$'
      ), 0)
    ) + 1,
    1
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT counter.*
  INTO v_counter
  FROM public.tenant_supplier_code_counters AS counter
  WHERE counter.tenant_id = p_tenant_id
  FOR UPDATE;

  v_candidate := v_counter.next_value;
  WHILE v_candidate <= 999999 LOOP
    v_code := 'SUP-' || lpad(v_candidate::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.tenant_supplier_code_registry AS registry
      WHERE registry.tenant_id = p_tenant_id
        AND registry.normalized_code = v_code
    );
    v_candidate := v_candidate + 1;
  END LOOP;

  IF v_candidate > 999999 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  BEGIN
    INSERT INTO public.tenant_supplier_code_registry (
      tenant_id,
      normalized_code,
      display_code,
      source,
      status,
      idempotency_key,
      request_digest,
      actor_user_id,
      actor_employee_id
    )
    VALUES (
      p_tenant_id,
      v_code,
      v_code,
      'generated',
      'reserved',
      p_idempotency_key,
      v_request,
      p_actor_user_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_registry;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END;

  UPDATE public.tenant_supplier_code_counters AS counter
  SET next_value = v_candidate + 1,
      version = counter.version + 1,
      updated_at = now()
  WHERE counter.tenant_id = p_tenant_id;

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'tenant_supplier',
    v_registry.id,
    'allocate_tenant_supplier_code',
    jsonb_build_object('_request', v_request),
    jsonb_build_object(
      'allocation_id', v_registry.id,
      'code', v_registry.normalized_code
    ),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    1
  );

  RETURN jsonb_build_object(
    'allocation_id', v_registry.id,
    'code', v_registry.normalized_code,
    'idempotent', false
  );
END;
$$;

CREATE FUNCTION public.create_tenant_private_supplier(
  p_tenant_id uuid,
  p_name text,
  p_legal_name text,
  p_unified_social_credit_code text,
  p_supplier_type text,
  p_code_source text,
  p_internal_supplier_code text,
  p_allocation_id uuid,
  p_primary_contact jsonb,
  p_address jsonb,
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
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_contact public.supplier_contacts%ROWTYPE;
  v_address public.supplier_addresses%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
  v_normalized_code text := upper(btrim(p_internal_supplier_code));
  v_credit_code text := nullif(upper(btrim(p_unified_social_credit_code)), '');
BEGIN
  IF p_tenant_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_name IS NULL
    OR btrim(p_name) = ''
    OR p_legal_name IS NULL
    OR btrim(p_legal_name) = ''
    OR p_supplier_type NOT IN (
      'manufacturer', 'brand_agent', 'distributor', 'retailer', 'other'
    )
    OR p_code_source NOT IN ('generated', 'manual')
    OR v_normalized_code !~ '^[A-Z0-9_-]{2,64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT';
  END IF;

  IF p_primary_contact IS NOT NULL
    AND (
      jsonb_typeof(p_primary_contact) <> 'object'
      OR btrim(coalesce(p_primary_contact ->> 'name', '')) = ''
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT';
  END IF;

  IF p_address IS NOT NULL
    AND (
      jsonb_typeof(p_address) <> 'object'
      OR btrim(coalesce(p_address ->> 'region_code', '')) = ''
      OR btrim(coalesce(p_address ->> 'address_detail', '')) = ''
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
    AND setting.private_supplier_writes_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'name', btrim(p_name),
    'legal_name', btrim(p_legal_name),
    'unified_social_credit_code', v_credit_code,
    'supplier_type', p_supplier_type,
    'code_source', p_code_source,
    'internal_supplier_code', v_normalized_code,
    'allocation_id', p_allocation_id,
    'primary_contact', p_primary_contact,
    'address', p_address,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.command = 'allocate_tenant_supplier_code' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
    END IF;

    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.command <> 'create_tenant_private_supplier'
      OR v_event.resource_type <> 'tenant_supplier'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'tenant_supplier', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  BEGIN
    INSERT INTO public.suppliers (
      code,
      name,
      legal_name,
      unified_social_credit_code,
      supplier_type,
      onboarding_status,
      operational_status,
      version,
      created_by_employee_id,
      updated_by_employee_id,
      ownership_scope,
      owner_tenant_id
    )
    VALUES (
      v_normalized_code,
      btrim(p_name),
      btrim(p_legal_name),
      v_credit_code,
      p_supplier_type,
      'approved',
      'active',
      1,
      p_actor_employee_id,
      p_actor_employee_id,
      'tenant',
      p_tenant_id
    )
    RETURNING * INTO v_supplier;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END;

  BEGIN
    INSERT INTO public.tenant_suppliers (
      tenant_id,
      supplier_id,
      relationship_status,
      internal_supplier_code,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_tenant_id,
      v_supplier.id,
      'evaluating',
      v_normalized_code,
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_relationship;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END;

  PERFORM public.consume_tenant_supplier_code(
    p_tenant_id,
    v_relationship.id,
    p_code_source,
    v_normalized_code,
    p_allocation_id,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );

  IF p_primary_contact IS NOT NULL THEN
    INSERT INTO public.supplier_contacts (
      supplier_id,
      contact_type,
      name,
      phone,
      email,
      is_public,
      is_primary,
      status,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      v_supplier.id,
      'primary',
      btrim(p_primary_contact ->> 'name'),
      nullif(btrim(coalesce(p_primary_contact ->> 'phone', '')), ''),
      nullif(btrim(coalesce(p_primary_contact ->> 'email', '')), ''),
      false,
      true,
      'active',
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_contact;
  END IF;

  IF p_address IS NOT NULL THEN
    INSERT INTO public.supplier_addresses (
      supplier_id,
      address_type,
      province,
      city,
      district,
      region_code,
      address_detail,
      is_default,
      status,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      v_supplier.id,
      'registered',
      nullif(btrim(coalesce(p_address ->> 'province', '')), ''),
      nullif(btrim(coalesce(p_address ->> 'city', '')), ''),
      nullif(btrim(coalesce(p_address ->> 'district', '')), ''),
      btrim(p_address ->> 'region_code'),
      btrim(p_address ->> 'address_detail'),
      true,
      'active',
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_address;
  END IF;

  v_snapshot := to_jsonb(v_relationship) || jsonb_build_object(
    'supplier', to_jsonb(v_supplier),
    'primary_contact', CASE
      WHEN v_contact.id IS NULL THEN NULL
      ELSE to_jsonb(v_contact)
    END,
    'address', CASE
      WHEN v_address.id IS NULL THEN NULL
      ELSE to_jsonb(v_address)
    END
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'tenant_supplier',
    v_relationship.id,
    'create_tenant_private_supplier',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_relationship.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'tenant_supplier', v_snapshot,
    'version', v_relationship.version
  );
END;
$$;

CREATE FUNCTION public.create_tenant_shared_supplier_relationship(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_code_source text,
  p_internal_supplier_code text,
  p_allocation_id uuid,
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
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
  v_normalized_code text := upper(btrim(p_internal_supplier_code));
BEGIN
  IF p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_code_source NOT IN ('generated', 'manual')
    OR v_normalized_code !~ '^[A-Z0-9_-]{2,64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'code_source', p_code_source,
    'internal_supplier_code', v_normalized_code,
    'allocation_id', p_allocation_id,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.command = 'allocate_tenant_supplier_code' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
    END IF;

    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.command <> 'create_tenant_shared_supplier_relationship'
      OR v_event.resource_type <> 'tenant_supplier'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'tenant_supplier', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  SELECT supplier.*
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_found',
      'error_code', 'SUPPLIER_NOT_FOUND'
    );
  END IF;

  IF v_supplier.ownership_scope <> 'platform' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_CONFLICT';
  END IF;

  IF v_supplier.onboarding_status <> 'approved'
    OR v_supplier.operational_status <> 'active'
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_STATE_CONFLICT'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_suppliers AS relationship
    WHERE relationship.tenant_id = p_tenant_id
      AND relationship.supplier_id = p_supplier_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT'
    );
  END IF;

  BEGIN
    INSERT INTO public.tenant_suppliers (
      tenant_id,
      supplier_id,
      relationship_status,
      internal_supplier_code,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_tenant_id,
      p_supplier_id,
      'evaluating',
      v_normalized_code,
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_relationship;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END;

  PERFORM public.consume_tenant_supplier_code(
    p_tenant_id,
    v_relationship.id,
    p_code_source,
    v_normalized_code,
    p_allocation_id,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );

  v_snapshot := to_jsonb(v_relationship) || jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_supplier.id,
      'code', v_supplier.code,
      'name', v_supplier.name,
      'legal_name', v_supplier.legal_name,
      'supplier_type', v_supplier.supplier_type,
      'ownership_scope', v_supplier.ownership_scope,
      'onboarding_status', v_supplier.onboarding_status,
      'operational_status', v_supplier.operational_status,
      'version', v_supplier.version
    )
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'tenant_supplier',
    v_relationship.id,
    'create_tenant_shared_supplier_relationship',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_relationship.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'tenant_supplier', v_snapshot,
    'version', v_relationship.version
  );
END;
$$;

-- Compatibility window: the legacy API only supplies a platform supplier ID.
-- Its already-provided platform master code is therefore used explicitly as
-- the tenant relationship code and registered as migration provenance. No
-- missing code is generated silently. New callers must use the explicit RPC.
CREATE OR REPLACE FUNCTION public.create_tenant_supplier(
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
  v_snapshot jsonb;
  v_internal_code text;
BEGIN
  IF p_tenant_supplier_id IS NULL
    OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_expected_version IS DISTINCT FROM 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_VERSION_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier'
      OR v_event.command <> 'create_tenant_supplier'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'tenant_supplier', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  SELECT setting.*
  INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR SHARE;

  IF NOT FOUND OR NOT v_setting.module_enabled THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  SELECT supplier.*
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_found',
      'error_code', 'SUPPLIER_NOT_FOUND'
    );
  END IF;

  IF v_supplier.ownership_scope <> 'platform' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_CONFLICT';
  END IF;

  IF v_supplier.onboarding_status <> 'approved'
    OR v_supplier.operational_status <> 'active'
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_STATE_CONFLICT'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_suppliers AS relationship
    WHERE relationship.tenant_id = p_tenant_id
      AND relationship.supplier_id = p_supplier_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT'
    );
  END IF;

  v_internal_code := upper(btrim(v_supplier.code));
  IF v_internal_code !~ '^[A-Z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END IF;

  BEGIN
    INSERT INTO public.tenant_suppliers (
      id,
      tenant_id,
      supplier_id,
      relationship_status,
      internal_supplier_code,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_tenant_supplier_id,
      p_tenant_id,
      p_supplier_id,
      'evaluating',
      v_internal_code,
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_relationship;

    INSERT INTO public.tenant_supplier_code_registry (
      tenant_id,
      normalized_code,
      display_code,
      source,
      status,
      tenant_supplier_id,
      consumed_at
    )
    VALUES (
      p_tenant_id,
      v_internal_code,
      v_internal_code,
      'migration',
      'used',
      v_relationship.id,
      now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CODE_CONFLICT';
  END;

  v_snapshot := to_jsonb(v_relationship) || jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_supplier.id,
      'code', v_supplier.code,
      'name', v_supplier.name,
      'legal_name', v_supplier.legal_name,
      'supplier_type', v_supplier.supplier_type,
      'ownership_scope', v_supplier.ownership_scope,
      'onboarding_status', v_supplier.onboarding_status,
      'operational_status', v_supplier.operational_status,
      'version', v_supplier.version
    )
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'tenant_supplier',
    v_relationship.id,
    'create_tenant_supplier',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_relationship.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'tenant_supplier', v_snapshot,
    'version', v_relationship.version
  );
END;
$$;

CREATE FUNCTION public.abandon_tenant_supplier_code_reservations(
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  WITH expired AS (
    SELECT registry.id
    FROM public.tenant_supplier_code_registry AS registry
    WHERE registry.status = 'reserved'
      AND registry.created_at <= now() - interval '24 hours'
    ORDER BY registry.created_at, registry.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), abandoned AS (
    UPDATE public.tenant_supplier_code_registry AS registry
    SET status = 'abandoned',
        abandoned_at = now()
    FROM expired
    WHERE expired.id = registry.id
    RETURNING registry.id
  )
  SELECT count(*)::integer INTO v_count
  FROM abandoned;

  RETURN v_count;
END;
$$;

ALTER TABLE public.tenant_supplier_code_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_supplier_code_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_supplier_code_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_supplier_code_registry FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_supplier_code_counters FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tenant_supplier_code_registry FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tenant_supplier_code_counters TO service_role;
GRANT SELECT ON TABLE public.tenant_supplier_code_registry TO service_role;

REVOKE ALL ON FUNCTION public.guard_tenant_supplier_internal_code_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_tenant_supplier_ownership() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_tenant_supplier_code_registry() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_tenant_supplier_actor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_tenant_supplier_code(uuid, uuid, text, text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.allocate_tenant_supplier_code(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_tenant_supplier_code(uuid, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_private_supplier(uuid, text, text, text, text, text, text, uuid, jsonb, jsonb, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_private_supplier(uuid, text, text, text, text, text, text, uuid, jsonb, jsonb, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_shared_supplier_relationship(uuid, uuid, text, text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_shared_supplier_relationship(uuid, uuid, text, text, uuid, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_supplier(uuid, uuid, uuid, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_supplier(uuid, uuid, uuid, integer, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.abandon_tenant_supplier_code_reservations(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.abandon_tenant_supplier_code_reservations(integer) TO service_role;

COMMIT;
