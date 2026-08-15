-- Rollback: forward-only. Disable private supplier writes before rollback and
-- ship a later migration that restores the previous command body only if no
-- cross-employee allocation replay has occurred. Preserve registry rows and
-- audit events; never repair or delete allocated codes manually.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    LEFT JOIN public.tenant_suppliers AS relationship
      ON relationship.supplier_id = supplier.id
    WHERE supplier.ownership_scope = 'tenant'
      AND (
        relationship.id IS NULL
        OR relationship.tenant_id IS DISTINCT FROM supplier.owner_tenant_id
        OR relationship.internal_supplier_code IS DISTINCT FROM
          upper(btrim(supplier.code))
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRIVATE_CODE_INCONSISTENT';
  END IF;
END;
$$;

UPDATE public.suppliers AS supplier
SET code = relationship.internal_supplier_code
FROM public.tenant_suppliers AS relationship
WHERE supplier.ownership_scope = 'tenant'
  AND relationship.supplier_id = supplier.id
  AND relationship.tenant_id = supplier.owner_tenant_id
  AND supplier.code IS DISTINCT FROM relationship.internal_supplier_code;

CREATE OR REPLACE FUNCTION public.guard_tenant_private_supplier_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.ownership_scope = 'tenant'
    AND NEW.code IS DISTINCT FROM OLD.code
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_suppliers_guard_private_code_immutable
ON public.suppliers;

CREATE TRIGGER tr_suppliers_guard_private_code_immutable
BEFORE UPDATE OF code
ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_private_supplier_code_immutable();

CREATE OR REPLACE FUNCTION public.guard_tenant_supplier_allocation_event_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-code-allocation:' || NEW.tenant_id::text || ':' || NEW.idempotency_key,
      0
    )
  );

  IF NEW.command IN (
    'create_tenant_private_supplier',
    'create_tenant_shared_supplier_relationship',
    'create_tenant_supplier'
  ) AND EXISTS (
    SELECT 1
    FROM public.tenant_supplier_code_registry AS registry
    WHERE registry.tenant_id = NEW.tenant_id
      AND registry.source = 'generated'
      AND registry.idempotency_key = NEW.idempotency_key
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_supplier_command_events_guard_allocation_key
ON public.supplier_command_events;

CREATE TRIGGER tr_supplier_command_events_guard_allocation_key
BEFORE INSERT ON public.supplier_command_events
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_supplier_allocation_event_key();

CREATE OR REPLACE FUNCTION public.allocate_tenant_supplier_code(
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

  v_request := jsonb_build_object('tenant_id', p_tenant_id);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-code-allocation:' || p_tenant_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.idempotency_key = p_idempotency_key
    AND event.command IN (
      'create_tenant_private_supplier',
      'create_tenant_shared_supplier_relationship',
      'create_tenant_supplier'
    )
  ORDER BY event.created_at, event.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT';
  END IF;

  SELECT registry.*
  INTO v_existing_registry
  FROM public.tenant_supplier_code_registry AS registry
  WHERE registry.tenant_id = p_tenant_id
    AND registry.source = 'generated'
    AND registry.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'allocation_id', v_existing_registry.id,
      'code', v_existing_registry.normalized_code,
      'idempotent', true
    );
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

REVOKE ALL ON FUNCTION public.guard_tenant_supplier_allocation_event_key()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_tenant_private_supplier_code_immutable()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.allocate_tenant_supplier_code(uuid, uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_tenant_supplier_code(uuid, uuid, uuid, text)
TO service_role;

COMMIT;
