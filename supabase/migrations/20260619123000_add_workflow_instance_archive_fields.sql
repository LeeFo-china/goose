ALTER TABLE public.workflow_instances
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text NULL;

DO $$
BEGIN
  ALTER TABLE public.workflow_instances
    ADD CONSTRAINT workflow_instances_archived_by_fkey
    FOREIGN KEY (archived_by)
    REFERENCES public.employees(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.workflow_instances
    ADD CONSTRAINT workflow_instances_archive_reason_length_check
    CHECK (archive_reason IS NULL OR char_length(archive_reason) <= 500);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_definition_unarchived_updated
ON public.workflow_instances(tenant_id, definition_id, updated_at DESC)
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_definition_archived_updated
ON public.workflow_instances(tenant_id, definition_id, updated_at DESC)
WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.workflow_instances.archived_at
IS 'Workflow runtime instance archive marker for hiding terminal audit records from default operational lists.';

COMMENT ON COLUMN public.workflow_instances.archived_by
IS 'Employee who archived the workflow runtime instance.';

COMMENT ON COLUMN public.workflow_instances.archive_reason
IS 'Optional archive reason for completed workflow runtime instances.';
