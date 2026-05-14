CREATE TABLE IF NOT EXISTS public.tenant_panorama_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  property_id uuid NULL REFERENCES public.properties(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  source_type text NOT NULL DEFAULT 'multi_image',
  shooting_mode text NOT NULL DEFAULT 'single_row',
  capture_direction text NULL,
  expected_angle_step integer NULL,
  status text NOT NULL DEFAULT 'draft',
  input_count integer NOT NULL DEFAULT 0,
  input_total_bytes bigint NOT NULL DEFAULT 0,
  output_projection text NULL,
  width integer NULL,
  height integer NULL,
  horizontal_angle_of_view numeric NULL,
  vertical_angle_of_view numeric NULL,
  vertical_offset numeric NULL,
  preview_path text NULL,
  panorama_path text NULL,
  manifest_path text NULL,
  tile_base_path text NULL,
  storage_provider text NOT NULL DEFAULT 'tencent_cos',
  storage_region text NULL,
  storage_bucket text NOT NULL DEFAULT 'panorama-assets',
  latest_job_id uuid NULL,
  error_code text NULL,
  error_message text NULL,
  quality_score numeric NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT tenant_panorama_assets_title_not_blank
    CHECK (btrim(title) <> ''),
  CONSTRAINT tenant_panorama_assets_status_check
    CHECK (status IN ('draft', 'queued', 'processing', 'ready', 'failed', 'disabled', 'deleted')),
  CONSTRAINT tenant_panorama_assets_source_type_check
    CHECK (source_type IN ('multi_image', 'equirectangular', 'cubemap')),
  CONSTRAINT tenant_panorama_assets_shooting_mode_check
    CHECK (shooting_mode IN ('single_row', 'multi_row', 'uploaded_ready_image')),
  CONSTRAINT tenant_panorama_assets_capture_direction_check
    CHECK (capture_direction IS NULL OR capture_direction IN ('clockwise', 'counterclockwise')),
  CONSTRAINT tenant_panorama_assets_storage_provider_check
    CHECK (storage_provider IN ('tencent_cos')),
  CONSTRAINT tenant_panorama_assets_output_projection_check
    CHECK (output_projection IS NULL OR output_projection IN ('equirectangular', 'partial_equirectangular', 'cubemap')),
  CONSTRAINT tenant_panorama_assets_input_count_check
    CHECK (input_count >= 0 AND input_count <= 30),
  CONSTRAINT tenant_panorama_assets_input_total_bytes_check
    CHECK (input_total_bytes >= 0),
  CONSTRAINT tenant_panorama_assets_expected_angle_step_check
    CHECK (expected_angle_step IS NULL OR expected_angle_step BETWEEN 10 AND 60),
  CONSTRAINT tenant_panorama_assets_dimensions_check
    CHECK (
      (width IS NULL OR width > 0)
      AND (height IS NULL OR height > 0)
    ),
  CONSTRAINT tenant_panorama_assets_quality_score_check
    CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1))
);

CREATE TABLE IF NOT EXISTS public.tenant_panorama_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.tenant_panorama_assets(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  attempt integer NOT NULL DEFAULT 1,
  input_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  worker_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text NULL,
  error_message text NULL,
  error_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_score numeric NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  timeout_at timestamptz NULL,
  created_by_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_panorama_jobs_job_type_check
    CHECK (job_type IN ('stitch_images', 'publish_equirectangular', 'generate_tiles', 'retry')),
  CONSTRAINT tenant_panorama_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'timeout')),
  CONSTRAINT tenant_panorama_jobs_attempt_check
    CHECK (attempt > 0),
  CONSTRAINT tenant_panorama_jobs_priority_check
    CHECK (priority >= 0),
  CONSTRAINT tenant_panorama_jobs_input_paths_array_check
    CHECK (jsonb_typeof(input_paths) = 'array'),
  CONSTRAINT tenant_panorama_jobs_input_metadata_array_check
    CHECK (jsonb_typeof(input_metadata) = 'array'),
  CONSTRAINT tenant_panorama_jobs_output_object_check
    CHECK (jsonb_typeof(output) = 'object'),
  CONSTRAINT tenant_panorama_jobs_worker_options_object_check
    CHECK (jsonb_typeof(worker_options) = 'object'),
  CONSTRAINT tenant_panorama_jobs_error_detail_object_check
    CHECK (jsonb_typeof(error_detail) = 'object'),
  CONSTRAINT tenant_panorama_jobs_quality_score_check
    CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_panorama_assets_latest_job_id_fkey'
  ) THEN
    ALTER TABLE public.tenant_panorama_assets
      ADD CONSTRAINT tenant_panorama_assets_latest_job_id_fkey
      FOREIGN KEY (latest_job_id)
      REFERENCES public.tenant_panorama_jobs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_assets_tenant_status
  ON public.tenant_panorama_assets(tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_assets_project
  ON public.tenant_panorama_assets(tenant_id, project_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_assets_customer
  ON public.tenant_panorama_assets(tenant_id, customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_assets_property
  ON public.tenant_panorama_assets(tenant_id, property_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_assets_latest_job
  ON public.tenant_panorama_assets(latest_job_id)
  WHERE latest_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_jobs_tenant_status
  ON public.tenant_panorama_jobs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_jobs_asset
  ON public.tenant_panorama_jobs(asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_panorama_jobs_pending
  ON public.tenant_panorama_jobs(priority ASC, queued_at ASC)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS tr_tenant_panorama_assets_updated_at ON public.tenant_panorama_assets;
CREATE TRIGGER tr_tenant_panorama_assets_updated_at
  BEFORE UPDATE ON public.tenant_panorama_assets
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_panorama_jobs_updated_at ON public.tenant_panorama_jobs;
CREATE TRIGGER tr_tenant_panorama_jobs_updated_at
  BEFORE UPDATE ON public.tenant_panorama_jobs
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'panorama.read',
    '查看 360 全景',
    'panorama',
    'panorama',
    'read',
    '查看租户项目下的 360 全景资产和处理任务',
    'active'
  ),
  (
    'panorama.create',
    '创建 360 全景',
    'panorama',
    'panorama',
    'create',
    '上传多图或全景图并创建 360 全景处理任务',
    'active'
  ),
  (
    'panorama.update',
    '编辑 360 全景',
    'panorama',
    'panorama',
    'update',
    '编辑 360 全景标题、说明、状态和项目归属',
    'active'
  ),
  (
    'panorama.delete',
    '删除 360 全景',
    'panorama',
    'panorama',
    'delete',
    '软删除租户项目下的 360 全景资产',
    'active'
  ),
  (
    'panorama.retry',
    '重试 360 全景处理',
    'panorama',
    'panorama',
    'retry',
    '对失败或需要重新处理的 360 全景任务发起重试',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
JOIN public.permissions p
  ON p.code = ANY (
    ARRAY[
      'panorama.read',
      'panorama.create',
      'panorama.update',
      'panorama.delete',
      'panorama.retry'
    ]
  )
WHERE r.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMENT ON TABLE public.tenant_panorama_assets IS '租户 360 全景资产主表';
COMMENT ON TABLE public.tenant_panorama_jobs IS '租户 360 全景拼接、导入、切片处理任务表';
COMMENT ON COLUMN public.tenant_panorama_assets.tenant_id IS '资产所属租户，不接受前端直接覆盖';
COMMENT ON COLUMN public.tenant_panorama_assets.project_id IS '资产绑定项目，可为空';
COMMENT ON COLUMN public.tenant_panorama_assets.customer_id IS '资产绑定客户，可为空';
COMMENT ON COLUMN public.tenant_panorama_assets.property_id IS '资产绑定房产，可为空';
COMMENT ON COLUMN public.tenant_panorama_assets.source_type IS '来源类型：multi_image/equirectangular/cubemap';
COMMENT ON COLUMN public.tenant_panorama_assets.shooting_mode IS '拍摄方式：single_row/multi_row/uploaded_ready_image';
COMMENT ON COLUMN public.tenant_panorama_assets.status IS '资产状态：draft/queued/processing/ready/failed/disabled/deleted';
COMMENT ON COLUMN public.tenant_panorama_assets.storage_provider IS '对象存储提供商，第一版使用 tencent_cos';
COMMENT ON COLUMN public.tenant_panorama_assets.storage_region IS '腾讯云 COS bucket 区域，例如 ap-guangzhou';
COMMENT ON COLUMN public.tenant_panorama_assets.storage_bucket IS '腾讯云 COS bucket 名称或逻辑 bucket 标识';
COMMENT ON COLUMN public.tenant_panorama_assets.latest_job_id IS '最近一次处理任务';
COMMENT ON COLUMN public.tenant_panorama_jobs.job_type IS '任务类型：stitch_images/publish_equirectangular/generate_tiles/retry';
COMMENT ON COLUMN public.tenant_panorama_jobs.status IS '任务状态：pending/processing/completed/failed/cancelled/timeout';
COMMENT ON COLUMN public.tenant_panorama_jobs.input_paths IS '按最终排序提交的源图 storage path 数组';
COMMENT ON COLUMN public.tenant_panorama_jobs.input_metadata IS '拍摄角度、姿态、文件序号等辅助信息';
COMMENT ON COLUMN public.tenant_panorama_jobs.output IS 'worker 输出路径、尺寸、projection、瓦片信息等结果快照';
