-- Rollback: forward-only. Disable the rollout API, then disable the purchase
-- workflow and all prerequisite flags in reverse order through the command.
-- Ship a new migration that revokes and drops the level-six function and its
-- temporary legacy overload. Keep tenant data and command events for audit;
-- never repair or delete rollout state manually. Retire the legacy overload
-- only after every old API revision has left service.
-- If lock or statement timeout is reached, this transaction rolls back.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.set_tenant_supplier_rollout_settings(
  p_tenant_id uuid,
  p_module_enabled boolean,
  p_require_active_contract_for_new_order boolean,
  p_ownership_reads_enabled boolean,
  p_private_supplier_writes_enabled boolean,
  p_private_catalog_writes_enabled boolean,
  p_procurement_snapshot_v1_enabled boolean,
  p_purchase_batch_workflow_enabled boolean,
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
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_before jsonb := '{}'::jsonb;
  v_request jsonb;
  v_current_level integer := 0;
  v_target_level integer;
BEGIN
  IF p_tenant_id IS NULL
    OR p_module_enabled IS NULL
    OR p_require_active_contract_for_new_order IS NULL
    OR p_ownership_reads_enabled IS NULL
    OR p_private_supplier_writes_enabled IS NULL
    OR p_private_catalog_writes_enabled IS NULL
    OR p_procurement_snapshot_v1_enabled IS NULL
    OR p_purchase_batch_workflow_enabled IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;

  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  p_reason := NULLIF(btrim(p_reason), '');

  IF NOT p_module_enabled AND p_reason IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  IF (
    NOT p_module_enabled
    AND (
      p_ownership_reads_enabled
      OR p_private_supplier_writes_enabled
      OR p_private_catalog_writes_enabled
      OR p_procurement_snapshot_v1_enabled
      OR p_purchase_batch_workflow_enabled
    )
  ) OR (
    p_private_supplier_writes_enabled
    AND NOT p_ownership_reads_enabled
  ) OR (
    p_private_catalog_writes_enabled
    AND NOT (
      p_ownership_reads_enabled
      AND p_private_supplier_writes_enabled
    )
  ) OR (
    p_procurement_snapshot_v1_enabled
    AND NOT (
      p_ownership_reads_enabled
      AND p_private_supplier_writes_enabled
      AND p_private_catalog_writes_enabled
    )
  ) OR (
    p_purchase_batch_workflow_enabled
    AND NOT (
      p_ownership_reads_enabled
      AND p_private_supplier_writes_enabled
      AND p_private_catalog_writes_enabled
      AND p_procurement_snapshot_v1_enabled
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;

  v_target_level := CASE
    WHEN NOT p_module_enabled THEN 0
    WHEN p_purchase_batch_workflow_enabled THEN 6
    WHEN p_procurement_snapshot_v1_enabled THEN 5
    WHEN p_private_catalog_writes_enabled THEN 4
    WHEN p_private_supplier_writes_enabled THEN 3
    WHEN p_ownership_reads_enabled THEN 2
    ELSE 1
  END;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order',
      p_require_active_contract_for_new_order,
    'ownership_reads_enabled', p_ownership_reads_enabled,
    'private_supplier_writes_enabled', p_private_supplier_writes_enabled,
    'private_catalog_writes_enabled', p_private_catalog_writes_enabled,
    'procurement_snapshot_v1_enabled', p_procurement_snapshot_v1_enabled,
    'purchase_batch_workflow_enabled', p_purchase_batch_workflow_enabled,
    'expected_version', p_expected_version,
    'reason', p_reason,
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
      OR v_event.resource_id <> p_tenant_id
      OR v_event.command <> 'set_tenant_supplier_rollout_settings'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'setting', v_event.to_state,
      'previous_setting', v_event.from_state - '_request',
      'version', v_event.result_version
    );
  END IF;

  PERFORM 1
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_found',
      'error_code', 'SUPPLIER_NOT_FOUND'
    );
  END IF;

  SELECT setting.*
  INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_setting.version <> p_expected_version THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_VERSION_CONFLICT',
        'version', v_setting.version
      );
    END IF;

    v_before := to_jsonb(v_setting);
    v_current_level := CASE
      WHEN NOT v_setting.module_enabled THEN 0
      WHEN v_setting.purchase_batch_workflow_enabled THEN 6
      WHEN v_setting.procurement_snapshot_v1_enabled THEN 5
      WHEN v_setting.private_catalog_writes_enabled THEN 4
      WHEN v_setting.private_supplier_writes_enabled THEN 3
      WHEN v_setting.ownership_reads_enabled THEN 2
      ELSE 1
    END;
  ELSE
    IF p_expected_version <> 0 THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_VERSION_CONFLICT',
        'version', 0
      );
    END IF;
  END IF;

  IF abs(v_target_level - v_current_level) > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;

  IF v_setting.tenant_id IS NOT NULL THEN
    UPDATE public.tenant_supplier_settings AS setting
    SET module_enabled = p_module_enabled,
        require_active_contract_for_new_order =
          p_require_active_contract_for_new_order,
        ownership_reads_enabled = p_ownership_reads_enabled,
        private_supplier_writes_enabled = p_private_supplier_writes_enabled,
        private_catalog_writes_enabled = p_private_catalog_writes_enabled,
        procurement_snapshot_v1_enabled = p_procurement_snapshot_v1_enabled,
        purchase_batch_workflow_enabled =
          p_purchase_batch_workflow_enabled,
        enabled_by_employee_id = CASE
          WHEN NOT p_module_enabled THEN NULL
          WHEN NOT setting.module_enabled THEN p_actor_employee_id
          ELSE setting.enabled_by_employee_id
        END,
        enabled_at = CASE
          WHEN NOT p_module_enabled THEN NULL
          WHEN NOT setting.module_enabled THEN now()
          ELSE setting.enabled_at
        END,
        version = setting.version + 1
    WHERE setting.tenant_id = p_tenant_id
    RETURNING * INTO v_setting;
  ELSE
    INSERT INTO public.tenant_supplier_settings (
      tenant_id,
      module_enabled,
      require_active_contract_for_new_order,
      ownership_reads_enabled,
      private_supplier_writes_enabled,
      private_catalog_writes_enabled,
      procurement_snapshot_v1_enabled,
      purchase_batch_workflow_enabled,
      enabled_by_employee_id,
      enabled_at,
      version
    )
    VALUES (
      p_tenant_id,
      p_module_enabled,
      p_require_active_contract_for_new_order,
      p_ownership_reads_enabled,
      p_private_supplier_writes_enabled,
      p_private_catalog_writes_enabled,
      p_procurement_snapshot_v1_enabled,
      p_purchase_batch_workflow_enabled,
      CASE WHEN p_module_enabled THEN p_actor_employee_id ELSE NULL END,
      CASE WHEN p_module_enabled THEN now() ELSE NULL END,
      1
    )
    RETURNING * INTO v_setting;
  END IF;

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'tenant_supplier',
    p_tenant_id,
    'set_tenant_supplier_rollout_settings',
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_setting),
    p_reason,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_setting.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'setting', to_jsonb(v_setting),
    'previous_setting', v_before,
    'version', v_setting.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.set_tenant_supplier_rollout_settings(
  p_tenant_id uuid,
  p_module_enabled boolean,
  p_require_active_contract_for_new_order boolean,
  p_ownership_reads_enabled boolean,
  p_private_supplier_writes_enabled boolean,
  p_private_catalog_writes_enabled boolean,
  p_procurement_snapshot_v1_enabled boolean,
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
  v_request jsonb;
  v_result jsonb;
  v_purchase_batch_workflow_enabled boolean;
BEGIN
  IF p_tenant_id IS NULL
    OR p_module_enabled IS NULL
    OR p_require_active_contract_for_new_order IS NULL
    OR p_ownership_reads_enabled IS NULL
    OR p_private_supplier_writes_enabled IS NULL
    OR p_private_catalog_writes_enabled IS NULL
    OR p_procurement_snapshot_v1_enabled IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;

  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  p_reason := NULLIF(btrim(p_reason), '');

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order',
      p_require_active_contract_for_new_order,
    'ownership_reads_enabled', p_ownership_reads_enabled,
    'private_supplier_writes_enabled', p_private_supplier_writes_enabled,
    'private_catalog_writes_enabled', p_private_catalog_writes_enabled,
    'procurement_snapshot_v1_enabled', p_procurement_snapshot_v1_enabled,
    'expected_version', p_expected_version,
    'reason', p_reason,
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

  IF FOUND AND NOT COALESCE(
    v_event.from_state -> '_request' ? 'purchase_batch_workflow_enabled',
    false
  ) THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier'
      OR v_event.resource_id <> p_tenant_id
      OR v_event.command <> 'set_tenant_supplier_rollout_settings'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'setting', v_event.to_state,
      'previous_setting', v_event.from_state - '_request',
      'version', v_event.result_version
    );
  END IF;

  SELECT COALESCE((
    SELECT setting.purchase_batch_workflow_enabled
    FROM public.tenant_supplier_settings AS setting
    WHERE setting.tenant_id = p_tenant_id
  ), false)
  INTO v_purchase_batch_workflow_enabled;

  v_result := public.set_tenant_supplier_rollout_settings(
    p_tenant_id,
    p_module_enabled,
    p_require_active_contract_for_new_order,
    p_ownership_reads_enabled,
    p_private_supplier_writes_enabled,
    p_private_catalog_writes_enabled,
    p_procurement_snapshot_v1_enabled,
    v_purchase_batch_workflow_enabled,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_reason
  );

  IF v_result ->> 'status' = 'updated'
    AND NOT COALESCE((v_result ->> 'idempotent')::boolean, false)
  THEN
    UPDATE public.supplier_command_events AS event
    SET from_state = jsonb_set(
      event.from_state,
      '{_request}',
      v_request,
      true
    )
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id = p_tenant_id
      AND event.resource_type = 'tenant_supplier'
      AND event.resource_id = p_tenant_id
      AND event.command = 'set_tenant_supplier_rollout_settings'
      AND event.result_version = (v_result ->> 'version')::integer
      AND event.from_state -> '_request' IS NOT DISTINCT FROM (
        v_request || jsonb_build_object(
          'purchase_batch_workflow_enabled',
          v_purchase_batch_workflow_enabled
        )
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
IS 'Temporary DB-first compatibility overload; preserves purchase_batch_workflow_enabled while delegating to the level-six command. Retire only in a reviewed forward migration after old API revisions are gone.';

COMMIT;
