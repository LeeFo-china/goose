ALTER TABLE public.platform_partners
ADD COLUMN IF NOT EXISTS region_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_partners_region_version_positive_check'
      AND conrelid = 'public.platform_partners'::regclass
  ) THEN
    ALTER TABLE public.platform_partners
    ADD CONSTRAINT platform_partners_region_version_positive_check
    CHECK (region_version > 0);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_platform_partner_district_regions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  invalid_region_codes text[];
  conflict_partner_id uuid;
  conflict_partner_name text;
  should_validate_regions boolean;
  should_check_conflict boolean;
BEGIN
  should_validate_regions := TG_OP = 'INSERT';
  should_check_conflict := TG_OP = 'INSERT' AND NEW.status = 'active';
  IF TG_OP = 'UPDATE' THEN
    should_validate_regions := NEW.region_codes IS DISTINCT FROM OLD.region_codes
      OR (
        NEW.status = 'active'
        AND NEW.status IS DISTINCT FROM OLD.status
      );
    should_check_conflict := NEW.status = 'active'
      AND (
        NEW.status IS DISTINCT FROM OLD.status
        OR NEW.region_codes IS DISTINCT FROM OLD.region_codes
      );
  END IF;

  IF should_validate_regions THEN
    NEW.region_codes := ARRAY(
      SELECT DISTINCT btrim(region_code)
      FROM unnest(COALESCE(NEW.region_codes, '{}'::text[])) AS region_code
      WHERE btrim(region_code) <> ''
      ORDER BY btrim(region_code)
    );

    IF cardinality(NEW.region_codes) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'platform partner requires at least one district region';
    END IF;

    SELECT COALESCE(array_agg(input_region.region_code ORDER BY input_region.region_code), '{}'::text[])
    INTO invalid_region_codes
    FROM unnest(NEW.region_codes) AS input_region(region_code)
    LEFT JOIN public.administrative_areas AS area
      ON area.adcode = input_region.region_code
      AND area.status = 'active'
      AND area.level = 'district'
    WHERE area.adcode IS NULL;

    IF cardinality(invalid_region_codes) > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'platform partner regions must be active districts',
        DETAIL = array_to_string(invalid_region_codes, ',');
    END IF;
  END IF;

  IF should_check_conflict THEN
    PERFORM pg_advisory_xact_lock(hashtext(locked_region.region_code))
    FROM (
      SELECT region_code
      FROM unnest(NEW.region_codes) AS region_code
      ORDER BY region_code
    ) AS locked_region;

    SELECT other_partner.id, other_partner.name
    INTO conflict_partner_id, conflict_partner_name
    FROM public.platform_partners AS other_partner
    WHERE other_partner.status = 'active'
      AND other_partner.id <> NEW.id
      AND other_partner.region_codes && NEW.region_codes
    ORDER BY other_partner.created_at, other_partner.id
    LIMIT 1;

    IF conflict_partner_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'active platform partner district region conflict',
        DETAIL = concat(conflict_partner_id::text, ':', conflict_partner_name);
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tr_enforce_platform_partner_district_regions
ON public.platform_partners;

CREATE TRIGGER tr_enforce_platform_partner_district_regions
BEFORE INSERT OR UPDATE OF status, region_codes
ON public.platform_partners
FOR EACH ROW
EXECUTE FUNCTION public.enforce_platform_partner_district_regions();

COMMENT ON COLUMN public.platform_partners.region_version IS
'城市合伙人运营区县配置版本，用于区域编辑乐观并发控制';

COMMENT ON FUNCTION public.enforce_platform_partner_district_regions() IS
'校验新增或变更的合伙人区域为启用区县，并阻止启用合伙人区县重叠';
