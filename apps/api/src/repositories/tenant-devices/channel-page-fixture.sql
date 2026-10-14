INSERT INTO tenants VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO employees VALUES ('00000000-0000-4000-8000-000000000010');
INSERT INTO projects VALUES ('00000000-0000-4000-8000-000000000020');
INSERT INTO project_cameras VALUES ('00000000-0000-4000-8000-000000000030');
INSERT INTO tenant_devices(id,tenant_id,vendor,vendor_device_serial,hardware_serial)
VALUES ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000001','tencent_iotvideo_industry','cloud','SN-ONE');
DO $$
DECLARE
  t uuid := '00000000-0000-4000-8000-000000000001';
  a uuid := '00000000-0000-4000-8000-000000000040';
  e uuid := '00000000-0000-4000-8000-000000000010';
  c jsonb := '[{"channel_id":"ch1","channel_name":"客厅","status":"online"},{"channel_id":"ch2","status":"offline"}]';
BEGIN
  PERFORM sync_tenant_device_channel_page(t,a,e,c,now());
  PERFORM sync_tenant_device_channel_page(t,a,e,c,now());
  IF (SELECT count(*) FROM tenant_devices) <> 3 OR
    (SELECT count(*) FROM tenant_devices WHERE hardware_serial='SN-ONE') <> 3 THEN
    RAISE EXCEPTION 'sync must preserve SN and replay without duplicate channels';
  END IF;
  UPDATE tenant_devices SET bound_project_id='00000000-0000-4000-8000-000000000020',
    bound_camera_id='00000000-0000-4000-8000-000000000030'
    WHERE vendor_channel_id='ch1';
  PERFORM sync_tenant_device_channel_page(t,a,e,'[{"channel_id":"ch1","status":"offline"}]',now()-interval '1 day');
  IF NOT EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_channel_id='ch1' AND status='online'
    AND bound_camera_id='00000000-0000-4000-8000-000000000030') THEN
    RAISE EXCEPTION 'sync overwrote current status or binding';
  END IF;
  UPDATE tenant_devices SET hardware_serial='SN-NEW' WHERE vendor_device_serial='cloud';
  PERFORM upsert_synced_tenant_device(jsonb_build_object('tenant_id',t,'vendor','tencent_iotvideo_industry',
    'vendor_device_serial','cloud','vendor_channel_id','ch1','hardware_serial','SN-OLD','status','online'));
  PERFORM upsert_synced_tenant_device(jsonb_build_object('tenant_id',t,'vendor','tencent_iotvideo_industry',
    'vendor_device_serial','cloud','vendor_channel_id','legacy-new','hardware_serial','SN-OLD','status','online'));
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_device_serial='cloud' AND hardware_serial IS DISTINCT FROM 'SN-NEW')
    OR NOT EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_channel_id='ch1' AND bound_camera_id IS NOT NULL) THEN
    RAISE EXCEPTION 'legacy sync rewrote current SN or binding';
  END IF;
  UPDATE tenant_devices SET hardware_serial=NULL WHERE vendor_channel_id='ch2';
  PERFORM upsert_synced_tenant_device(jsonb_build_object('tenant_id',t,'vendor','tencent_iotvideo_industry',
    'vendor_device_serial','cloud','vendor_channel_id','ch2','status','online'));
  IF NOT EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_channel_id='ch2' AND hardware_serial='SN-NEW') THEN
    RAISE EXCEPTION 'missing channel SN was not restored from current parent';
  END IF;
  UPDATE tenant_devices SET hardware_serial=NULL WHERE vendor_device_serial='cloud';
  PERFORM upsert_synced_tenant_device(jsonb_build_object('tenant_id',t,'vendor','tencent_iotvideo_industry',
    'vendor_device_serial','cloud','vendor_channel_id','after-clear','hardware_serial','SN-OLD','status','online'));
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_device_serial='cloud' AND hardware_serial IS NOT NULL) THEN
    RAISE EXCEPTION 'legacy sync undid an intentional SN clear';
  END IF;
  BEGIN
    PERFORM sync_tenant_device_channel_page(t,a,e,'[{"channel_id":"rollback","status":"online"},{"channel_id":"bad","status":"invalid"}]',now());
    RAISE EXCEPTION 'invalid second row must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_channel_id='rollback') THEN
    RAISE EXCEPTION 'failed page committed first row';
  END IF;
  INSERT INTO tenant_devices(tenant_id,vendor,vendor_device_serial,vendor_channel_id)
    VALUES('00000000-0000-4000-8000-000000000002','tencent_iotvideo_industry','cloud','foreign');
  BEGIN
    PERFORM sync_tenant_device_channel_page(t,a,e,'[{"channel_id":"rollback","status":"online"},{"channel_id":"foreign","status":"online"}]',now());
    RAISE EXCEPTION 'foreign channel must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_channel_id='rollback') THEN
    RAISE EXCEPTION 'page partially committed';
  END IF;
  BEGIN
    PERFORM sync_tenant_device_channel_page('00000000-0000-4000-8000-000000000002',a,e,c,now());
    RAISE EXCEPTION 'foreign asset must fail';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  INSERT INTO tenant_devices(id,tenant_id,vendor,vendor_device_serial,vendor_channel_id)
    VALUES ('00000000-0000-4000-8000-000000000041',t,'tencent_iotvideo_industry','split-cloud','owned-channel'),
      (gen_random_uuid(),'00000000-0000-4000-8000-000000000002','tencent_iotvideo_industry','split-cloud',NULL);
  BEGIN
    PERFORM sync_tenant_device_channel_page(t,'00000000-0000-4000-8000-000000000041',e,'[{"channel_id":"new-channel","status":"online"}]',now());
    RAISE EXCEPTION 'foreign parent must block unknown channel';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_device_serial='split-cloud' AND vendor_channel_id='new-channel') THEN
    RAISE EXCEPTION 'claimed foreign device channel';
  END IF;
  -- Legacy device has siblings but no root: neither a stale SN nor a clear may be undone.
  INSERT INTO tenant_devices(tenant_id,vendor,vendor_device_serial,vendor_channel_id,hardware_serial)
    VALUES (t,'tencent_iotvideo_industry','no-root','ch1','SN-NEW');
  PERFORM upsert_synced_tenant_device(jsonb_build_object('tenant_id',t,'vendor','tencent_iotvideo_industry',
    'vendor_device_serial','no-root','vendor_channel_id','ch2','hardware_serial','SN-OLD','status','online'));
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_device_serial='no-root' AND hardware_serial IS DISTINCT FROM 'SN-NEW') THEN
    RAISE EXCEPTION 'rootless legacy sync undid rename';
  END IF;
  UPDATE tenant_devices SET hardware_serial=NULL WHERE vendor_device_serial='no-root';
  PERFORM upsert_synced_tenant_device(jsonb_build_object('tenant_id',t,'vendor','tencent_iotvideo_industry',
    'vendor_device_serial','no-root','vendor_channel_id','ch3','hardware_serial','SN-OLD','status','online'));
  IF EXISTS(SELECT 1 FROM tenant_devices WHERE vendor_device_serial='no-root' AND hardware_serial IS NOT NULL) THEN
    RAISE EXCEPTION 'rootless legacy sync undid clear';
  END IF;
  IF has_function_privilege('authenticated','public.sync_tenant_device_channel_page(uuid,uuid,uuid,jsonb,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot call internal RPC';
  END IF;
END $$;
-- Exact local channel lookup must use the migration-managed bounded-page index.
INSERT INTO tenant_devices(tenant_id,vendor,vendor_device_serial,vendor_channel_id)
SELECT '00000000-0000-4000-8000-000000000001','tencent_iotvideo_industry','device-'||i,'ch-'||i
FROM generate_series(1,12000) i;
ANALYZE tenant_devices;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id,vendor_channel_id FROM tenant_devices
WHERE tenant_id='00000000-0000-4000-8000-000000000001'
  AND vendor='tencent_iotvideo_industry' AND vendor_device_serial='cloud'
  AND vendor_channel_id IS NOT NULL AND deleted_at IS NULL
ORDER BY vendor_channel_id,id LIMIT 20;
SELECT 'channel-page assertions passed';
