-- Rollback: in a reviewed forward migration, restore the pricing-version
-- trigger to public.update_updated_at_column(). Keep the dedicated function
-- until no deployed command can rely on its strictly monotonic lock token.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.update_douyin_budget_pricing_version_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.updated_at := GREATEST(
    clock_timestamp(),
    OLD.updated_at + interval '1 microsecond',
    NEW.updated_at
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.update_douyin_budget_pricing_version_updated_at()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER tr_douyin_budget_pricing_versions_updated_at
ON public.douyin_budget_pricing_versions;

CREATE TRIGGER tr_douyin_budget_pricing_versions_updated_at
BEFORE UPDATE ON public.douyin_budget_pricing_versions
FOR EACH ROW
EXECUTE FUNCTION public.update_douyin_budget_pricing_version_updated_at();

COMMIT;
