ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS location_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS location_source text NULL;

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS location_confidence numeric(5, 4) NULL;

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_location_status_check'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
    ADD CONSTRAINT properties_location_status_check CHECK (
      location_status = ANY (ARRAY[
        'pending'::text,
        'partial'::text,
        'geocoded'::text,
        'confirmed'::text
      ])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_location_source_check'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
    ADD CONSTRAINT properties_location_source_check CHECK (
      location_source IS NULL OR location_source = ANY (ARRAY[
        'manual'::text,
        'tencent_geocoder'::text,
        'tencent_reverse_geocoder'::text,
        'backfill'::text,
        'import'::text
      ])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_location_confidence_check'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
    ADD CONSTRAINT properties_location_confidence_check CHECK (
      location_confidence IS NULL OR location_confidence BETWEEN 0 AND 1
    );
  END IF;
END $$;

UPDATE public.properties
SET location_status = CASE
  WHEN latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND adcode IS NOT NULL
    AND btrim(adcode) <> ''
    THEN 'geocoded'
  WHEN latitude IS NOT NULL
    OR longitude IS NOT NULL
    OR adcode IS NOT NULL
    OR city IS NOT NULL
    THEN 'partial'
  ELSE 'pending'
END
WHERE location_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_properties_tenant_location_status
ON public.properties(tenant_id, location_status);

CREATE INDEX IF NOT EXISTS idx_properties_location_confirmed_at
ON public.properties(location_confirmed_at)
WHERE location_confirmed_at IS NOT NULL;

COMMENT ON COLUMN public.properties.location_status IS '房产位置标准化状态：pending 待补全、partial 部分信息、geocoded 已地理编码、confirmed 人工确认';
COMMENT ON COLUMN public.properties.location_source IS '房产位置来源：manual、tencent_geocoder、tencent_reverse_geocoder、backfill、import';
COMMENT ON COLUMN public.properties.location_confidence IS '地理编码置信度，0 到 1';
COMMENT ON COLUMN public.properties.location_confirmed_at IS '人工确认房产位置的时间；批量补齐不得覆盖 confirmed 记录';
