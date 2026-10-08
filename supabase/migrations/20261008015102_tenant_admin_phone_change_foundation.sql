-- Forward rollback: disable phone-change endpoints, retain phone ownership,
-- audit and credential versions. Never restore old numbers or lower versions.
BEGIN;
ALTER TABLE public.sms_verification_codes DROP CONSTRAINT sms_verification_codes_scene_check;
ALTER TABLE public.sms_verification_codes ADD CONSTRAINT sms_verification_codes_scene_check CHECK (
  scene IN ('bind_customer','bind_employee','admin_login','rebind_wechat',
    'bind_platform_partner','unbind_platform_partner','rebind_platform_partner',
    'partner_application','partner_tenant_onboarding','tenant_onboarding_application',
    'login_identity','douyin_lead','tenant_admin_phone_change')
);
CREATE TABLE public.tenant_admin_phone_change_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_employee_id uuid NOT NULL REFERENCES public.employees(id),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  expected_version integer NOT NULL CHECK (expected_version>0),
  old_phone text,
  new_phone text NOT NULL CHECK (new_phone ~ '^1[3-9][0-9]{9}$'),
  sms_verification_id uuid NOT NULL UNIQUE REFERENCES public.sms_verification_codes(id),
  status text NOT NULL CHECK (status IN ('sending','ready','failed','superseded','consumed')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmed_at timestamptz,
  send_idempotency_key uuid NOT NULL,
  UNIQUE(actor_user_id,send_idempotency_key)
);
CREATE INDEX tenant_admin_phone_challenges_employee_created_idx
  ON public.tenant_admin_phone_change_challenges(employee_id,created_at DESC);
CREATE INDEX tenant_admin_phone_challenges_expiry_idx
  ON public.tenant_admin_phone_change_challenges(expires_at) WHERE status IN ('sending','ready');
CREATE TABLE public.tenant_admin_login_phone_reservations (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  phone text NOT NULL UNIQUE CHECK (phone ~ '^1[3-9][0-9]{9}$')
);
ALTER TABLE public.tenant_admin_phone_change_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_admin_login_phone_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_admin_phone_change_challenges,public.tenant_admin_login_phone_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_admin_phone_change_challenges,public.tenant_admin_login_phone_reservations TO service_role;
CREATE INDEX IF NOT EXISTS employees_normalized_phone_idx ON public.employees(btrim(phone)) WHERE phone IS NOT NULL;

CREATE FUNCTION public.guard_tenant_admin_login_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_phones text[] := '{}';
BEGIN
  IF TG_OP<>'INSERT' THEN v_phones:=array_append(v_phones,OLD.phone); END IF;
  IF TG_OP<>'DELETE' THEN v_phones:=array_append(v_phones,NEW.phone); END IF;
  PERFORM public.lock_tenant_onboarding_employee_phones(v_phones);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_admin_login_phone_reservations r
      WHERE r.phone=btrim(NEW.phone) AND r.employee_id<>NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CONFLICT';
  END IF;
  IF TG_OP='UPDATE' AND EXISTS (
    SELECT 1 FROM public.tenant_admin_login_phone_reservations WHERE employee_id=OLD.id
  ) THEN
    IF NEW.phone IS NULL OR NEW.phone !~ '^1[3-9][0-9]{9}$' OR EXISTS (
      SELECT 1 FROM public.employees e WHERE btrim(e.phone)=NEW.phone AND e.id<>NEW.id
    ) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CONFLICT'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_00_guard_tenant_admin_login_phone
BEFORE INSERT OR UPDATE OF phone,status OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_admin_login_phone();

CREATE FUNCTION public.sync_tenant_admin_login_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.tenant_admin_login_phone_reservations SET phone=NEW.phone
  WHERE employee_id=NEW.id AND phone IS DISTINCT FROM NEW.phone;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_sync_tenant_admin_login_phone AFTER UPDATE OF phone ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_admin_login_phone();

CREATE FUNCTION public.version_tenant_employee_login_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.tenant_id IS NULL AND NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  IF ROW(NEW.phone,NEW.user_id,NEW.tenant_id,NEW.status,NEW.name,NEW.post_id,NEW.tenant_department_id)
    IS DISTINCT FROM ROW(OLD.phone,OLD.user_id,OLD.tenant_id,OLD.status,OLD.name,OLD.post_id,OLD.tenant_department_id) THEN
    NEW.version:=greatest(NEW.version,OLD.version+1);
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.admin_auth_version:=greatest(NEW.admin_auth_version,OLD.admin_auth_version+1);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_version_tenant_employee_login_changes BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.version_tenant_employee_login_changes();

CREATE FUNCTION public.assert_tenant_admin_phone_actor(p_employee_id uuid,p_user_id uuid,p_auth_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM e.id FROM public.employees e
  JOIN public.employee_roles er ON er.employee_id=e.id
  JOIN public.roles r ON r.id=er.role_id
  WHERE e.id=p_employee_id AND e.user_id=p_user_id AND e.tenant_id IS NULL AND e.status='active'
    AND e.admin_auth_version=p_auth_version AND r.tenant_id IS NULL AND r.code='platform_admin' AND r.status='active'
  FOR SHARE OF e,er,r;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='PLATFORM_SUPER_ADMIN_REQUIRED'; END IF;
END $$;
CREATE FUNCTION public.lock_tenant_admin_phone_target(p_tenant_id uuid,p_employee_id uuid,p_version integer)
RETURNS public.employees LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_employee public.employees;
BEGIN
  SELECT * INTO v_employee FROM public.employees WHERE id=p_employee_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_employee.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE';
  END IF;
  IF v_employee.version<>p_version THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_VERSION_CONFLICT';
  END IF;
  PERFORM t.id FROM public.tenants t WHERE t.id=p_tenant_id AND t.status<>'archived' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE'; END IF;
  PERFORM er.id FROM public.employee_roles er JOIN public.roles r ON r.id=er.role_id
    WHERE er.employee_id=p_employee_id AND r.tenant_id=p_tenant_id AND r.status='active' AND r.code='system_admin'
    FOR SHARE OF er,r;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE'; END IF;
  RETURN v_employee;
END $$;
CREATE FUNCTION public.assert_tenant_admin_phone_available(p_employee_id uuid,p_old_phone text,p_new_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_new_phone IS NULL OR p_new_phone !~ '^1[3-9][0-9]{9}$' OR p_new_phone IS NOT DISTINCT FROM p_old_phone THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_INVALID';
  END IF;
  PERFORM public.lock_tenant_onboarding_employee_phones(ARRAY[p_old_phone,p_new_phone]);
  IF EXISTS (SELECT 1 FROM public.employees WHERE btrim(phone)=p_new_phone AND id<>p_employee_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TENANT_ADMIN_PHONE_CONFLICT';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_tenant_admin_login_phone(),public.sync_tenant_admin_login_phone(),public.version_tenant_employee_login_changes(),
  public.assert_tenant_admin_phone_actor(uuid,uuid,integer),public.lock_tenant_admin_phone_target(uuid,uuid,integer),
  public.assert_tenant_admin_phone_available(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
