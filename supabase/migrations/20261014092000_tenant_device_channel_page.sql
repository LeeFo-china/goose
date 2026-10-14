-- Single-device sync never changes project occupation. Backend service_role only.
-- Rollback: first roll back API routes, then drop this RPC/index; keep synchronized data.
CREATE INDEX IF NOT EXISTS tenant_devices_channel_page_idx
  ON public.tenant_devices(tenant_id, vendor, vendor_device_serial, vendor_channel_id, id)
  WHERE deleted_at IS NULL AND vendor_channel_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_tenant_device_channel_page(
  p_tenant_id uuid, p_asset_id uuid, p_employee_id uuid,
  p_channels jsonb, p_checked_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_asset public.tenant_devices%ROWTYPE;
  v_channel jsonb;
  v_id uuid;
  v_sn text;
BEGIN
  IF p_tenant_id IS NULL OR p_employee_id IS NULL OR p_checked_at IS NULL
    OR jsonb_typeof(p_channels) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_channels) > 50 THEN
    RAISE EXCEPTION 'Invalid sync page' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_asset FROM public.tenant_devices
    WHERE id = p_asset_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'camera-device:' || v_asset.vendor || ':' || v_asset.vendor_device_serial, 0));
  SELECT * INTO v_asset FROM public.tenant_devices
    WHERE id = p_asset_id AND tenant_id = p_tenant_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_devices
    WHERE vendor = v_asset.vendor AND vendor_device_serial = v_asset.vendor_device_serial
      AND deleted_at IS NULL AND tenant_id <> p_tenant_id) THEN
    RAISE EXCEPTION 'Device belongs to another tenant' USING ERRCODE = '42501';
  END IF;
  IF v_asset.vendor <> 'tencent_iotvideo_industry' THEN
    RAISE EXCEPTION 'Unsupported vendor' USING ERRCODE = '22023';
  END IF;
  SELECT hardware_serial INTO v_sn FROM public.tenant_devices
    WHERE tenant_id = p_tenant_id AND vendor = v_asset.vendor
      AND vendor_device_serial = v_asset.vendor_device_serial
      AND vendor_channel_id IS NULL AND deleted_at IS NULL LIMIT 1;
  v_sn := COALESCE(v_sn, v_asset.hardware_serial);
  FOR v_channel IN SELECT value FROM jsonb_array_elements(p_channels) LOOP
    IF NULLIF(btrim(v_channel->>'channel_id'), '') IS NULL
      OR length(v_channel->>'channel_id') > 160
      OR v_channel->>'status' IS NULL
      OR v_channel->>'status' NOT IN ('online','offline','unknown') THEN
      RAISE EXCEPTION 'Invalid channel' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.tenant_devices (
      tenant_id, vendor, hardware_serial, vendor_device_serial, vendor_device_code,
      vendor_device_name, vendor_channel_id, vendor_channel_code, vendor_channel_name,
      device_type, source_project_id, status, raw_status, last_synced_at,
      created_by, updated_by
    ) VALUES (
      p_tenant_id, v_asset.vendor, v_sn, v_asset.vendor_device_serial, v_asset.vendor_device_code,
      v_asset.vendor_device_name, v_channel->>'channel_id', v_channel->>'channel_code',
      v_channel->>'channel_name', v_asset.device_type, v_asset.source_project_id,
      v_channel->>'status', v_channel->>'raw_status', p_checked_at, p_employee_id, p_employee_id
    ) ON CONFLICT (vendor, vendor_device_serial, (COALESCE(vendor_channel_id, '')))
      WHERE deleted_at IS NULL
    DO UPDATE SET
      hardware_serial = COALESCE(EXCLUDED.hardware_serial, tenant_devices.hardware_serial),
      vendor_device_code = EXCLUDED.vendor_device_code,
      vendor_device_name = EXCLUDED.vendor_device_name,
      vendor_channel_code = EXCLUDED.vendor_channel_code,
      vendor_channel_name = EXCLUDED.vendor_channel_name,
      status = CASE WHEN tenant_devices.last_synced_at > EXCLUDED.last_synced_at
        THEN tenant_devices.status ELSE EXCLUDED.status END,
      raw_status = CASE WHEN tenant_devices.last_synced_at > EXCLUDED.last_synced_at
        THEN tenant_devices.raw_status ELSE EXCLUDED.raw_status END,
      last_synced_at = GREATEST(tenant_devices.last_synced_at, EXCLUDED.last_synced_at),
      updated_by = p_employee_id
    WHERE tenant_devices.tenant_id = p_tenant_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Channel belongs to another tenant' USING ERRCODE = '42501'; END IF;
  END LOOP;
  RETURN jsonb_build_object('synced_count', jsonb_array_length(p_channels));
END;
$$;
REVOKE ALL ON FUNCTION public.sync_tenant_device_channel_page(uuid,uuid,uuid,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tenant_device_channel_page(uuid,uuid,uuid,jsonb,timestamptz) TO service_role;


-- Legacy bulk sync shares the device lock and reads CURRENT parent SN. A delayed
-- cloud snapshot must not undo an operator's rename/clear or a project unbind.
CREATE OR REPLACE FUNCTION public.upsert_synced_tenant_device(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid := (p_input->>'tenant_id')::uuid;
  v_vendor text := p_input->>'vendor';
  v_serial text := p_input->>'vendor_device_serial';
  v_channel text := p_input->>'vendor_channel_id';
  v_existing public.tenant_devices%ROWTYPE;
  v_saved public.tenant_devices%ROWTYPE;
  v_parent_sn text;
  v_has_parent boolean;
  v_current_serials text[];
BEGIN
  IF v_tenant IS NULL OR v_vendor NOT IN ('tencent_iotvideo_industry','ezviz')
    OR NULLIF(v_serial,'') IS NULL THEN
    RAISE EXCEPTION 'Invalid device' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:' || v_vendor || ':' || v_serial, 0));
  IF EXISTS (SELECT 1 FROM public.tenant_devices WHERE vendor=v_vendor
    AND vendor_device_serial=v_serial AND deleted_at IS NULL AND tenant_id<>v_tenant) THEN
    RAISE EXCEPTION 'Device belongs to another tenant' USING ERRCODE='42501';
  END IF;
  SELECT hardware_serial INTO v_parent_sn FROM public.tenant_devices
    WHERE tenant_id=v_tenant AND vendor=v_vendor AND vendor_device_serial=v_serial
      AND vendor_channel_id IS NULL AND deleted_at IS NULL LIMIT 1;
  v_has_parent := FOUND;
  IF NOT v_has_parent THEN
    -- Historical backfills can contain channels without a parent. Current siblings
    -- still fence a rename/clear; never resurrect the stale input in that case.
    SELECT array_agg(serial.hardware_serial) INTO v_current_serials FROM (
      SELECT DISTINCT hardware_serial FROM public.tenant_devices
      WHERE tenant_id=v_tenant AND vendor=v_vendor AND vendor_device_serial=v_serial
        AND deleted_at IS NULL LIMIT 2
    ) serial;
    IF cardinality(v_current_serials) > 1 THEN
      RAISE EXCEPTION 'Current device serial is ambiguous' USING ERRCODE='PDS01';
    END IF;
    IF cardinality(v_current_serials) = 1 THEN
      v_has_parent := true;
      v_parent_sn := v_current_serials[1];
    END IF;
  END IF;
  SELECT * INTO v_existing FROM public.tenant_devices
    WHERE vendor=v_vendor AND vendor_device_serial=v_serial
      AND COALESCE(vendor_channel_id,'')=COALESCE(v_channel,'') AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN
    UPDATE public.tenant_devices SET
      -- Preserve a current serial. Only missing channel serials inherit the current parent.
      hardware_serial=COALESCE(hardware_serial, v_parent_sn),
      vendor_device_code=p_input->>'vendor_device_code',
      vendor_device_name=p_input->>'vendor_device_name',
      vendor_channel_code=p_input->>'vendor_channel_code',
      vendor_channel_name=p_input->>'vendor_channel_name',
      device_type=p_input->>'device_type',
      source_project_id=(p_input->>'source_project_id')::uuid,
      status=p_input->>'status', raw_status=p_input->>'raw_status',
      metadata=COALESCE(p_input->'metadata','{}'::jsonb),
      updated_by=(p_input->>'updated_by')::uuid, last_synced_at=now(), updated_at=now()
    WHERE id=v_existing.id RETURNING * INTO v_saved;
  ELSE
    INSERT INTO public.tenant_devices(tenant_id,vendor,vendor_device_serial,hardware_serial,
      vendor_device_code,vendor_device_name,vendor_channel_id,vendor_channel_code,vendor_channel_name,
      device_type,source_project_id,status,raw_status,metadata,updated_by,created_by,last_synced_at)
    VALUES(v_tenant,v_vendor,v_serial,
      CASE WHEN v_has_parent THEN v_parent_sn ELSE p_input->>'hardware_serial' END,
      p_input->>'vendor_device_code',p_input->>'vendor_device_name',v_channel,
      p_input->>'vendor_channel_code',p_input->>'vendor_channel_name',p_input->>'device_type',
      (p_input->>'source_project_id')::uuid,p_input->>'status',p_input->>'raw_status',
      COALESCE(p_input->'metadata','{}'::jsonb),(p_input->>'updated_by')::uuid,
      (p_input->>'updated_by')::uuid,now()) RETURNING * INTO v_saved;
  END IF;
  RETURN jsonb_build_object('device',to_jsonb(v_saved),'created',v_existing.id IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.upsert_synced_tenant_device(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_synced_tenant_device(jsonb) TO service_role;
