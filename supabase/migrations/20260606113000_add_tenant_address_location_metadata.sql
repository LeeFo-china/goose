ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_title text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_poi_id text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_province text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_city text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_district text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_adcode text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_latitude numeric(10, 7);

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_longitude numeric(10, 7);

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_source text;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_confidence numeric(5, 4);

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address_confirmed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_address_source_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_address_source_check CHECK (
      address_source IS NULL OR address_source = ANY (ARRAY[
        'manual'::text,
        'tencent_suggestion'::text,
        'tencent_geocoder'::text,
        'map_picker'::text
      ])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_address_confidence_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_address_confidence_check CHECK (
      address_confidence IS NULL OR address_confidence BETWEEN 0 AND 1
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenants_address_adcode
ON public.tenants(address_adcode)
WHERE address_adcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_address_confirmed_at
ON public.tenants(address_confirmed_at)
WHERE address_confirmed_at IS NOT NULL;

COMMENT ON COLUMN public.tenants.address_title IS '腾讯 POI 名称或用户确认的地址标题';
COMMENT ON COLUMN public.tenants.address_poi_id IS '腾讯 POI ID';
COMMENT ON COLUMN public.tenants.address_province IS '公司地址所在省';
COMMENT ON COLUMN public.tenants.address_city IS '公司地址所在市';
COMMENT ON COLUMN public.tenants.address_district IS '公司地址所在区县';
COMMENT ON COLUMN public.tenants.address_adcode IS '公司地址行政区划代码';
COMMENT ON COLUMN public.tenants.address_latitude IS '公司地址纬度，腾讯位置服务坐标口径';
COMMENT ON COLUMN public.tenants.address_longitude IS '公司地址经度，腾讯位置服务坐标口径';
COMMENT ON COLUMN public.tenants.address_source IS '公司地址来源：manual、tencent_suggestion、tencent_geocoder、map_picker';
COMMENT ON COLUMN public.tenants.address_confidence IS '公司地址置信度，0 到 1';
COMMENT ON COLUMN public.tenants.address_confirmed_at IS '公司地址和坐标人工确认时间';
