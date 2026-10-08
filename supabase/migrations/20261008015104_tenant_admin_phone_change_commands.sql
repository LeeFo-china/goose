-- Atomic phone changes. Roll back operationally by disabling the new routes;
-- preserve changed phones, credential versions and audit records.
BEGIN;
CREATE FUNCTION public.reserve_tenant_admin_phone_change(
  p_actor_employee_id uuid,p_actor_user_id uuid,p_actor_auth_version integer,
  p_tenant_id uuid,p_employee_id uuid,p_expected_version integer,p_new_phone text,
  p_idempotency_key uuid,p_code text,p_request_ip text,p_request_device text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
DECLARE v_employee public.employees; v_challenge public.tenant_admin_phone_change_challenges;
  v_sms record; v_now timestamptz:=clock_timestamp();
BEGIN
  PERFORM public.assert_tenant_admin_phone_actor(p_actor_employee_id,p_actor_user_id,p_actor_auth_version);
  IF p_idempotency_key IS NULL OR p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TENANT_ADMIN_PHONE_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant-admin-phone-send:'||p_actor_user_id||':'||p_idempotency_key,0));
  SELECT * INTO v_challenge FROM public.tenant_admin_phone_change_challenges
    WHERE actor_user_id=p_actor_user_id AND send_idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF ROW(v_challenge.tenant_id,v_challenge.employee_id,v_challenge.expected_version,v_challenge.new_phone)
      IS DISTINCT FROM ROW(p_tenant_id,p_employee_id,p_expected_version,p_new_phone) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status',v_challenge.status,'challenge_id',v_challenge.id,
      'expires_at',v_challenge.expires_at,'should_send',false,'cooldown_seconds',60);
  END IF;
  v_employee:=public.lock_tenant_admin_phone_target(p_tenant_id,p_employee_id,p_expected_version);
  PERFORM public.assert_tenant_admin_phone_available(p_employee_id,v_employee.phone,p_new_phone);
  v_now:=clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.tenant_admin_phone_change_challenges
      WHERE employee_id=p_employee_id AND created_at>=v_now-interval '60 seconds') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SMS_CODE_RATE_LIMITED';
  END IF;
  SELECT * INTO v_sms FROM public.reserve_sms_verification_code(p_new_phone,'tenant_admin_phone_change',p_code,
    v_now+interval '5 minutes',v_now-interval '60 seconds',p_request_ip,p_request_device,1);
  IF NOT v_sms.reserved THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SMS_CODE_RATE_LIMITED'; END IF;
  INSERT INTO public.tenant_admin_phone_change_challenges(actor_employee_id,actor_user_id,tenant_id,employee_id,
    expected_version,old_phone,new_phone,sms_verification_id,status,expires_at,send_idempotency_key)
  VALUES(p_actor_employee_id,p_actor_user_id,p_tenant_id,p_employee_id,p_expected_version,v_employee.phone,
    p_new_phone,v_sms.reservation_id,'sending',v_now+interval '5 minutes',p_idempotency_key)
  RETURNING * INTO v_challenge;
  RETURN jsonb_build_object('status','sending','challenge_id',v_challenge.id,
    'expires_at',v_challenge.expires_at,'should_send',true,'cooldown_seconds',60);
END $$;

CREATE FUNCTION public.complete_tenant_admin_phone_change_send(
  p_actor_employee_id uuid,p_actor_user_id uuid,p_actor_auth_version integer,p_challenge_id uuid,p_success boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
DECLARE v_challenge public.tenant_admin_phone_change_challenges;
BEGIN
  PERFORM public.assert_tenant_admin_phone_actor(p_actor_employee_id,p_actor_user_id,p_actor_auth_version);
  SELECT * INTO v_challenge FROM public.tenant_admin_phone_change_challenges
    WHERE id=p_challenge_id AND actor_user_id=p_actor_user_id AND actor_employee_id=p_actor_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CHALLENGE_INVALID'; END IF;
  PERFORM id FROM public.employees WHERE id=v_challenge.employee_id FOR UPDATE;
  SELECT * INTO v_challenge FROM public.tenant_admin_phone_change_challenges WHERE id=p_challenge_id FOR UPDATE;
  IF v_challenge.status='sending' THEN
    IF NOT coalesce(p_success,false) OR v_challenge.expires_at<=clock_timestamp() THEN
      UPDATE public.tenant_admin_phone_change_challenges SET status='failed' WHERE id=p_challenge_id RETURNING * INTO v_challenge;
    ELSIF EXISTS (SELECT 1 FROM public.tenant_admin_phone_change_challenges WHERE employee_id=v_challenge.employee_id
      AND created_at>v_challenge.created_at AND status IN ('sending','ready','consumed')) THEN
      UPDATE public.tenant_admin_phone_change_challenges SET status='superseded' WHERE id=p_challenge_id RETURNING * INTO v_challenge;
    ELSE
      UPDATE public.tenant_admin_phone_change_challenges SET status='superseded'
        WHERE employee_id=v_challenge.employee_id AND id<>p_challenge_id AND status IN ('sending','ready');
      UPDATE public.tenant_admin_phone_change_challenges SET status='ready' WHERE id=p_challenge_id RETURNING * INTO v_challenge;
    END IF;
  END IF;
  RETURN jsonb_build_object('status',v_challenge.status,'challenge_id',v_challenge.id,
    'expires_at',v_challenge.expires_at,'should_send',false,'cooldown_seconds',60);
END $$;

CREATE FUNCTION public.confirm_tenant_admin_phone_change(
  p_actor_employee_id uuid,p_actor_user_id uuid,p_actor_auth_version integer,
  p_tenant_id uuid,p_employee_id uuid,p_expected_version integer,p_new_phone text,
  p_challenge_id uuid,p_code text,p_reason text,p_same_person_confirmed boolean,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
DECLARE v_challenge public.tenant_admin_phone_change_challenges; v_employee public.employees;
  v_sms public.sms_verification_codes; v_request jsonb; v_audit jsonb; v_result jsonb; v_now timestamptz:=clock_timestamp();
BEGIN
  PERFORM public.assert_tenant_admin_phone_actor(p_actor_employee_id,p_actor_user_id,p_actor_auth_version);
  IF p_same_person_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR p_idempotency_key IS NULL OR p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TENANT_ADMIN_PHONE_INVALID';
  END IF;
  v_request:=jsonb_build_object('tenant_id',p_tenant_id,'employee_id',p_employee_id,'expected_version',p_expected_version,
    'new_phone',p_new_phone,'challenge_id',p_challenge_id,'reason',btrim(p_reason),'same_person_confirmed',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant-admin-phone-confirm:'||p_actor_user_id||':'||p_idempotency_key,0));
  SELECT metadata INTO v_audit FROM public.platform_audit_logs WHERE actor_user_id=p_actor_user_id
    AND action='tenant_admin_phone_change' AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_audit->'request' IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN (v_audit->'result')||jsonb_build_object('idempotent',true);
  END IF;
  v_employee:=public.lock_tenant_admin_phone_target(p_tenant_id,p_employee_id,p_expected_version);
  SELECT * INTO v_challenge FROM public.tenant_admin_phone_change_challenges WHERE id=p_challenge_id FOR UPDATE;
  IF NOT FOUND OR v_challenge.actor_employee_id<>p_actor_employee_id OR v_challenge.actor_user_id<>p_actor_user_id
    OR v_challenge.tenant_id IS DISTINCT FROM p_tenant_id OR v_challenge.employee_id IS DISTINCT FROM p_employee_id
    OR v_challenge.new_phone IS DISTINCT FROM p_new_phone OR v_challenge.expected_version IS DISTINCT FROM p_expected_version
    OR v_challenge.old_phone IS DISTINCT FROM v_employee.phone OR v_challenge.status<>'ready'
    OR v_challenge.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CHALLENGE_INVALID';
  END IF;
  IF v_challenge.failed_attempts>=5 THEN RETURN jsonb_build_object('status','code_exhausted'); END IF;
  SELECT * INTO v_sms FROM public.sms_verification_codes WHERE id=v_challenge.sms_verification_id FOR UPDATE;
  IF NOT FOUND OR v_sms.phone<>p_new_phone OR v_sms.scene<>'tenant_admin_phone_change'
    OR v_sms.status<>'pending' OR v_sms.expired_at<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CHALLENGE_INVALID';
  END IF;
  IF v_sms.code<>p_code THEN
    UPDATE public.tenant_admin_phone_change_challenges SET failed_attempts=failed_attempts+1 WHERE id=p_challenge_id
      RETURNING * INTO v_challenge;
    RETURN jsonb_build_object('status',CASE WHEN v_challenge.failed_attempts>=5 THEN 'code_exhausted' ELSE 'code_invalid' END);
  END IF;
  PERFORM public.assert_tenant_admin_phone_available(p_employee_id,v_employee.phone,p_new_phone);
  -- Row/role/SMS/advisory locks can wait while the challenge expires. Recheck
  -- both deadlines after acquiring the final competing phone lock, before writes.
  v_now:=clock_timestamp();
  IF v_challenge.expires_at<=v_now OR v_sms.expired_at<=v_now THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CHALLENGE_INVALID';
  END IF;
  UPDATE public.employees SET phone=p_new_phone WHERE id=p_employee_id RETURNING * INTO v_employee;
  INSERT INTO public.tenant_admin_login_phone_reservations(employee_id,phone) VALUES(p_employee_id,p_new_phone)
    ON CONFLICT(employee_id) DO UPDATE SET phone=EXCLUDED.phone;
  UPDATE public.sms_verification_codes SET status='verified',verified_at=v_now WHERE id=v_sms.id;
  UPDATE public.tenant_admin_phone_change_challenges SET status='consumed',confirmed_at=v_now WHERE id=p_challenge_id;
  v_result:=jsonb_build_object('status','changed','employee_id',p_employee_id,'phone_masked',left(p_new_phone,3)||'****'||right(p_new_phone,4),
    'version',v_employee.version,'changed_at',v_now,'idempotent',false);
  INSERT INTO public.platform_audit_logs(action,actor_employee_id,actor_user_id,target_tenant_id,resource_type,resource_id,
    resource_label,status,summary,metadata,idempotency_key)
  VALUES('tenant_admin_phone_change',p_actor_employee_id,p_actor_user_id,p_tenant_id,'employee',p_employee_id,
    v_employee.name,'success','变更租户管理员登录手机号',jsonb_build_object('request',v_request,'result',v_result,
      'old_phone',v_challenge.old_phone,'new_phone',p_new_phone,'reason',btrim(p_reason)),p_idempotency_key);
  RETURN v_result;
END $$;

CREATE FUNCTION public.list_tenant_admin_phone_targets(p_tenant_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_total bigint; v_list jsonb; v_status text;
BEGIN
  IF p_page IS NULL OR p_page<1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PAGINATION';
  END IF;
  SELECT status INTO v_status FROM public.tenants WHERE id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_NOT_FOUND'; END IF;
  SELECT count(*) INTO v_total FROM public.employees e WHERE e.tenant_id=p_tenant_id AND EXISTS (
    SELECT 1 FROM public.employee_roles er JOIN public.roles r ON r.id=er.role_id
    WHERE er.employee_id=e.id AND r.tenant_id=p_tenant_id AND r.code='system_admin' AND r.status='active');
  SELECT coalesce(jsonb_agg(row_data ORDER BY created_at,id),'[]'::jsonb) INTO v_list FROM (
    SELECT e.created_at,e.id,jsonb_build_object('id',e.id,'name',e.name,'phone_masked',
      CASE WHEN e.phone IS NULL THEN NULL ELSE left(e.phone,3)||'****'||right(e.phone,4) END,
      'status',e.status,'version',e.version,'has_login_binding',e.user_id IS NOT NULL,
      'can_change',coalesce(e.status='active' AND v_status<>'archived',false),'disabled_reason',
      CASE WHEN v_status='archived' THEN '租户已归档' WHEN e.status IS DISTINCT FROM 'active' THEN '管理员当前状态不可操作' ELSE NULL END) AS row_data
    FROM public.employees e WHERE e.tenant_id=p_tenant_id AND EXISTS (
      SELECT 1 FROM public.employee_roles er JOIN public.roles r ON r.id=er.role_id
      WHERE er.employee_id=e.id AND r.tenant_id=p_tenant_id AND r.code='system_admin' AND r.status='active')
    ORDER BY e.created_at,e.id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
  ) items;
  RETURN jsonb_build_object('list',v_list,'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,
    'total',v_total,'totalPages',ceil(v_total::numeric/p_page_size)));
END $$;
REVOKE ALL ON FUNCTION public.reserve_tenant_admin_phone_change(uuid,uuid,integer,uuid,uuid,integer,text,uuid,text,text,text),
  public.complete_tenant_admin_phone_change_send(uuid,uuid,integer,uuid,boolean),
  public.confirm_tenant_admin_phone_change(uuid,uuid,integer,uuid,uuid,integer,text,uuid,text,text,boolean,uuid),
  public.list_tenant_admin_phone_targets(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tenant_admin_phone_change(uuid,uuid,integer,uuid,uuid,integer,text,uuid,text,text,text),
  public.complete_tenant_admin_phone_change_send(uuid,uuid,integer,uuid,boolean),
  public.confirm_tenant_admin_phone_change(uuid,uuid,integer,uuid,uuid,integer,text,uuid,text,text,boolean,uuid),
  public.list_tenant_admin_phone_targets(uuid,integer,integer) TO service_role;
COMMIT;
