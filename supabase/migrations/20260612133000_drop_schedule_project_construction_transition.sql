-- Drop legacy project state-machine RPC after application scheduling moved to
-- project repository updates + project member service writes.
--
-- Rollback: restore the latest function definition from
-- 20260531192000_cast_schedule_construction_start_date.sql.
DROP FUNCTION IF EXISTS public.schedule_project_construction_transition(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
);
