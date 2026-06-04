CREATE TABLE IF NOT EXISTS public.tenant_service_areas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  province text NULL,
  city text NOT NULL,
  district text NULL,
  adcode text NULL,
  center_latitude double precision NULL,
  center_longitude double precision NULL,
  service_radius_km numeric(8, 2) NULL,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_areas_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_service_areas_city_not_blank CHECK (btrim(city) <> ''),
  CONSTRAINT tenant_service_areas_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text])),
  CONSTRAINT tenant_service_areas_latitude_range CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  CONSTRAINT tenant_service_areas_longitude_range CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  CONSTRAINT tenant_service_areas_radius_positive CHECK (service_radius_km IS NULL OR service_radius_km > 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_service_areas_tenant
ON public.tenant_service_areas(tenant_id, status, priority DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_service_areas_adcode
ON public.tenant_service_areas(adcode)
WHERE adcode IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_tenant_service_areas_city_district
ON public.tenant_service_areas(city, district, status, priority DESC);

DROP TRIGGER IF EXISTS tr_tenant_service_areas_updated_at ON public.tenant_service_areas;
CREATE TRIGGER tr_tenant_service_areas_updated_at
BEFORE UPDATE ON public.tenant_service_areas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS province text NULL;

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS city text NULL;

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS district text NULL;

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS adcode text NULL;

CREATE INDEX IF NOT EXISTS idx_properties_adcode
ON public.properties(adcode)
WHERE adcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_city_district
ON public.properties(city, district);

COMMENT ON TABLE public.tenant_service_areas IS '装修公司租户服务区域，用于定位后匹配本地装修公司';
COMMENT ON COLUMN public.tenant_service_areas.adcode IS '腾讯位置服务逆地址解析返回的行政区划代码';
COMMENT ON COLUMN public.tenant_service_areas.service_radius_km IS '以服务中心坐标为圆心的服务半径，单位千米';
COMMENT ON COLUMN public.properties.adcode IS '房产所在行政区划代码，优先使用腾讯位置服务 adcode';
