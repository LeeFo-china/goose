-- Atomic local binding only: API authorization precedes these service-role RPCs.
-- Global identity matches existing active channel unique indexes (not tenant-local).
-- Shared with sync_tenant_device_channel_page: device advisory -> project -> asset -> camera.
CREATE INDEX IF NOT EXISTS idx_tenant_devices_active_bound_camera
  ON public.tenant_devices(bound_camera_id)
  WHERE deleted_at IS NULL AND bound_camera_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bind_project_camera(
  p_tenant_id uuid, p_project_id uuid, p_payload jsonb, p_actor_employee_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_vendor text := COALESCE(p_payload->>'vendor', 'ezviz');
  v_serial text := p_payload->>'vendor_device_serial';
  v_channel text := p_payload->>'vendor_channel_id';
  v_asset_id uuid := (p_payload->>'tenant_device_id')::uuid;
  v_project_status text;
  v_asset public.tenant_devices%ROWTYPE;
  v_camera public.project_cameras%ROWTYPE;
  v_existing_project uuid;
BEGIN
  -- This first read only resolves the lock key; every decision is revalidated under locks.
  IF v_asset_id IS NOT NULL THEN
    SELECT vendor, vendor_device_serial INTO v_vendor, v_serial
    FROM public.tenant_devices
    WHERE id = v_asset_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA02', MESSAGE = '设备资产不存在';
    END IF;
  END IF;
  IF p_tenant_id IS NULL OR v_vendor IS NULL OR NULLIF(v_serial, '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA03', MESSAGE = '缺少租户或设备标识';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:' || v_vendor || ':' || v_serial, 0));

  SELECT status INTO v_project_status FROM public.projects
  WHERE id = p_project_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA01', MESSAGE = '项目不存在';
  END IF;
  IF v_project_status = 'invalid' THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA03', MESSAGE = '无效项目不能新增摄像头';
  ELSIF v_project_status = 'acceptance' THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA03', MESSAGE = '竣工验收项目不能新增摄像头';
  END IF;

  -- The shared device lock protects the whole cloud device, not just one channel.
  -- A root or sibling channel owned by another tenant also fences unseen channels.
  -- Uses the (vendor, vendor_device_serial) prefix of the active-channel unique index.
  PERFORM 1 FROM public.tenant_devices
  WHERE vendor = v_vendor AND vendor_device_serial = v_serial
    AND tenant_id <> p_tenant_id AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA05', MESSAGE = '该设备已归属其他租户';
  END IF;

  IF v_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset FROM public.tenant_devices
    WHERE id = v_asset_id AND tenant_id = p_tenant_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA02', MESSAGE = '设备资产不存在';
    END IF;
    IF v_asset.vendor IS DISTINCT FROM v_vendor OR v_asset.vendor_device_serial IS DISTINCT FROM v_serial THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA07', MESSAGE = '设备标识已变更，请刷新后重试';
    END IF;
    -- Preserve the existing asset-ID entry contract; legacy ezviz payloads may omit channel ID.
    IF NULLIF(v_asset.vendor_channel_id, '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA06', MESSAGE = '设备尚未同步出可绑定通道';
    END IF;
  ELSE
    SELECT * INTO v_asset FROM public.tenant_devices
    WHERE vendor = v_vendor AND vendor_device_serial = v_serial
      AND COALESCE(vendor_channel_id, '') = COALESCE(v_channel, '') AND deleted_at IS NULL
    FOR UPDATE;
  END IF;
  IF v_asset.id IS NOT NULL THEN
    IF v_asset.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA05', MESSAGE = '该设备已归属其他租户';
    END IF;
    IF v_asset.bound_camera_id IS NOT NULL OR v_asset.bound_project_id IS NOT NULL THEN
      IF v_asset.bound_project_id = p_project_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PCA04', MESSAGE = '该设备已绑定到当前项目';
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'PCA05', MESSAGE = '该设备已绑定到其他项目，请先解绑后再绑定';
    END IF;
    v_channel := v_asset.vendor_channel_id;
  END IF;

  SELECT project_id INTO v_existing_project FROM public.project_cameras
  WHERE vendor = v_vendor AND vendor_device_serial = v_serial AND deleted_at IS NULL
    AND ((v_vendor = 'ezviz' AND channel_no = COALESCE((p_payload->>'channel_no')::integer, 1))
      OR (v_vendor = 'tencent_iotvideo_industry' AND vendor_channel_id = v_channel))
  LIMIT 1;
  IF FOUND THEN
    IF v_existing_project = p_project_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA04', MESSAGE = '该摄像头已绑定到当前项目';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'PCA05', MESSAGE = '该摄像头已绑定到其他项目，请先解绑后再绑定';
  END IF;

  INSERT INTO public.project_cameras (
    tenant_id, project_id, vendor, vendor_device_serial, vendor_channel_id,
    vendor_device_code, vendor_channel_code, channel_no, name, position,
    can_view, can_control, capabilities, cover_url, sort_order, remark, video_encrypted, play_protocol
  ) VALUES (
    p_tenant_id, p_project_id, v_vendor, v_serial, v_channel,
    CASE WHEN v_asset.id IS NOT NULL THEN v_asset.vendor_device_code ELSE p_payload->>'vendor_device_code' END,
    CASE WHEN v_asset.id IS NOT NULL THEN v_asset.vendor_channel_code ELSE p_payload->>'vendor_channel_code' END,
    COALESCE((p_payload->>'channel_no')::integer, 1), p_payload->>'name', p_payload->>'position',
    COALESCE((p_payload->>'can_view')::boolean, true), COALESCE((p_payload->>'can_control')::boolean, false),
    COALESCE(p_payload->'capabilities', '["live"]'::jsonb), p_payload->>'cover_url',
    COALESCE((p_payload->>'sort_order')::integer, 0), p_payload->>'remark',
    COALESCE((p_payload->>'video_encrypted')::boolean, false), COALESCE(p_payload->>'play_protocol', 'flv')
  ) RETURNING * INTO v_camera;

  IF v_asset.id IS NULL THEN
    INSERT INTO public.tenant_devices (
      tenant_id, vendor, vendor_device_serial, vendor_device_code, vendor_channel_id,
      vendor_channel_code, vendor_channel_name, source_project_id, bound_project_id,
      bound_camera_id, metadata, created_by, updated_by
    ) VALUES (
      p_tenant_id, v_vendor, v_serial, v_camera.vendor_device_code, v_channel,
      v_camera.vendor_channel_code, v_camera.name, p_project_id, p_project_id, v_camera.id,
      jsonb_build_object('position', v_camera.position, 'channel_no', v_camera.channel_no, 'play_protocol', v_camera.play_protocol),
      p_actor_employee_id, p_actor_employee_id
    );
  ELSE
    -- Binding does not discard registration/SN metadata or a concurrent sync's status.
    UPDATE public.tenant_devices SET
      bound_project_id = p_project_id, bound_camera_id = v_camera.id,
      source_project_id = COALESCE(source_project_id, p_project_id),
      vendor_channel_name = v_camera.name,
      metadata = metadata || jsonb_build_object('position', v_camera.position, 'channel_no', v_camera.channel_no, 'play_protocol', v_camera.play_protocol),
      updated_by = p_actor_employee_id, updated_at = now()
    WHERE id = v_asset.id;
  END IF;
  RETURN jsonb_build_object('id', v_camera.id);
END $$;

CREATE OR REPLACE FUNCTION public.unbind_project_camera(
  p_tenant_id uuid, p_project_id uuid, p_camera_id uuid, p_actor_employee_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_vendor text;
  v_serial text;
  v_camera public.project_cameras%ROWTYPE;
  v_asset public.tenant_devices%ROWTYPE;
BEGIN
  SELECT vendor, vendor_device_serial INTO v_vendor, v_serial FROM public.project_cameras
  WHERE id = p_camera_id AND tenant_id = p_tenant_id AND project_id = p_project_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA02', MESSAGE = '摄像头不存在或已解绑';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('camera-device:' || v_vendor || ':' || v_serial, 0));
  PERFORM 1 FROM public.projects WHERE id = p_project_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA01', MESSAGE = '项目不存在';
  END IF;
  -- Legacy cameras may predate the asset backfill. No asset is a valid cleanup case.
  FOR v_asset IN SELECT * FROM public.tenant_devices
    WHERE bound_camera_id = p_camera_id AND deleted_at IS NULL ORDER BY id FOR UPDATE
  LOOP
    IF v_asset.tenant_id IS DISTINCT FROM p_tenant_id OR v_asset.bound_project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PCA05', MESSAGE = '设备资产绑定范围不一致';
    END IF;
  END LOOP;
  SELECT * INTO v_camera FROM public.project_cameras
  WHERE id = p_camera_id AND tenant_id = p_tenant_id AND project_id = p_project_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA02', MESSAGE = '摄像头不存在或已解绑';
  END IF;
  IF v_camera.vendor IS DISTINCT FROM v_vendor OR v_camera.vendor_device_serial IS DISTINCT FROM v_serial THEN
    RAISE EXCEPTION USING ERRCODE = 'PCA07', MESSAGE = '设备标识已变更，请刷新后重试';
  END IF;
  UPDATE public.project_cameras SET deleted_at = now(), updated_at = now() WHERE id = p_camera_id;
  UPDATE public.tenant_devices SET bound_camera_id = NULL, bound_project_id = NULL,
    updated_by = p_actor_employee_id, updated_at = now()
  WHERE bound_camera_id = p_camera_id AND tenant_id = p_tenant_id AND bound_project_id = p_project_id AND deleted_at IS NULL;
  RETURN jsonb_build_object('id', p_camera_id);
END $$;

REVOKE ALL ON FUNCTION public.bind_project_camera(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unbind_project_camera(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_project_camera(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unbind_project_camera(uuid, uuid, uuid, uuid) TO service_role;
-- Rollback (after reverting API callers): drop these two functions and the lookup index.
-- No existing rows are rewritten; existing active channel unique indexes remain authoritative.
