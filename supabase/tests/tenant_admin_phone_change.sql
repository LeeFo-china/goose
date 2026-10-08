\set ON_ERROR_STOP on
-- Run only on an owned local disposable database. Every fixture and test DDL is
-- rolled back. Individual cases use subtransactions so all defects are reported.
-- docker exec -i gooes-manual-trial-db psql -X -U postgres -d postgres < this-file
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL client_min_messages = warning;
CREATE TEMP TABLE phone_test_results(name text PRIMARY KEY, passed boolean, detail text);
CREATE TEMP TABLE phone_fixture AS SELECT
  gen_random_uuid() AS tenant, gen_random_uuid() AS other_tenant,
  gen_random_uuid() AS actor, gen_random_uuid() AS other_actor,
  gen_random_uuid() AS actor_user, gen_random_uuid() AS other_actor_user,
  gen_random_uuid() AS employee, gen_random_uuid() AS other_employee,
  gen_random_uuid() AS user_id, gen_random_uuid() AS customer,
  gen_random_uuid() AS role, gen_random_uuid() AS other_role,
  gen_random_uuid() AS send_key, gen_random_uuid() AS confirm_key,
  NULL::uuid AS challenge, NULL::uuid AS sms,
  -- Unique synthetic numbers; all are rolled back and no SMS provider is called.
  '199'||lpad(((random()*899999)::int+100000)::text,6,'0') AS prefix;

CREATE FUNCTION pg_temp.check_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION USING MESSAGE=label, ERRCODE='PT001'; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, message text, state text DEFAULT 'P0001')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_message text; actual_state text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_message=MESSAGE_TEXT, actual_state=RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.check_true(actual_state=state AND (message IS NULL OR actual_message=message),
    'expected rejection missing or wrong: '||coalesce(actual_state,'accepted')||' / '||coalesce(message,state));
END $$;
CREATE FUNCTION pg_temp.run(name text, statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean:=false; detail text;
BEGIN
  BEGIN
    EXECUTE statement;
    RAISE EXCEPTION USING ERRCODE='PT002',MESSAGE='case rollback';
  EXCEPTION WHEN SQLSTATE 'PT002' THEN ok:=true;
    WHEN OTHERS THEN
      -- Never print SQL context, OTP, raw phones or identity fixture values.
      detail:=SQLSTATE||CASE WHEN SQLSTATE='PT001' THEN ': '||SQLERRM ELSE ': unexpected database error' END;
  END;
  INSERT INTO phone_test_results VALUES(name,ok,detail);
END $$;
-- Only this session can call fixture wrappers. Overrides distinguish absent keys
-- from JSON null, allowing explicit NULL authorization/version regression cases.
CREATE FUNCTION pg_temp.confirm_change(overrides jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f record; p jsonb;
BEGIN
  SELECT * INTO f FROM phone_fixture;
  p:=jsonb_build_object('actor',f.actor,'actor_user',f.actor_user,'auth_version',1,
    'tenant',f.tenant,'employee',f.employee,'version',1,'phone',f.prefix||'03',
    'challenge',f.challenge,'code','123456','reason','same person regression',
    'confirmed',true,'key',f.confirm_key)||overrides;
  RETURN public.confirm_tenant_admin_phone_change((p->>'actor')::uuid,(p->>'actor_user')::uuid,
    (p->>'auth_version')::int,(p->>'tenant')::uuid,(p->>'employee')::uuid,(p->>'version')::int,
    p->>'phone',(p->>'challenge')::uuid,p->>'code',p->>'reason',(p->>'confirmed')::boolean,(p->>'key')::uuid);
END $$;
CREATE FUNCTION pg_temp.reserve_change(overrides jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f record; p jsonb;
BEGIN
  SELECT * INTO f FROM phone_fixture;
  p:=jsonb_build_object('actor',f.actor,'actor_user',f.actor_user,'auth_version',1,
    'tenant',f.tenant,'employee',f.employee,'version',1,'phone',f.prefix||'03',
    'key',f.send_key,'code','123456')||overrides;
  RETURN public.reserve_tenant_admin_phone_change((p->>'actor')::uuid,(p->>'actor_user')::uuid,
    (p->>'auth_version')::int,(p->>'tenant')::uuid,(p->>'employee')::uuid,(p->>'version')::int,
    p->>'phone',(p->>'key')::uuid,p->>'code',NULL,NULL);
END $$;
CREATE FUNCTION pg_temp.complete_send(success boolean) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.complete_tenant_admin_phone_change_send(actor,actor_user,1,challenge,success) FROM phone_fixture
$$;
CREATE FUNCTION pg_temp.unchanged() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.check_true((SELECT e.phone=f.prefix||'01' AND e.version=1 AND e.admin_auth_version=1
    FROM employees e JOIN phone_fixture f ON e.id=f.employee),'failed command mutated employee');
  PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM platform_audit_logs a JOIN phone_fixture f
    ON a.resource_id=f.employee WHERE a.action='tenant_admin_phone_change'),'failed command wrote audit');
  PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM tenant_admin_login_phone_reservations r JOIN phone_fixture f
    ON r.employee_id=f.employee),'failed command wrote reservation');
END $$;
DO $$
DECLARE f record; ar uuid; c jsonb;
BEGIN
  SELECT * INTO f FROM phone_fixture;
  INSERT INTO auth.users(id) VALUES(f.actor_user),(f.other_actor_user),(f.user_id);
  INSERT INTO tenants(id,name,slug,status) VALUES
    (f.tenant,'phone regression','phone-test-'||f.tenant,'active'),
    (f.other_tenant,'phone regression other','phone-test-'||f.other_tenant,'active');
  INSERT INTO employees(id,tenant_id,name,phone,user_id,status) VALUES
    (f.actor,NULL,'phone test actor',f.prefix||'90',f.actor_user,'active'),
    (f.other_actor,NULL,'phone test second actor',f.prefix||'91',f.other_actor_user,'active'),
    (f.employee,f.tenant,'phone test admin',f.prefix||'01',f.user_id,'active'),
    (f.other_employee,f.tenant,'phone test second admin',f.prefix||'02',NULL,'active');
  SELECT id INTO ar FROM roles WHERE tenant_id IS NULL AND code='platform_admin' AND status='active' LIMIT 1;
  IF ar IS NULL THEN INSERT INTO roles(code,name,status) VALUES('platform_admin','phone test','active') RETURNING id INTO ar; END IF;
  INSERT INTO roles(id,tenant_id,code,name,status) VALUES
    (f.role,f.tenant,'system_admin','phone test admin','active'),
    (f.other_role,f.other_tenant,'system_admin','phone test foreign admin','active');
  INSERT INTO employee_roles(employee_id,role_id) VALUES
    (f.actor,ar),(f.other_actor,ar),(f.employee,f.role),(f.other_employee,f.role),
    (f.employee,f.other_role); -- Another role must not duplicate list rows.
  INSERT INTO customers(id,tenant_id,name,phone,user_id) VALUES(f.customer,f.tenant,'phone test customer',f.prefix||'01',f.user_id);
  INSERT INTO user_oauth_identities(user_id,platform,openid) VALUES(f.user_id,'wechat_mini','phone-test-'||f.user_id);
  INSERT INTO user_business_memberships(user_id,tenant_id,identity_type,identity_id,is_default)
    VALUES(f.user_id,f.tenant,'employee',f.employee,true),(f.user_id,f.tenant,'customer',f.customer,true);
  c:=pg_temp.reserve_change();
  PERFORM pg_temp.check_true(c->>'status'='sending' AND (c->>'should_send')::boolean,'initial reserve');
  UPDATE phone_fixture SET challenge=(c->>'challenge_id')::uuid;
  UPDATE phone_fixture fixture SET sms=c.sms_verification_id FROM tenant_admin_phone_change_challenges c WHERE c.id=fixture.challenge;
END $$;

\o /dev/null
SELECT pg_temp.run('send incomplete cannot confirm', $case$
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('send failed cannot be revived', $case$
  SELECT pg_temp.check_true(pg_temp.complete_send(false)->>'status'='failed','failure not recorded');
  SELECT pg_temp.check_true(pg_temp.complete_send(true)->>'status'='failed','failed send revived');
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('expired send completion stays failed', $case$
  UPDATE tenant_admin_phone_change_challenges SET expires_at=clock_timestamp()-interval '1 second'
    WHERE id=(SELECT challenge FROM phone_fixture);
  SELECT pg_temp.check_true(pg_temp.complete_send(true)->>'status'='failed','expired send revived');
$case$);
SELECT pg_temp.run('send idempotency no duplicate SMS and mismatched request rejected', $case$
  SELECT pg_temp.check_true(pg_temp.reserve_change()->>'should_send'='false','send replay repeated SMS');
  SELECT pg_temp.check_true((SELECT count(*)=1 FROM tenant_admin_phone_change_challenges c JOIN phone_fixture f ON c.employee_id=f.employee),'duplicate challenge');
  SELECT pg_temp.expect_error(format('SELECT pg_temp.reserve_change(%L::jsonb)',jsonb_build_object('phone',prefix||'04')),
    'TENANT_ADMIN_PHONE_IDEMPOTENCY_CONFLICT') FROM phone_fixture;
  SELECT pg_temp.expect_error(format('SELECT pg_temp.reserve_change(%L::jsonb)',jsonb_build_object('key',gen_random_uuid())),
    'SMS_CODE_RATE_LIMITED');
$case$);
-- All subsequent cases start with a ready challenge; each case rolls back.
SELECT pg_temp.complete_send(true) IS NOT NULL AS ready_fixture;
SELECT pg_temp.run('five wrong attempts terminal, persist between statements', $case$
  DO $body$ DECLARE i int; result jsonb; BEGIN
    FOR i IN 1..5 LOOP
      result:=pg_temp.confirm_change('{"code":"000000"}');
      PERFORM pg_temp.check_true(result->>'status'=CASE WHEN i=5 THEN 'code_exhausted' ELSE 'code_invalid' END,'incorrect OTP status');
      PERFORM pg_temp.check_true((SELECT c.failed_attempts=i FROM tenant_admin_phone_change_challenges c JOIN phone_fixture f ON c.id=f.challenge),'OTP counter lost');
    END LOOP;
    PERFORM pg_temp.check_true(pg_temp.confirm_change()->>'status'='code_exhausted','valid OTP bypassed exhaustion');
    PERFORM pg_temp.check_true(pg_temp.confirm_change('{"code":"000000"}')->>'status'='code_exhausted','sixth OTP not terminal');
    PERFORM pg_temp.check_true((SELECT failed_attempts=5 AND status='ready' FROM tenant_admin_phone_change_challenges WHERE id=(SELECT challenge FROM phone_fixture)),'terminal counter changed');
    PERFORM pg_temp.unchanged();
  END $body$;
$case$);
SELECT pg_temp.run('challenge timeout', $case$
  UPDATE tenant_admin_phone_change_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT challenge FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('SMS timeout independent of challenge', $case$
  UPDATE sms_verification_codes SET expired_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT sms FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('cross actor, tenant, employee, phone, challenge and version rejected', $case$
  SELECT pg_temp.expect_error(format('SELECT pg_temp.confirm_change(%L::jsonb)',j),m)
  FROM phone_fixture f CROSS JOIN LATERAL (VALUES
    (jsonb_build_object('actor',f.other_actor,'actor_user',f.other_actor_user),'TENANT_ADMIN_PHONE_CHALLENGE_INVALID'),
    (jsonb_build_object('actor_user',f.other_actor_user),'PLATFORM_SUPER_ADMIN_REQUIRED'),
    (jsonb_build_object('tenant',f.other_tenant),'TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE'),
    (jsonb_build_object('employee',f.other_employee),'TENANT_ADMIN_PHONE_CHALLENGE_INVALID'),
    (jsonb_build_object('phone',f.prefix||'04'),'TENANT_ADMIN_PHONE_CHALLENGE_INVALID'),
    (jsonb_build_object('challenge',gen_random_uuid()),'TENANT_ADMIN_PHONE_CHALLENGE_INVALID'),
    (jsonb_build_object('version',2),'TENANT_ADMIN_PHONE_VERSION_CONFLICT'),
    (jsonb_build_object('auth_version',2),'PLATFORM_SUPER_ADMIN_REQUIRED')
  ) cases(j,m);
  SELECT pg_temp.expect_error(format('SELECT public.complete_tenant_admin_phone_change_send(%L,%L,1,%L,true)',other_actor,other_actor_user,challenge),'TENANT_ADMIN_PHONE_CHALLENGE_INVALID') FROM phone_fixture;
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('invalid confirmation fields rejected', $case$
  SELECT pg_temp.expect_error(format('SELECT pg_temp.confirm_change(%L::jsonb)',j),'TENANT_ADMIN_PHONE_INVALID','22023')
    FROM (VALUES ('{"confirmed":false}'::jsonb),('{"confirmed":null}'),('{"reason":"  "}'),('{"code":"12345"}'),('{"key":null}')) v(j);
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('archived tenant rejected', $case$
  UPDATE tenants SET status='archived' WHERE id=(SELECT tenant FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('suspended tenant remains operable', $case$
  UPDATE tenants SET status='suspended' WHERE id=(SELECT tenant FROM phone_fixture);
  SELECT pg_temp.check_true(pg_temp.confirm_change()->>'status'='changed','suspended tenant blocked');
$case$);
SELECT pg_temp.run('inactive and missing target role rejected', $case$
  UPDATE roles SET status='inactive' WHERE id=(SELECT role FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE');
  DELETE FROM employee_roles WHERE employee_id=(SELECT employee FROM phone_fixture) AND role_id=(SELECT role FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('inactive actor and revoked actor role rejected', $case$
  UPDATE employees SET status='suspended' WHERE id=(SELECT actor FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','PLATFORM_SUPER_ADMIN_REQUIRED');
  UPDATE employees SET status='active' WHERE id=(SELECT actor FROM phone_fixture);
  DELETE FROM employee_roles WHERE employee_id=(SELECT actor FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','PLATFORM_SUPER_ADMIN_REQUIRED');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('all unavailable employee statuses rejected', $case$
  DO $body$ DECLARE s text; BEGIN
    FOREACH s IN ARRAY ARRAY['pending','suspended','leaved',NULL] LOOP
      UPDATE employees SET status=s WHERE id=(SELECT employee FROM phone_fixture);
      PERFORM pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE');
    END LOOP;
  END $body$;
$case$);
SELECT pg_temp.run('atomic success, identity preservation, idempotency, replay', $case$
  CREATE TEMP TABLE identity_before AS
    SELECT 'user' AS kind,to_jsonb(u) AS value FROM auth.users u JOIN phone_fixture f ON f.user_id=u.id
    UNION ALL SELECT 'customer',to_jsonb(c) FROM customers c JOIN phone_fixture f ON f.customer=c.id
    UNION ALL SELECT 'oauth',to_jsonb(o) FROM user_oauth_identities o JOIN phone_fixture f USING(user_id)
    UNION ALL SELECT 'membership',to_jsonb(m) FROM user_business_memberships m JOIN phone_fixture f USING(user_id)
    UNION ALL SELECT 'role',to_jsonb(r) FROM employee_roles r JOIN phone_fixture f ON r.employee_id=f.employee;
  SELECT pg_temp.check_true(pg_temp.confirm_change()->>'status'='changed','confirm did not change');
  SELECT pg_temp.check_true(e.phone=f.prefix||'03' AND e.version=2 AND e.admin_auth_version=2 AND e.user_id=f.user_id,'phone/version/identity inconsistent')
    FROM employees e JOIN phone_fixture f ON e.id=f.employee;
  SELECT pg_temp.check_true(c.status='consumed' AND c.confirmed_at IS NOT NULL AND s.status='verified' AND s.verified_at IS NOT NULL AND r.phone=f.prefix||'03','challenge/SMS/reservation not atomic')
    FROM phone_fixture f JOIN tenant_admin_phone_change_challenges c ON c.id=f.challenge
    JOIN sms_verification_codes s ON s.id=f.sms JOIN tenant_admin_login_phone_reservations r ON r.employee_id=f.employee;
  SELECT pg_temp.check_true((SELECT count(*)=1 FROM platform_audit_logs a JOIN phone_fixture f ON a.resource_id=f.employee
    WHERE a.action='tenant_admin_phone_change' AND a.actor_employee_id=f.actor AND a.actor_user_id=f.actor_user
      AND a.target_tenant_id=f.tenant AND a.idempotency_key=f.confirm_key AND a.metadata->>'old_phone'=f.prefix||'01'
      AND a.metadata->>'new_phone'=f.prefix||'03' AND a.metadata->'result'->>'version'='2'),'audit missing or inconsistent');
  CREATE TEMP TABLE identity_after AS
    SELECT 'user' AS kind,to_jsonb(u) AS value FROM auth.users u JOIN phone_fixture f ON f.user_id=u.id
    UNION ALL SELECT 'customer',to_jsonb(c) FROM customers c JOIN phone_fixture f ON f.customer=c.id
    UNION ALL SELECT 'oauth',to_jsonb(o) FROM user_oauth_identities o JOIN phone_fixture f USING(user_id)
    UNION ALL SELECT 'membership',to_jsonb(m) FROM user_business_memberships m JOIN phone_fixture f USING(user_id)
    UNION ALL SELECT 'role',to_jsonb(r) FROM employee_roles r JOIN phone_fixture f ON r.employee_id=f.employee;
  SELECT pg_temp.check_true(NOT EXISTS((TABLE identity_before EXCEPT ALL TABLE identity_after) UNION ALL (TABLE identity_after EXCEPT ALL TABLE identity_before)),'identity side effects');
  SELECT pg_temp.check_true(pg_temp.confirm_change()->>'idempotent'='true','confirmation replay not idempotent');
  SELECT pg_temp.check_true((SELECT count(*)=1 FROM platform_audit_logs a JOIN phone_fixture f ON a.resource_id=f.employee),'replay duplicated audit');
  SELECT pg_temp.check_true((SELECT version=2 AND admin_auth_version=2 FROM employees WHERE id=(SELECT employee FROM phone_fixture)),'replay incremented version');
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change(''{"reason":"different"}'')','TENANT_ADMIN_PHONE_IDEMPOTENCY_CONFLICT');
  SELECT pg_temp.expect_error(format('SELECT pg_temp.confirm_change(%L::jsonb)',jsonb_build_object('version',2,'key',gen_random_uuid())),'TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
$case$);
-- Trigger exists only in this subtransaction, targets only our UUID, and is
-- discarded even if the assertion fails. No persistent schema modifications.
CREATE FUNCTION pg_temp.fail_phone_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resource_id=(SELECT employee FROM phone_fixture) AND NEW.action='tenant_admin_phone_change' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PHONE_TEST_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END $$;
SELECT pg_temp.run('forced audit insert failure rolls back every write', $case$
  CREATE TRIGGER phone_test_audit_failure BEFORE INSERT ON public.platform_audit_logs
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_phone_test_audit();
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','PHONE_TEST_AUDIT_FAILURE','23514');
  SELECT pg_temp.unchanged();
  SELECT pg_temp.check_true(c.status='ready' AND c.confirmed_at IS NULL AND c.failed_attempts=0
    AND s.status='pending' AND s.verified_at IS NULL,'audit failure consumed challenge/SMS')
    FROM phone_fixture f JOIN tenant_admin_phone_change_challenges c ON c.id=f.challenge JOIN sms_verification_codes s ON s.id=f.sms;
$case$);
SELECT pg_temp.run('bounded pagination two admins without duplicates', $case$
  SELECT pg_temp.check_true(jsonb_array_length(a->'list')=1 AND jsonb_array_length(b->'list')=1
    AND a->'list'->0->>'id'<>b->'list'->0->>'id' AND a->'pagination'->>'total'='2'
    AND b->'pagination'->>'totalPages'='2','pagination duplicate or unbounded')
    FROM phone_fixture f CROSS JOIN LATERAL (SELECT list_tenant_admin_phone_targets(f.tenant,1,1) a,list_tenant_admin_phone_targets(f.tenant,2,1) b) q;
  SELECT pg_temp.check_true(jsonb_array_length(list_tenant_admin_phone_targets(tenant,3,1)->'list')=0,'page past end nonempty') FROM phone_fixture;
  SELECT pg_temp.check_true(list_tenant_admin_phone_targets(tenant)->'pagination'->>'pageSize'='20','default page size') FROM phone_fixture;
  SELECT pg_temp.expect_error(format('SELECT list_tenant_admin_phone_targets(%L,%s,%s)',tenant,p,s),'INVALID_PAGINATION','22023')
    FROM phone_fixture CROSS JOIN (VALUES ('0','20'),('1','0'),('1','101'),('NULL','20'),('1','NULL')) v(p,s);
$case$);
SELECT pg_temp.run('login timestamp does not version; tenant phone does', $case$
  UPDATE employees SET last_login_time=clock_timestamp() WHERE id=(SELECT employee FROM phone_fixture);
  SELECT pg_temp.check_true((SELECT version=1 AND admin_auth_version=1 FROM employees WHERE id=(SELECT employee FROM phone_fixture)),'login timestamp invalidated challenge');
  SELECT pg_temp.check_true(pg_temp.confirm_change()->>'version'='2','phone version did not advance');
$case$);

SELECT pg_temp.run('new phone belonging only to customer is allowed', $case$
  UPDATE customers SET phone=(SELECT prefix||'03' FROM phone_fixture) WHERE id=(SELECT customer FROM phone_fixture);
  SELECT pg_temp.check_true(pg_temp.confirm_change()->>'status'='changed','customer-only phone rejected');
  SELECT pg_temp.check_true(c.phone=f.prefix||'03' AND c.user_id=f.user_id,'customer-only identity changed') FROM customers c JOIN phone_fixture f ON c.id=f.customer;
$case$);
SELECT pg_temp.run('SMS wrong scene phone or consumed status rejected', $case$
  UPDATE sms_verification_codes SET scene='admin_login' WHERE id=(SELECT sms FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  UPDATE sms_verification_codes SET scene='tenant_admin_phone_change',phone=(SELECT prefix||'04' FROM phone_fixture) WHERE id=(SELECT sms FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  UPDATE sms_verification_codes SET phone=(SELECT prefix||'03' FROM phone_fixture),status='verified' WHERE id=(SELECT sms FROM phone_fixture);
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('resend supersedes old challenge and late completion', $case$
  UPDATE tenant_admin_phone_change_challenges SET created_at=clock_timestamp()-interval '61 seconds' WHERE id=(SELECT challenge FROM phone_fixture);
  SELECT pg_temp.reserve_change(jsonb_build_object('key',gen_random_uuid(),'phone',prefix||'04')) FROM phone_fixture;
  SELECT public.complete_tenant_admin_phone_change_send(f.actor,f.actor_user,1,c.id,true)
    FROM phone_fixture f JOIN tenant_admin_phone_change_challenges c ON c.employee_id=f.employee AND c.id<>f.challenge;
  SELECT pg_temp.check_true(pg_temp.complete_send(true)->>'status'='superseded','late completion revived superseded challenge');
  SELECT pg_temp.expect_error('SELECT pg_temp.confirm_change()','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
  SELECT pg_temp.unchanged();
$case$);
SELECT pg_temp.run('nullable employee status returns boolean can_change', $case$
  UPDATE employees SET status=NULL WHERE id=(SELECT employee FROM phone_fixture);
  SELECT pg_temp.check_true(item->'can_change'='false'::jsonb,'nullable status exposes null can_change')
    FROM phone_fixture f CROSS JOIN LATERAL jsonb_array_elements(list_tenant_admin_phone_targets(f.tenant,1,20)->'list') item
    WHERE item->>'id'=f.employee::text;
$case$);
SELECT pg_temp.run('reservation stays synchronized under ordinary owner edit', $case$
  SELECT pg_temp.confirm_change();
  UPDATE employees SET phone=(SELECT prefix||'04' FROM phone_fixture) WHERE id=(SELECT employee FROM phone_fixture);
  SELECT pg_temp.check_true(e.version=3 AND e.admin_auth_version=3 AND e.phone=r.phone AND r.phone=f.prefix||'04','ordinary edit bypassed reservation/version')
    FROM phone_fixture f JOIN employees e ON e.id=f.employee JOIN tenant_admin_login_phone_reservations r ON r.employee_id=e.id;
  SELECT pg_temp.expect_error(format('INSERT INTO employees(id,name,phone,status) VALUES(%L,''phone fixture'',%L,''pending'')',gen_random_uuid(),prefix||'04'),'TENANT_ADMIN_PHONE_CONFLICT') FROM phone_fixture;
  SELECT pg_temp.expect_error(format('UPDATE employees SET phone=NULL WHERE id=%L',employee),'TENANT_ADMIN_PHONE_CONFLICT') FROM phone_fixture;
$case$);
SELECT pg_temp.run('private table ACL denies direct default grants', $case$
  SELECT pg_temp.check_true(NOT has_table_privilege(r,t,p),'unsafe direct table ACL')
    FROM (VALUES ('anon'),('authenticated')) roles(r)
    CROSS JOIN (VALUES ('public.tenant_admin_phone_change_challenges'),('public.tenant_admin_login_phone_reservations')) tables(t)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) privileges(p);
$case$);

-- Inspect effective privileges (including inherited and direct default ACL
-- grants), not just absence of PUBLIC. Test real SET ROLE calls as well.
SELECT pg_temp.run('RPC ACL effective grants including direct default grants', $case$
  SELECT pg_temp.check_true(count(*)=4,'RPC count/signature drift')
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('reserve_tenant_admin_phone_change','complete_tenant_admin_phone_change_send','confirm_tenant_admin_phone_change','list_tenant_admin_phone_targets');
  SELECT pg_temp.check_true(NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND has_function_privilege('service_role',p.oid,'EXECUTE'),'unsafe RPC ACL: '||p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('reserve_tenant_admin_phone_change','complete_tenant_admin_phone_change_send','confirm_tenant_admin_phone_change','list_tenant_admin_phone_targets');
  SELECT pg_temp.check_true(NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'),'unsafe helper ACL: '||p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('assert_tenant_admin_phone_actor','lock_tenant_admin_phone_target','assert_tenant_admin_phone_available',
      'guard_tenant_admin_login_phone','sync_tenant_admin_login_phone','version_tenant_employee_login_changes');
$case$);
-- The Bun companion also checks effective ACL under actual SET ROLE and executes
-- service_role RPCs. Permission-denied RPC calls crash this local PostgreSQL
-- build (signal 11), even outside PL/pgSQL; do not repeat those on a shared DB.
\o
SELECT name,passed,detail FROM phone_test_results ORDER BY name;
SELECT count(*) AS cases, count(*) FILTER(WHERE NOT passed) AS failures FROM phone_test_results;
SELECT EXISTS(SELECT 1 FROM phone_test_results WHERE NOT passed) AS failed \gset
ROLLBACK;
\if :failed
  DO $$ BEGIN RAISE EXCEPTION 'PHONE_REGRESSION_FAILED (see case summary)'; END $$;
\endif
