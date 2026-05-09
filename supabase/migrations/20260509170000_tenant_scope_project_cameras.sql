ALTER TABLE public.project_cameras
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.camera_access_logs
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.project_cameras camera
SET tenant_id = COALESCE(project.tenant_id, default_tenant.id)
FROM public.projects project
CROSS JOIN default_tenant
WHERE camera.project_id = project.id
  AND camera.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.project_cameras
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.camera_access_logs log
SET tenant_id = COALESCE(
  (
    SELECT camera.tenant_id
    FROM public.project_cameras camera
    WHERE camera.id = log.camera_id
    LIMIT 1
  ),
  (
    SELECT project.tenant_id
    FROM public.projects project
    WHERE project.id = log.project_id
    LIMIT 1
  ),
  default_tenant.id
)
FROM default_tenant
WHERE log.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_cameras_tenant_project
  ON public.project_cameras(tenant_id, project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_cameras_tenant_vendor
  ON public.project_cameras(tenant_id, vendor)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_camera_access_logs_tenant_project_created_at
  ON public.camera_access_logs(tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_camera_access_logs_tenant_camera_created_at
  ON public.camera_access_logs(tenant_id, camera_id, created_at DESC);

COMMENT ON COLUMN public.project_cameras.tenant_id IS '租户ID，从所属项目继承，用于工地摄像头绑定隔离';
COMMENT ON COLUMN public.camera_access_logs.tenant_id IS '租户ID，从摄像头或项目继承，用于摄像头访问审计隔离';
