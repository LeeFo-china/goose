CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.tenants(id uuid PRIMARY KEY, slug text);
CREATE TABLE public.employees(id uuid PRIMARY KEY);
CREATE TABLE public.projects(id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants, status text);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
INSERT INTO public.tenants VALUES ('00000000-0000-4000-8000-000000000001','gooes_default'), ('00000000-0000-4000-8000-000000000002','other');
INSERT INTO public.projects VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','constructing'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','constructing'),
 ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000002','constructing');
CREATE FUNCTION public.binding_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
CREATE FUNCTION public.binding_expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected %, got %: %', expected, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'Expected % but succeeded: %', expected, statement;
END $$;
-- Test helpers use the production RPC; constants are fixtures, never remote IDs.
CREATE FUNCTION public.test_bind(serial text, project_suffix text DEFAULT '101', payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.bind_project_camera('00000000-0000-4000-8000-000000000001',
 ('00000000-0000-4000-8000-000000000' || project_suffix)::uuid,
 jsonb_build_object('vendor','tencent_iotvideo_industry','vendor_device_serial',serial,
 'vendor_channel_id','channel','name','Camera','channel_no',1) || payload, NULL);
$$;
