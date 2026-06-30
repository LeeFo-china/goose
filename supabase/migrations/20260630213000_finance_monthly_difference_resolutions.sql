-- Phase 8.3: monthly difference resolution records.

CREATE TABLE IF NOT EXISTS public.finance_monthly_difference_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  project_id uuid NULL,
  status text NOT NULL,
  note text NULL,
  handled_by uuid NULL,
  handled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_monthly_difference_resolutions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL,
  CONSTRAINT finance_monthly_difference_resolutions_handled_by_fkey
    FOREIGN KEY (handled_by) REFERENCES public.employees(id) ON DELETE SET NULL,
  CONSTRAINT finance_monthly_difference_resolutions_month_check
    CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT finance_monthly_difference_resolutions_source_type_check
    CHECK (source_type IN (
      'correction_audit',
      'ledger_entry',
      'receivable_plan',
      'expense_request'
    )),
  CONSTRAINT finance_monthly_difference_resolutions_status_check
    CHECK (status IN ('confirmed', 'ignored', 'resolved')),
  CONSTRAINT finance_monthly_difference_resolutions_source_id_check
    CHECK (length(trim(source_id)) BETWEEN 1 AND 120),
  CONSTRAINT finance_monthly_difference_resolutions_note_length_check
    CHECK (note IS NULL OR length(trim(note)) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_monthly_difference_resolutions_source_uidx
ON public.finance_monthly_difference_resolutions(
  tenant_id,
  month,
  source_type,
  source_id
);

CREATE INDEX IF NOT EXISTS finance_monthly_difference_resolutions_status_idx
ON public.finance_monthly_difference_resolutions(
  tenant_id,
  month,
  status,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS finance_monthly_difference_resolutions_project_idx
ON public.finance_monthly_difference_resolutions(
  tenant_id,
  project_id,
  month
);

DROP TRIGGER IF EXISTS tr_finance_monthly_difference_resolutions_updated_at
ON public.finance_monthly_difference_resolutions;

CREATE TRIGGER tr_finance_monthly_difference_resolutions_updated_at
  BEFORE UPDATE ON public.finance_monthly_difference_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.finance_monthly_difference_resolutions
IS '财务月结差异来源处理记录';

COMMENT ON COLUMN public.finance_monthly_difference_resolutions.month
IS '差异所属月份，格式 YYYY-MM';

COMMENT ON COLUMN public.finance_monthly_difference_resolutions.source_type
IS '差异来源类型';

COMMENT ON COLUMN public.finance_monthly_difference_resolutions.source_id
IS '差异来源业务对象 ID';

COMMENT ON COLUMN public.finance_monthly_difference_resolutions.status
IS '处理状态：confirmed 已确认、ignored 已忽略、resolved 已修复';
