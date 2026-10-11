\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.employees (id uuid PRIMARY KEY, tenant_id uuid, status text, name text, tenant_department_id uuid);
CREATE TABLE public.customers (id uuid PRIMARY KEY, tenant_id uuid, name text, owner_id uuid);
CREATE TABLE public.projects (id uuid PRIMARY KEY, tenant_id uuid, customer_id uuid);
CREATE TABLE public.project_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, employee_id uuid, deleted_at timestamptz);
-- Existing production indexes from 20260423133000_create_project_members_table.sql.
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_members_employee_id ON public.project_members(employee_id) WHERE deleted_at IS NULL;
CREATE TABLE public.project_logs (id uuid PRIMARY KEY, tenant_id uuid, project_id uuid NOT NULL);
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
  key text NOT NULL, group_code text NOT NULL, name text NOT NULL, description text,
  value_type text NOT NULL, value_text text, is_secret boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX system_settings_platform_key ON public.system_settings(key) WHERE tenant_id IS NULL;
-- Exercise explicit revocation even on installations with broad default grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT SELECT ON public.tenants, public.employees, public.customers, public.projects, public.project_logs TO service_role;
\ir ../migrations/20261010140944_project_log_project_comments.sql

\ir ../migrations/20260514170000_create_platform_file_objects.sql
\ir ../migrations/20261011100853_project_log_inline_image_comments.sql
