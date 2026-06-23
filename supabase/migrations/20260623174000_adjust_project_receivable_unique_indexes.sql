-- Use non-partial unique indexes so Supabase upsert onConflict can target them.
-- PostgreSQL unique indexes still allow multiple NULL source_id rows, preserving
-- the manual/draft semantics from the original partial indexes.

DROP INDEX IF EXISTS public.project_receivable_plans_source_unique_idx;
DROP INDEX IF EXISTS public.project_receivable_allocations_source_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS project_receivable_plans_source_unique_idx
ON public.project_receivable_plans(tenant_id, source_type, source_id, payment_type);

CREATE UNIQUE INDEX IF NOT EXISTS project_receivable_allocations_source_unique_idx
ON public.project_receivable_allocations(
  tenant_id,
  source_type,
  source_id,
  receivable_plan_id
);
