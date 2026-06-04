CREATE TABLE IF NOT EXISTS public.administrative_areas (
  adcode text NOT NULL,
  name text NOT NULL,
  level text NOT NULL,
  parent_adcode text NULL,
  full_name text NOT NULL,
  source text NOT NULL DEFAULT 'tencent_lbs',
  source_version text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  raw_payload jsonb NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT administrative_areas_pkey PRIMARY KEY (adcode),
  CONSTRAINT administrative_areas_parent_fkey FOREIGN KEY (parent_adcode)
    REFERENCES public.administrative_areas(adcode) ON DELETE SET NULL,
  CONSTRAINT administrative_areas_adcode_not_blank CHECK (btrim(adcode) <> ''),
  CONSTRAINT administrative_areas_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT administrative_areas_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT administrative_areas_level_check CHECK (
    level = ANY (ARRAY['province'::text, 'city'::text, 'district'::text])
  ),
  CONSTRAINT administrative_areas_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'inactive'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_administrative_areas_parent
ON public.administrative_areas(parent_adcode, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_administrative_areas_level
ON public.administrative_areas(level, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_administrative_areas_name
ON public.administrative_areas(name);

DROP TRIGGER IF EXISTS tr_administrative_areas_updated_at ON public.administrative_areas;
CREATE TRIGGER tr_administrative_areas_updated_at
BEFORE UPDATE ON public.administrative_areas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.administrative_areas IS '行政区划主数据，当前来源为腾讯位置服务行政区划接口';
COMMENT ON COLUMN public.administrative_areas.adcode IS '行政区划代码，使用腾讯位置服务返回的 id/adcode';
COMMENT ON COLUMN public.administrative_areas.parent_adcode IS '上级行政区划代码，省级为空';
COMMENT ON COLUMN public.administrative_areas.full_name IS '完整行政区划名称，例如 河南省 信阳市 固始县';
