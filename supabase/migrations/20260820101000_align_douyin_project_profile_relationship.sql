-- Forward rollback procedure:
-- 1. First confirm that no dependent objects or new clients rely on the
--    tenant-first relationship being exposed as one-to-one.
-- 2. In a new forward migration, restore the profile constraint as
--    FOREIGN KEY (project_id, tenant_id)
--    REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE.
-- 3. Then ALTER TABLE public.projects
--    DROP CONSTRAINT projects_tenant_id_id_key and recreate the replaced index:
--    CREATE INDEX projects_tenant_id_id_idx ON public.projects(tenant_id, id);
--    COMMENT ON INDEX public.projects_tenant_id_id_idx IS
--    'Speeds employee project detail bootstrap lookup by tenant and project id.';
-- The forward rollback procedure does not modify or delete table data.

BEGIN;

DROP INDEX public.projects_tenant_id_id_idx;

ALTER TABLE public.projects
ADD CONSTRAINT projects_tenant_id_id_key
UNIQUE (tenant_id, id);

ALTER TABLE public.douyin_project_public_profiles
DROP CONSTRAINT douyin_project_public_profiles_project_tenant_fkey;

ALTER TABLE public.douyin_project_public_profiles
ADD CONSTRAINT douyin_project_public_profiles_project_tenant_fkey
FOREIGN KEY (tenant_id, project_id)
REFERENCES public.projects(tenant_id, id)
ON DELETE CASCADE;

COMMIT;
