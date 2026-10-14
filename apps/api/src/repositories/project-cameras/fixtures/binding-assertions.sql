SELECT binding_assert(NOT has_function_privilege('anon', 'public.bind_project_camera(uuid,uuid,jsonb,uuid)', 'EXECUTE'), 'anon cannot bind');
SELECT binding_assert(NOT has_function_privilege('authenticated', 'public.unbind_project_camera(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot bypass API authorization');
SELECT binding_assert(has_function_privilege('service_role', 'public.bind_project_camera(uuid,uuid,jsonb,uuid)', 'EXECUTE'), 'service role can bind');
SELECT binding_expect_error($q$SELECT test_bind('foreign-project','103')$q$, 'PCA01');
SELECT binding_expect_error($q$SELECT test_bind('missing-project','999')$q$, 'PCA01');
SELECT binding_expect_error($q$SELECT test_bind('missing-asset','101','{"tenant_device_id":"00000000-0000-4000-8000-000000000999"}')$q$, 'PCA02');
UPDATE projects SET status='invalid' WHERE id='00000000-0000-4000-8000-000000000101';
SELECT binding_expect_error($q$SELECT test_bind('invalid')$q$, 'PCA03');
UPDATE projects SET status='acceptance' WHERE id='00000000-0000-4000-8000-000000000101';
SELECT binding_expect_error($q$SELECT test_bind('acceptance')$q$, 'PCA03');
UPDATE projects SET status='constructing' WHERE id='00000000-0000-4000-8000-000000000101';

INSERT INTO tenant_devices(id, tenant_id, vendor, vendor_device_serial, vendor_channel_id, vendor_device_code, status, metadata) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','tencent_iotvideo_industry','asset-device','real-channel','real-code','offline','{"sn":"keep"}'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000002','tencent_iotvideo_industry','foreign-device','channel',NULL,'unknown','{}'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000001','tencent_iotvideo_industry','pending-device',NULL,NULL,'unknown','{}');
-- Device ownership fences channels that have not been discovered locally yet.
INSERT INTO tenant_devices(tenant_id, vendor, vendor_device_serial, vendor_channel_id) VALUES
 ('00000000-0000-4000-8000-000000000002','tencent_iotvideo_industry','foreign-parent-only',NULL),
 ('00000000-0000-4000-8000-000000000001','tencent_iotvideo_industry','same-tenant-parent',NULL);
SELECT binding_expect_error($q$SELECT test_bind('foreign-parent-only','101','{"vendor_channel_id":"unknown-channel"}')$q$, 'PCA05');
SELECT binding_assert(NOT EXISTS(SELECT FROM project_cameras WHERE vendor_device_serial='foreign-parent-only')
 AND (SELECT count(*)=1 FROM tenant_devices WHERE vendor_device_serial='foreign-parent-only'), 'foreign root blocks unknown channel without camera or asset writes');
-- Any active sibling channel proves ownership too, even without a root asset.
SELECT binding_expect_error($q$SELECT test_bind('foreign-device','101','{"vendor_channel_id":"another-unknown-channel"}')$q$, 'PCA05');
SELECT test_bind('same-tenant-parent','101','{"vendor_channel_id":"unknown-channel"}');
SELECT binding_assert((SELECT count(*)=1 FROM project_cameras c JOIN tenant_devices d ON d.bound_camera_id=c.id
 WHERE c.vendor_device_serial='same-tenant-parent' AND c.vendor_channel_id='unknown-channel'
 AND d.tenant_id=c.tenant_id AND d.bound_project_id=c.project_id), 'same-tenant root allows a new legacy channel atomically');
-- Historical soft-deleted ownership does not reserve a device forever.
INSERT INTO tenant_devices(tenant_id, vendor, vendor_device_serial, vendor_channel_id, deleted_at)
VALUES ('00000000-0000-4000-8000-000000000002','tencent_iotvideo_industry','deleted-foreign-parent',NULL,now());
SELECT test_bind('deleted-foreign-parent','101','{"vendor_channel_id":"unknown-channel"}');
SELECT binding_assert((SELECT count(*)=1 FROM project_cameras WHERE vendor_device_serial='deleted-foreign-parent' AND deleted_at IS NULL), 'deleted foreign root does not block legacy binding');

SELECT binding_expect_error($q$SELECT test_bind('foreign-device')$q$, 'PCA05');
SELECT binding_expect_error($q$SELECT test_bind('ignored','101','{"tenant_device_id":"00000000-0000-4000-8000-000000000202"}')$q$, 'PCA02');
SELECT binding_expect_error($q$SELECT test_bind('ignored','101','{"tenant_device_id":"00000000-0000-4000-8000-000000000203"}')$q$, 'PCA06');
SELECT test_bind('submitted-is-stale','101','{"tenant_device_id":"00000000-0000-4000-8000-000000000201", "remark":"retain", "capabilities":["live","ptz"], "can_view":false, "position":"door", "play_protocol":"hls"}');
SELECT binding_assert((SELECT count(*)=1 FROM project_cameras c JOIN tenant_devices d ON d.bound_camera_id=c.id
 WHERE c.vendor_device_serial='asset-device' AND c.vendor_channel_id='real-channel' AND c.vendor_device_code='real-code'
 AND c.remark='retain' AND c.capabilities='["live","ptz"]' AND NOT c.can_view AND c.play_protocol='hls'
 AND d.bound_project_id=c.project_id AND d.metadata->>'sn'='keep'), 'asset identity overrides stale payload, options and metadata preserved');
SELECT binding_expect_error($q$SELECT test_bind('asset-device','101','{"vendor_channel_id":"real-channel"}')$q$, 'PCA04');
SELECT binding_expect_error($q$SELECT test_bind('asset-device','102','{"vendor_channel_id":"real-channel"}')$q$, 'PCA05');

-- A failure in the SECOND table write must roll back the first table too.
CREATE FUNCTION public.binding_inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.vendor_device_serial LIKE 'rollback-%' THEN RAISE EXCEPTION 'injected asset storage error'; END IF; RETURN NEW; END $$;
CREATE TRIGGER binding_fail BEFORE INSERT OR UPDATE ON tenant_devices FOR EACH ROW EXECUTE FUNCTION binding_inject_failure();
SELECT binding_expect_error($q$SELECT test_bind('rollback-create')$q$, 'P0001');
SELECT binding_assert(NOT EXISTS(SELECT FROM project_cameras WHERE vendor_device_serial='rollback-create'), 'failed asset insert rolls camera back');
-- The same rollback guarantee applies to claiming an existing asset.
ALTER TABLE tenant_devices DISABLE TRIGGER binding_fail;
INSERT INTO tenant_devices(tenant_id,vendor,vendor_device_serial,vendor_channel_id)
VALUES ('00000000-0000-4000-8000-000000000001','tencent_iotvideo_industry','rollback-existing','channel');
ALTER TABLE tenant_devices ENABLE TRIGGER binding_fail;
SELECT binding_expect_error($q$SELECT test_bind('rollback-existing')$q$, 'P0001');
SELECT binding_assert(NOT EXISTS(SELECT FROM project_cameras WHERE vendor_device_serial='rollback-existing')
 AND (SELECT bound_camera_id IS NULL AND bound_project_id IS NULL FROM tenant_devices WHERE vendor_device_serial='rollback-existing'), 'failed existing asset update rolls camera back');
DROP TRIGGER binding_fail ON tenant_devices;
SELECT test_bind('rollback-delete');
CREATE TRIGGER binding_fail BEFORE INSERT OR UPDATE ON tenant_devices FOR EACH ROW EXECUTE FUNCTION binding_inject_failure();
SELECT binding_expect_error(format('SELECT unbind_project_camera(%L,%L,%L,NULL)',
 '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
 (SELECT id FROM project_cameras WHERE vendor_device_serial='rollback-delete')), 'P0001');
SELECT binding_assert((SELECT c.deleted_at IS NULL AND d.bound_camera_id=c.id FROM project_cameras c JOIN tenant_devices d ON d.bound_camera_id=c.id WHERE c.vendor_device_serial='rollback-delete'), 'failed asset release restores camera and binding');
DROP TRIGGER binding_fail ON tenant_devices;
SELECT binding_expect_error(format('SELECT unbind_project_camera(%L,%L,%L,NULL)',
 '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000103',
 (SELECT id FROM project_cameras WHERE vendor_device_serial='rollback-delete')), 'PCA02');
SELECT binding_expect_error(format('SELECT unbind_project_camera(%L,%L,%L,NULL)',
 '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102',
 (SELECT id FROM project_cameras WHERE vendor_device_serial='rollback-delete')), 'PCA02');
-- Terminal status blocks NEW bindings, not cleanup of existing bindings.
UPDATE projects SET status='acceptance' WHERE id='00000000-0000-4000-8000-000000000101';
SELECT unbind_project_camera('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',id,NULL)
 FROM project_cameras WHERE vendor_device_serial='rollback-delete';
SELECT binding_assert((SELECT c.deleted_at IS NOT NULL AND d.bound_camera_id IS NULL AND d.bound_project_id IS NULL
 FROM project_cameras c JOIN tenant_devices d USING(vendor_device_serial) WHERE c.vendor_device_serial='rollback-delete'), 'unbind atomically releases both');
UPDATE projects SET status='constructing' WHERE id='00000000-0000-4000-8000-000000000101';
SELECT test_bind('rollback-delete','102');
SELECT binding_assert((SELECT count(*)=1 FROM project_cameras WHERE vendor_device_serial='rollback-delete' AND deleted_at IS NULL), 'transfer after unbind has one active camera');
SELECT test_bind('ezviz-device','101','{"vendor":"ezviz", "vendor_channel_id":null, "channel_no":2}');
SELECT binding_assert((SELECT c.channel_no=2 AND d.bound_camera_id=c.id FROM project_cameras c JOIN tenant_devices d USING(vendor_device_serial) WHERE c.vendor_device_serial='ezviz-device'), 'legacy ezviz nullable channel supported');

SELECT binding_expect_error(format('SELECT unbind_project_camera(%L,%L,%L,NULL)',
 '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
 (SELECT id FROM project_cameras WHERE vendor_device_serial='rollback-delete' AND deleted_at IS NOT NULL)), 'PCA02');
-- Database uniqueness remains authoritative even for writers bypassing the RPC.
SELECT binding_expect_error($q$INSERT INTO project_cameras(tenant_id,project_id,vendor,vendor_device_serial,vendor_channel_id,name)
 VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','tencent_iotvideo_industry','rollback-delete','channel','duplicate')$q$, '23505');
