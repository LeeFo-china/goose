CREATE TABLE IF NOT EXISTS public.ops_script_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  script_key text NOT NULL,
  script_label text NOT NULL,
  status text NOT NULL,
  exit_code integer NULL,
  stdout text NULL,
  stderr text NULL,
  duration_ms integer NULL,
  executed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reason text NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT ops_script_runs_pkey PRIMARY KEY (id),
  CONSTRAINT ops_script_runs_status_check CHECK (
    status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text, 'timeout'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_ops_script_runs_created_at
  ON public.ops_script_runs USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_script_runs_script_key
  ON public.ops_script_runs USING btree (script_key);

CREATE INDEX IF NOT EXISTS idx_ops_script_runs_status
  ON public.ops_script_runs USING btree (status);

DROP TRIGGER IF EXISTS tr_ops_script_runs_updated_at ON public.ops_script_runs;

CREATE TRIGGER tr_ops_script_runs_updated_at
BEFORE UPDATE ON public.ops_script_runs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.ops_script_runs IS '后台运维白名单脚本执行记录';

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'system.ops.read',
    '查看运维脚本',
    'system',
    'ops_script',
    'read',
    '查看运维脚本列表和执行记录',
    'active'
  ),
  (
    'system.ops.run',
    '执行运维脚本',
    'system',
    'ops_script',
    'run',
    '执行后台白名单运维脚本',
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

