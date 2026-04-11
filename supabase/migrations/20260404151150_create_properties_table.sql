-- 1. 创建房产表
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  community text NOT NULL,           -- 小区名称
  building_info text,                -- 楼栋房号
  area numeric,                      -- 面积
  layout text,                       -- 户型
  latitude float8,                   -- 纬度
  longitude float8,                  -- 经度
  created_at timestamptz DEFAULT now()
);

-- 2. 给现有项目表增加房产关联（如果已有数据，需谨慎操作）
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id);

-- 注释：以后通过 property_id 就能追溯到客户和具体房屋地址
COMMENT ON TABLE public.properties IS '存储客户的房产物理信息，实现人房解耦';