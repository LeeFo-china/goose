-- Superadmin-authorized same-person phone correction requires no SMS proof.
-- Keep historical SMS/audit records and prior RPCs for rolling deployment.
-- Rollback: close the entry point; never restore old phones or lower versions.
BEGIN;
CREATE FUNCTION public.change_tenant_admin_login_phone(
  p_actor_employee_id uuid,p_actor_user_id uuid,p_actor_auth_version integer,
  p_tenant_id uuid,p_employee_id uuid,p_expected_version integer,p_new_phone text,
  p_reason text,p_same_person_confirmed boolean,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
DECLARE
  v_employee public.employees;
  v_old_phone text;
  v_request jsonb;
  v_audit jsonb;
  v_result jsonb;
  v_now timestamptz;
BEGIN
  PERFORM public.assert_tenant_admin_phone_actor(p_actor_employee_id,p_actor_user_id,p_actor_auth_version);
  IF p_same_person_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TENANT_ADMIN_PHONE_INVALID';
  END IF;
  v_request:=jsonb_build_object('tenant_id',p_tenant_id,'employee_id',p_employee_id,'expected_version',p_expected_version,
    'new_phone',p_new_phone,'reason',btrim(p_reason),'same_person_confirmed',true,'authorization_method','platform_superadmin');
  -- Use the same idempotency lock namespace as historical SMS confirmations.
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
  PERFORM public.assert_tenant_admin_phone_available(p_employee_id,v_employee.phone,p_new_phone);
  v_old_phone:=v_employee.phone;
  v_now:=clock_timestamp();
  UPDATE public.employees SET phone=p_new_phone WHERE id=p_employee_id RETURNING * INTO v_employee;
  INSERT INTO public.tenant_admin_login_phone_reservations(employee_id,phone) VALUES(p_employee_id,p_new_phone)
    ON CONFLICT(employee_id) DO UPDATE SET phone=EXCLUDED.phone;
  v_result:=jsonb_build_object('status','changed','employee_id',p_employee_id,'phone_masked',left(p_new_phone,3)||'****'||right(p_new_phone,4),
    'version',v_employee.version,'changed_at',v_now,'idempotent',false);
  INSERT INTO public.platform_audit_logs(action,actor_employee_id,actor_user_id,target_tenant_id,resource_type,resource_id,
    resource_label,status,summary,metadata,idempotency_key)
  VALUES('tenant_admin_phone_change',p_actor_employee_id,p_actor_user_id,p_tenant_id,'employee',p_employee_id,
    v_employee.name,'success','超管直接变更租户管理员登录手机号',jsonb_build_object('request',v_request,'result',v_result,
      'old_phone',v_old_phone,'new_phone',p_new_phone,'reason',btrim(p_reason),'authorization_method','platform_superadmin'),p_idempotency_key);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.change_tenant_admin_login_phone(uuid,uuid,integer,uuid,uuid,integer,text,text,boolean,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.change_tenant_admin_login_phone(uuid,uuid,integer,uuid,uuid,integer,text,text,boolean,uuid) TO service_role;
COMMIT;
