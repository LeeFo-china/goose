CREATE INDEX IF NOT EXISTS project_members_public_project_order_idx
ON public.project_members(project_id, sort_order ASC, is_primary DESC, created_at ASC)
WHERE deleted_at IS NULL;

