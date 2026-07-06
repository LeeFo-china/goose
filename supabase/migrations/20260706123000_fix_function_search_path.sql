-- Fix Supabase security advisor function_search_path_mutable warnings.
-- Keep API/service authorization unchanged; this migration only pins runtime
-- search_path for existing functions so they no longer inherit caller settings.

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public;

ALTER FUNCTION public.workflow_edge_condition_matches(jsonb, jsonb)
  SET search_path = public;

ALTER FUNCTION public.search_finance_project_risk_ids(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  numeric,
  numeric
)
  SET search_path = public;

ALTER FUNCTION public.list_latest_finance_reconciliation_exception_actions(uuid, text[])
  SET search_path = public;
