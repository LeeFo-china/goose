-- Durable fence for tenant Tencent registration. Never expire/delete a pending claim:
-- a crash before sending CreateDevice cannot be distinguished from a lost successful response.
-- Unknown outcomes require an exact operation-name lookup or operator reconciliation.
-- No password or raw request/response JSON belongs in this table.
CREATE TABLE public.tenant_tencent_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  hardware_serial text NOT NULL CHECK (
    hardware_serial = upper(btrim(hardware_serial)) AND length(hardware_serial) BETWEEN 1 AND 160
  ),
  device_type integer NOT NULL CHECK (device_type IN (2, 3)),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'cloud_created', 'completed')),
  cloud_device_id text UNIQUE,
  cloud_device_code text,
  cloud_virtual_group_id text,
  cloud_request_id text,
  asset_id uuid REFERENCES public.tenant_devices(id),
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, hardware_serial),
  UNIQUE (id, tenant_id),
  CHECK (state = 'pending' OR nullif(btrim(cloud_device_id), '') IS NOT NULL),
  CHECK ((state = 'completed') = (asset_id IS NOT NULL))
);
ALTER TABLE public.tenant_tencent_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_tencent_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_tencent_registrations TO service_role;

-- Every used SN remains reserved for its original operation, including after a rename.
-- The receipt's hardware_serial is the CURRENT key; historical keys fail closed.
CREATE TABLE public.tenant_tencent_registration_serials (
  tenant_id uuid NOT NULL,
  hardware_serial text NOT NULL CHECK (
    hardware_serial = upper(btrim(hardware_serial)) AND length(hardware_serial) BETWEEN 1 AND 160
  ),
  registration_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, hardware_serial),
  FOREIGN KEY (registration_id, tenant_id) REFERENCES public.tenant_tencent_registrations(id, tenant_id)
);
ALTER TABLE public.tenant_tencent_registration_serials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_tencent_registration_serials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.tenant_tencent_registration_serials TO service_role;

CREATE INDEX tenant_devices_registration_sn_lookup
  ON public.tenant_devices (tenant_id, vendor, upper(btrim(hardware_serial)))
  WHERE deleted_at IS NULL;

-- RPCs use the service role after the existing project.update/tenant authorization.
-- Invoker security and restricted EXECUTE prevent a client-supplied tenant bypass.
CREATE FUNCTION public.claim_tenant_tencent_registration(
  p_tenant_id uuid, p_hardware_serial text, p_device_type integer, p_employee_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_registration public.tenant_tencent_registrations%ROWTYPE;
  v_asset public.tenant_devices%ROWTYPE;
  v_created boolean;
  v_cloud_ids text[];
  v_serial text := upper(btrim(p_hardware_serial));
BEGIN
  -- Shared with rename: tenant registry -> receipt -> camera-device -> assets.
  -- This transaction never includes a cloud request, so the tenant lock is short lived.
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant-tencent-registration:' || p_tenant_id::text, 0));
  SELECT registration.* INTO v_registration FROM public.tenant_tencent_registrations registration
    JOIN public.tenant_tencent_registration_serials serial ON serial.registration_id = registration.id
      AND serial.tenant_id = registration.tenant_id
    WHERE serial.tenant_id = p_tenant_id AND serial.hardware_serial = v_serial
    FOR UPDATE OF registration;
  v_created := NOT FOUND;
  IF v_created THEN
    INSERT INTO public.tenant_tencent_registrations(tenant_id, hardware_serial, device_type, created_by)
    VALUES (p_tenant_id, v_serial, p_device_type, p_employee_id) RETURNING * INTO v_registration;
    INSERT INTO public.tenant_tencent_registration_serials(tenant_id, hardware_serial, registration_id)
    VALUES (p_tenant_id, v_serial, v_registration.id);
  ELSIF v_registration.hardware_serial <> v_serial THEN
    RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
  END IF;

  IF v_created THEN
    -- Include existing channel rows. Two distinct cloud IDs make legacy ownership ambiguous.
    -- Exact normalized equality, never ILIKE (SN may contain '%' or '_').
    SELECT array_agg(device.vendor_device_serial) INTO v_cloud_ids FROM (
      SELECT DISTINCT vendor_device_serial FROM public.tenant_devices
      WHERE tenant_id = p_tenant_id AND vendor = 'tencent_iotvideo_industry'
        AND upper(btrim(hardware_serial)) = v_serial AND deleted_at IS NULL
      LIMIT 2
    ) device;
    IF cardinality(v_cloud_ids) > 1 THEN
      RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
    ELSIF cardinality(v_cloud_ids) = 1 THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:tencent_iotvideo_industry:' || v_cloud_ids[1], 0));
      SELECT * INTO v_asset FROM public.tenant_devices
        WHERE tenant_id = p_tenant_id AND vendor = 'tencent_iotvideo_industry'
          AND upper(btrim(hardware_serial)) = v_serial AND deleted_at IS NULL
        ORDER BY (vendor_channel_id IS NULL) DESC, id LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT'; END IF;
      UPDATE public.tenant_tencent_registrations SET state = 'completed', asset_id = v_asset.id,
        cloud_device_id = v_asset.vendor_device_serial, cloud_device_code = v_asset.vendor_device_code,
        device_type = CASE v_asset.device_type WHEN 'NVR' THEN 3 WHEN 'IPC' THEN 2 ELSE p_device_type END,
        updated_at = now()
      WHERE id = v_registration.id RETURNING * INTO v_registration;
      v_created := false;
    END IF;
  END IF;

  IF v_registration.state = 'completed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:tencent_iotvideo_industry:' || v_registration.cloud_device_id, 0));
    SELECT * INTO v_asset FROM public.tenant_devices
      WHERE id = v_registration.asset_id AND tenant_id = p_tenant_id
        AND vendor = 'tencent_iotvideo_industry'
        AND vendor_device_serial = v_registration.cloud_device_id
        AND upper(btrim(hardware_serial)) = v_registration.hardware_serial
        AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT'; END IF;
  END IF;
  RETURN jsonb_build_object('registration', to_jsonb(v_registration), 'can_create', v_created,
    'asset', CASE WHEN v_asset.id IS NOT NULL THEN to_jsonb(v_asset) ELSE NULL END);
END;
$$;

CREATE FUNCTION public.save_tenant_tencent_registration_cloud(
  p_tenant_id uuid, p_registration_id uuid, p_device_id text,
  p_device_code text, p_virtual_group_id text, p_request_id text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_registration public.tenant_tencent_registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_registration FROM public.tenant_tencent_registrations
    WHERE id = p_registration_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR nullif(btrim(p_device_id), '') IS NULL
    OR (v_registration.cloud_device_id IS NOT NULL AND v_registration.cloud_device_id <> p_device_id) THEN
    RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
  END IF;
  -- A concurrent recovery of the same receipt must not undo completion or replace original metadata.
  IF v_registration.state <> 'pending' THEN RETURN; END IF;
  UPDATE public.tenant_tencent_registrations SET state = 'cloud_created',
    cloud_device_id = p_device_id, cloud_device_code = p_device_code,
    cloud_virtual_group_id = p_virtual_group_id, cloud_request_id = p_request_id,
    updated_at = now() WHERE id = p_registration_id;
END;
$$;

CREATE FUNCTION public.complete_tenant_tencent_registration(
  p_tenant_id uuid, p_registration_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_registration public.tenant_tencent_registrations%ROWTYPE;
  v_asset public.tenant_devices%ROWTYPE;
BEGIN
  SELECT * INTO v_registration FROM public.tenant_tencent_registrations
    WHERE id = p_registration_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_registration.state = 'pending' THEN
    RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
  END IF;
  IF v_registration.state = 'completed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:tencent_iotvideo_industry:' || v_registration.cloud_device_id, 0));
    SELECT * INTO v_asset FROM public.tenant_devices
      WHERE id = v_registration.asset_id AND tenant_id = p_tenant_id
        AND vendor = 'tencent_iotvideo_industry'
        AND vendor_device_serial = v_registration.cloud_device_id
        AND upper(btrim(hardware_serial)) = v_registration.hardware_serial
        AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT'; END IF;
    RETURN to_jsonb(v_asset);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:tencent_iotvideo_industry:' || v_registration.cloud_device_id, 0));
  -- Atomically insert the parent asset and complete the claim. A failed transaction leaves
  -- the separately committed cloud receipt intact. Concurrent callers serialize on the claim.
  INSERT INTO public.tenant_devices(tenant_id, vendor, hardware_serial,
    vendor_device_serial, vendor_device_code, vendor_device_name, device_type,
    status, metadata, created_by, updated_by)
  VALUES (p_tenant_id, 'tencent_iotvideo_industry', v_registration.hardware_serial,
    v_registration.cloud_device_id, v_registration.cloud_device_code, v_registration.hardware_serial,
    CASE v_registration.device_type WHEN 3 THEN 'NVR' ELSE 'IPC' END,
    'unknown', jsonb_build_object('virtual_group_id', v_registration.cloud_virtual_group_id,
      'sip_transport_protocol', 'TCP'), v_registration.created_by, v_registration.created_by)
  RETURNING * INTO v_asset;
  UPDATE public.tenant_tencent_registrations SET state = 'completed', asset_id = v_asset.id,
    updated_at = now() WHERE id = p_registration_id;
  RETURN to_jsonb(v_asset);
END;
$$;

-- Atomic admin SN rename, including the receipt and historical fences. Null clears the
-- asset SN without freeing any historical key. A later non-null rename can restore it.
CREATE FUNCTION public.rename_tenant_tencent_device_serial(
  p_tenant_id uuid, p_asset_id uuid, p_hardware_serial text, p_employee_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_asset public.tenant_devices%ROWTYPE;
  v_registration public.tenant_tencent_registrations%ROWTYPE;
  v_serial text := upper(btrim(p_hardware_serial));
  v_device_id text;
BEGIN
  IF p_tenant_id IS NULL OR (v_serial IS NOT NULL AND length(v_serial) NOT BETWEEN 1 AND 160) THEN
    RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant-tencent-registration:' || p_tenant_id::text, 0));
  -- Discovery only; do not lock an asset before its receipt and shared device lock.
  SELECT * INTO v_asset FROM public.tenant_devices
    WHERE id = p_asset_id AND tenant_id = p_tenant_id AND vendor = 'tencent_iotvideo_industry' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT'; END IF;
  v_device_id := v_asset.vendor_device_serial;
  SELECT * INTO v_registration FROM public.tenant_tencent_registrations
    WHERE tenant_id = p_tenant_id AND cloud_device_id = v_device_id FOR UPDATE;
  IF NOT FOUND AND nullif(btrim(v_asset.hardware_serial), '') IS NOT NULL THEN
    -- Adopt the legacy OLD key before moving any asset. claim uses the same tenant ->
    -- receipt -> device -> asset lock order and never invokes Tencent. Its writes also
    -- roll back if any later rename check/update fails.
    PERFORM public.claim_tenant_tencent_registration(p_tenant_id, v_asset.hardware_serial,
      CASE v_asset.device_type WHEN 'NVR' THEN 3 ELSE 2 END, p_employee_id);
    SELECT * INTO v_registration FROM public.tenant_tencent_registrations
      WHERE tenant_id = p_tenant_id AND cloud_device_id = v_device_id FOR UPDATE;
    -- An unrelated or uncertain operation already owning the old SN cannot be adopted.
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT'; END IF;
  END IF;
  IF v_registration.id IS NOT NULL AND v_registration.state <> 'completed' THEN
    RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:tencent_iotvideo_industry:' || v_device_id, 0));
  SELECT * INTO v_asset FROM public.tenant_devices
    WHERE id = p_asset_id AND tenant_id = p_tenant_id AND vendor = 'tencent_iotvideo_industry'
      AND vendor_device_serial = v_device_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT'; END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_tencent_registration_serials
    WHERE tenant_id = p_tenant_id AND hardware_serial = v_serial
      AND registration_id IS DISTINCT FROM v_registration.id)
    OR EXISTS (SELECT 1 FROM public.tenant_devices WHERE tenant_id = p_tenant_id
      AND vendor = 'tencent_iotvideo_industry' AND upper(btrim(hardware_serial)) = v_serial
      AND vendor_device_serial <> v_device_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'TENANT_DEVICE_REGISTRATION_CONFLICT';
  END IF;
  IF v_registration.id IS NOT NULL AND v_serial IS NOT NULL THEN
    INSERT INTO public.tenant_tencent_registration_serials(tenant_id, hardware_serial, registration_id)
      VALUES (p_tenant_id, v_serial, v_registration.id) ON CONFLICT DO NOTHING;
    UPDATE public.tenant_tencent_registrations SET hardware_serial = v_serial, updated_at = now()
      WHERE id = v_registration.id;
  END IF;
  UPDATE public.tenant_devices SET hardware_serial = v_serial,
    updated_by = p_employee_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND vendor = 'tencent_iotvideo_industry'
      AND vendor_device_serial = v_device_id AND deleted_at IS NULL;
  SELECT * INTO v_asset FROM public.tenant_devices WHERE id = p_asset_id;
  RETURN to_jsonb(v_asset);
END;
$$;
REVOKE ALL ON FUNCTION public.rename_tenant_tencent_device_serial(uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_tenant_tencent_device_serial(uuid,uuid,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_tenant_tencent_registration(uuid,text,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_tenant_tencent_registration_cloud(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_tenant_tencent_registration(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tenant_tencent_registration(uuid,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_tenant_tencent_registration_cloud(uuid,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_tenant_tencent_registration(uuid,uuid) TO service_role;

COMMENT ON TABLE public.tenant_tencent_registrations IS
  '腾讯登记持久占位及无密码回执；pending 结果未知时禁止再次创建，仅精确标记核对后恢复';
-- Rollback: deploy the previous API only after disabling Tencent registration writes.
-- Keep both registration tables and their data, including historical SN fences and pending claims,
-- until every cloud operation is reconciled.
-- Dropping the fence or enabling the old creation path would reintroduce duplicate cloud creation.
