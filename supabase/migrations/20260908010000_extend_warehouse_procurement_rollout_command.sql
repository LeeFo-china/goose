-- Forward-only rollback: disable warehouse, then prerequisite flags in reverse
-- through the platform command; retire overloads only in a reviewed migration.
-- Keep settings and immutable command events. This migration changes no tenant rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Private implementation: only the owner-run typed wrappers can execute it.
-- The original field presence is retained in _request; resolved current values
-- never enter its fingerprint. Replay precedes all mutable-state checks.
CREATE FUNCTION public.__gooes_set_supplier_rollout_settings_v2(
  p_request jsonb, p_actor_user_id uuid, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $core$
DECLARE
  v_request jsonb := p_request;
  v_tenant_id uuid := (p_request ->> 'tenant_id')::uuid;
  v_actor_employee_id uuid := (p_request ->> 'actor_employee_id')::uuid;
  v_expected_version integer := (p_request ->> 'expected_version')::integer;
  v_reason text := NULLIF(btrim(p_request ->> 'reason'), '');
  v_event public.supplier_command_events%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_before jsonb := '{}'::jsonb;
  v_current_level integer := 0;
  v_target_level integer;
  v_module_enabled boolean := (p_request ->> 'module_enabled')::boolean;
  v_require_active_contract_for_new_order boolean := (p_request ->> 'require_active_contract_for_new_order')::boolean;
  v_ownership_reads_enabled boolean := (p_request ->> 'ownership_reads_enabled')::boolean;
  v_private_supplier_writes_enabled boolean := (p_request ->> 'private_supplier_writes_enabled')::boolean;
  v_private_catalog_writes_enabled boolean := (p_request ->> 'private_catalog_writes_enabled')::boolean;
  v_procurement_snapshot_v1_enabled boolean := (p_request ->> 'procurement_snapshot_v1_enabled')::boolean;
  v_purchase_batch_workflow_enabled boolean := (p_request ->> 'purchase_batch_workflow_enabled')::boolean;
  v_warehouse_procurement_enabled boolean := (p_request ->> 'warehouse_procurement_enabled')::boolean;
BEGIN
  IF v_tenant_id IS NULL OR v_actor_employee_id IS NULL OR p_actor_user_id IS NULL
    OR v_expected_version IS NULL OR v_expected_version < 0
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR jsonb_typeof(v_request) IS DISTINCT FROM 'object'
    OR NOT (v_request ?& ARRAY['tenant_id', 'module_enabled', 'require_active_contract_for_new_order', 'ownership_reads_enabled', 'private_supplier_writes_enabled', 'private_catalog_writes_enabled', 'procurement_snapshot_v1_enabled', 'expected_version', 'reason', 'actor_employee_id'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_request) AS keys(key)
      WHERE key <> ALL(ARRAY['tenant_id', 'module_enabled', 'require_active_contract_for_new_order', 'ownership_reads_enabled', 'private_supplier_writes_enabled', 'private_catalog_writes_enabled', 'procurement_snapshot_v1_enabled', 'purchase_batch_workflow_enabled', 'warehouse_procurement_enabled', 'expected_version', 'reason', 'actor_employee_id']))
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['module_enabled', 'require_active_contract_for_new_order', 'ownership_reads_enabled', 'private_supplier_writes_enabled', 'private_catalog_writes_enabled', 'procurement_snapshot_v1_enabled', 'purchase_batch_workflow_enabled', 'warehouse_procurement_enabled']) AS flags(flag)
      WHERE v_request ? flag AND jsonb_typeof(v_request -> flag) IS DISTINCT FROM 'boolean')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  IF char_length(v_reason) > 500 OR (NOT v_module_enabled AND v_reason IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_set(v_request, '{reason}', COALESCE(to_jsonb(v_reason), 'null'::jsonb));

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0));
  SELECT event.* INTO v_event FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM v_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier'
      OR v_event.resource_id <> v_tenant_id
      OR v_event.command <> 'set_tenant_supplier_rollout_settings'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true,
      'setting', v_event.to_state, 'previous_setting', v_event.from_state - '_request',
      'version', v_event.result_version);
  END IF;

  PERFORM 1 FROM public.tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT setting.* INTO v_setting FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = v_tenant_id FOR UPDATE;
  IF FOUND THEN
    IF v_setting.version <> v_expected_version THEN
      RETURN jsonb_build_object('status', 'version_conflict',
        'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_setting.version);
    END IF;
    v_before := to_jsonb(v_setting);
    v_current_level := CASE
      WHEN v_setting.warehouse_procurement_enabled THEN 7
      WHEN v_setting.purchase_batch_workflow_enabled THEN 6
      WHEN v_setting.procurement_snapshot_v1_enabled THEN 5
      WHEN v_setting.private_catalog_writes_enabled THEN 4
      WHEN v_setting.private_supplier_writes_enabled THEN 3
      WHEN v_setting.ownership_reads_enabled THEN 2
      WHEN v_setting.module_enabled THEN 1
      ELSE 0 END;
  ELSIF v_expected_version <> 0 THEN
    RETURN jsonb_build_object('status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', 0);
  END IF;

  -- Omission is resolved under the same row lock as version/dependency checks.
  IF NOT (v_request ? 'purchase_batch_workflow_enabled') THEN
    v_purchase_batch_workflow_enabled := COALESCE(v_setting.purchase_batch_workflow_enabled, false);
  END IF;
  IF NOT (v_request ? 'warehouse_procurement_enabled') THEN
    v_warehouse_procurement_enabled := COALESCE(v_setting.warehouse_procurement_enabled, false);
  END IF;
  IF (v_ownership_reads_enabled AND NOT (v_module_enabled))
    OR (v_private_supplier_writes_enabled AND NOT (v_module_enabled AND v_ownership_reads_enabled))
    OR (v_private_catalog_writes_enabled AND NOT (v_module_enabled AND v_ownership_reads_enabled AND v_private_supplier_writes_enabled))
    OR (v_procurement_snapshot_v1_enabled AND NOT (v_module_enabled AND v_ownership_reads_enabled AND v_private_supplier_writes_enabled AND v_private_catalog_writes_enabled))
    OR (v_purchase_batch_workflow_enabled AND NOT (v_module_enabled AND v_ownership_reads_enabled AND v_private_supplier_writes_enabled AND v_private_catalog_writes_enabled AND v_procurement_snapshot_v1_enabled))
    OR (v_warehouse_procurement_enabled AND NOT (v_module_enabled AND v_ownership_reads_enabled AND v_private_supplier_writes_enabled AND v_private_catalog_writes_enabled AND v_procurement_snapshot_v1_enabled AND v_purchase_batch_workflow_enabled)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;
  v_target_level := CASE
    WHEN v_warehouse_procurement_enabled THEN 7
    WHEN v_purchase_batch_workflow_enabled THEN 6
    WHEN v_procurement_snapshot_v1_enabled THEN 5
    WHEN v_private_catalog_writes_enabled THEN 4
    WHEN v_private_supplier_writes_enabled THEN 3
    WHEN v_ownership_reads_enabled THEN 2
    WHEN v_module_enabled THEN 1
    ELSE 0 END;
  IF abs(v_target_level - v_current_level) > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;

  IF v_setting.tenant_id IS NULL THEN
    INSERT INTO public.tenant_supplier_settings(
      tenant_id, module_enabled, require_active_contract_for_new_order, ownership_reads_enabled, private_supplier_writes_enabled, private_catalog_writes_enabled, procurement_snapshot_v1_enabled, purchase_batch_workflow_enabled, warehouse_procurement_enabled,
      enabled_by_employee_id, enabled_at, version
    ) VALUES (
      v_tenant_id, v_module_enabled, v_require_active_contract_for_new_order, v_ownership_reads_enabled, v_private_supplier_writes_enabled, v_private_catalog_writes_enabled, v_procurement_snapshot_v1_enabled, v_purchase_batch_workflow_enabled, v_warehouse_procurement_enabled,
      CASE WHEN v_module_enabled THEN v_actor_employee_id ELSE NULL END,
      CASE WHEN v_module_enabled THEN now() ELSE NULL END, 1
    ) RETURNING * INTO v_setting;
  ELSE
    UPDATE public.tenant_supplier_settings AS setting SET
      module_enabled = v_module_enabled,
      require_active_contract_for_new_order = v_require_active_contract_for_new_order,
      ownership_reads_enabled = v_ownership_reads_enabled,
      private_supplier_writes_enabled = v_private_supplier_writes_enabled,
      private_catalog_writes_enabled = v_private_catalog_writes_enabled,
      procurement_snapshot_v1_enabled = v_procurement_snapshot_v1_enabled,
      purchase_batch_workflow_enabled = v_purchase_batch_workflow_enabled,
      warehouse_procurement_enabled = v_warehouse_procurement_enabled,
      enabled_by_employee_id = CASE WHEN NOT v_module_enabled THEN NULL
        WHEN NOT setting.module_enabled THEN v_actor_employee_id ELSE setting.enabled_by_employee_id END,
      enabled_at = CASE WHEN NOT v_module_enabled THEN NULL
        WHEN NOT setting.module_enabled THEN now() ELSE setting.enabled_at END,
      version = setting.version + 1
    WHERE setting.tenant_id = v_tenant_id RETURNING * INTO v_setting;
  END IF;

  INSERT INTO public.supplier_command_events(
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    reason, actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    v_tenant_id, 'tenant_supplier', v_tenant_id, 'set_tenant_supplier_rollout_settings',
    v_before || jsonb_build_object('_request', v_request), to_jsonb(v_setting),
    v_reason, p_actor_user_id, v_actor_employee_id, p_idempotency_key, v_setting.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false,
    'setting', to_jsonb(v_setting), 'previous_setting', v_before, 'version', v_setting.version);
END;
$core$;
REVOKE ALL ON FUNCTION public.__gooes_set_supplier_rollout_settings_v2(jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Legacy signature: preserve the original request fields exactly.
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
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $wrapper$
  SELECT public.__gooes_set_supplier_rollout_settings_v2(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order', p_require_active_contract_for_new_order,
    'ownership_reads_enabled', p_ownership_reads_enabled,
    'private_supplier_writes_enabled', p_private_supplier_writes_enabled,
    'private_catalog_writes_enabled', p_private_catalog_writes_enabled,
    'procurement_snapshot_v1_enabled', p_procurement_snapshot_v1_enabled,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  ), p_actor_user_id, p_idempotency_key);
$wrapper$;
REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text) TO service_role;

-- Legacy signature: preserve the original request fields exactly.
CREATE OR REPLACE FUNCTION public.set_tenant_supplier_rollout_settings(
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
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $wrapper$
  SELECT public.__gooes_set_supplier_rollout_settings_v2(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order', p_require_active_contract_for_new_order,
    'ownership_reads_enabled', p_ownership_reads_enabled,
    'private_supplier_writes_enabled', p_private_supplier_writes_enabled,
    'private_catalog_writes_enabled', p_private_catalog_writes_enabled,
    'procurement_snapshot_v1_enabled', p_procurement_snapshot_v1_enabled,
    'purchase_batch_workflow_enabled', p_purchase_batch_workflow_enabled,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  ), p_actor_user_id, p_idempotency_key);
$wrapper$;
REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text) TO service_role;

-- Warehouse signature: preserve the original request fields exactly.
CREATE OR REPLACE FUNCTION public.set_tenant_supplier_rollout_settings(
  p_tenant_id uuid,
  p_module_enabled boolean,
  p_require_active_contract_for_new_order boolean,
  p_ownership_reads_enabled boolean,
  p_private_supplier_writes_enabled boolean,
  p_private_catalog_writes_enabled boolean,
  p_procurement_snapshot_v1_enabled boolean,
  p_purchase_batch_workflow_enabled boolean,
  p_warehouse_procurement_enabled boolean,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $wrapper$
  SELECT public.__gooes_set_supplier_rollout_settings_v2(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order', p_require_active_contract_for_new_order,
    'ownership_reads_enabled', p_ownership_reads_enabled,
    'private_supplier_writes_enabled', p_private_supplier_writes_enabled,
    'private_catalog_writes_enabled', p_private_catalog_writes_enabled,
    'procurement_snapshot_v1_enabled', p_procurement_snapshot_v1_enabled,
    'purchase_batch_workflow_enabled', p_purchase_batch_workflow_enabled,
    'warehouse_procurement_enabled', p_warehouse_procurement_enabled,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  ), p_actor_user_id, p_idempotency_key);
$wrapper$;
REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text) TO service_role;

COMMIT;
