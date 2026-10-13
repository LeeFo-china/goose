-- Disposable local PostgreSQL only; transaction is rolled back by the runner.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.projects (
  id uuid PRIMARY KEY, tenant_id uuid, name text, status text, address text,
  customer_id uuid, property_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customers (id uuid PRIMARY KEY, tenant_id uuid, name text, phone text);
CREATE TABLE public.properties (
  id uuid PRIMARY KEY, tenant_id uuid, community text, building_info text, layout text, area numeric
);
CREATE TABLE public.project_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, project_id uuid,
  sort_order integer DEFAULT 0, created_at timestamptz DEFAULT now(),
  deleted_at timestamptz, status text, can_view boolean, vendor text
);
-- Representative existing indexes from earlier migrations.
CREATE INDEX ON public.projects(tenant_id, id);
CREATE INDEX ON public.projects(tenant_id, updated_at DESC, id DESC);
CREATE INDEX ON public.projects(tenant_id, status);
CREATE INDEX ON public.customers(tenant_id, id);
CREATE INDEX ON public.properties(tenant_id, id);
CREATE INDEX ON public.project_cameras(tenant_id, project_id) WHERE deleted_at IS NULL;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO public.customers VALUES
  ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','客户张','13812345678'),
  ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','外租户客户','13912345678');
INSERT INTO public.properties VALUES
  ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','小区甲','三栋','三室',99);
INSERT INTO public.projects(id,tenant_id,name,status,address,customer_id,property_id) VALUES
  ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','项目甲','constructing','地址甲','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030'),
  ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','零设备','designing',NULL,NULL,NULL),
  ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','已删除设备','designing',NULL,NULL,NULL),
  ('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000002','外租户项目','constructing',NULL,'00000000-0000-4000-8000-000000000020',NULL),
  ('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000001','Literal%_keyword','designing',NULL,'00000000-0000-4000-8000-000000000020',NULL);
INSERT INTO public.project_cameras(tenant_id, project_id, status, can_view, vendor, deleted_at) VALUES
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','online',true,'ezviz',NULL),
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','offline',false,'tencent_iotvideo_industry',NULL),
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','unknown',true,'tencent_iotvideo_industry',NULL),
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103','online',true,'ezviz',now()),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000101','online',true,'ezviz',NULL),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000104','online',true,'ezviz',NULL);
