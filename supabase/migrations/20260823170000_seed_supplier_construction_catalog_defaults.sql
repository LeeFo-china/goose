-- Rollback: forward-only seed migration. To roll back, add a new migration
-- that inactivates unused seeded catalog rows after confirming no supplier
-- products, specs, SKU conversions, purchase orders, or snapshots reference
-- them. Do not delete referenced catalog facts.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $$
DECLARE
  v_actor_id uuid;
BEGIN
  SELECT employee.id INTO v_actor_id
  FROM public.employees AS employee
  WHERE employee.tenant_id IS NULL
    AND employee.status = 'active'
  ORDER BY employee.created_at, employee.id
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SEED_ACTOR_REQUIRED',
      DETAIL = 'platform catalog seed requires one active platform employee';
  END IF;
END;
$$;

CREATE TEMP TABLE construction_category_seed (
  code text PRIMARY KEY,
  parent_code text NULL,
  name text NOT NULL,
  depth integer NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO construction_category_seed (code, parent_code, name, depth, sort_order)
VALUES
  ('MAT_MAIN', NULL, '主材', 1, 10),
  ('MAT_AUX', NULL, '辅材', 1, 20),
  ('MAT_WATER_ELECTRIC', NULL, '水电材料', 1, 30),
  ('MAT_HARDWARE', NULL, '五金配件', 1, 40),

  ('MAT_MAIN_TILE', 'MAT_MAIN', '瓷砖', 2, 10),
  ('MAT_MAIN_FLOORING', 'MAT_MAIN', '地板', 2, 20),
  ('MAT_MAIN_DOOR_WINDOW', 'MAT_MAIN', '门窗', 2, 30),
  ('MAT_MAIN_SANITARY', 'MAT_MAIN', '卫浴洁具', 2, 40),
  ('MAT_MAIN_CABINET', 'MAT_MAIN', '定制柜橱', 2, 50),
  ('MAT_MAIN_LIGHTING', 'MAT_MAIN', '灯具', 2, 60),
  ('MAT_MAIN_SWITCH_SOCKET', 'MAT_MAIN', '开关插座', 2, 70),

  ('MAT_AUX_CEMENT_SAND', 'MAT_AUX', '水泥砂浆', 2, 10),
  ('MAT_AUX_BOARD_KEEL', 'MAT_AUX', '板材龙骨', 2, 20),
  ('MAT_AUX_WATERPROOF', 'MAT_AUX', '防水材料', 2, 30),
  ('MAT_AUX_PUTTY_PAINT', 'MAT_AUX', '腻子涂料', 2, 40),
  ('MAT_AUX_ADHESIVE_GROUT', 'MAT_AUX', '胶粘填缝', 2, 50),

  ('MAT_WATER_ELECTRIC_WIRE', 'MAT_WATER_ELECTRIC', '电线电缆', 2, 10),
  ('MAT_WATER_ELECTRIC_PIPE', 'MAT_WATER_ELECTRIC', '管材管件', 2, 20),
  ('MAT_WATER_ELECTRIC_WEAK', 'MAT_WATER_ELECTRIC', '弱电材料', 2, 30),

  ('MAT_HARDWARE_FASTENER', 'MAT_HARDWARE', '紧固件', 2, 10),
  ('MAT_HARDWARE_HINGE_SLIDE', 'MAT_HARDWARE', '合页滑轨', 2, 20),
  ('MAT_HARDWARE_LOCK', 'MAT_HARDWARE', '锁具', 2, 30),

  ('MAT_MAIN_TILE_FLOOR', 'MAT_MAIN_TILE', '地砖', 3, 10),
  ('MAT_MAIN_TILE_WALL', 'MAT_MAIN_TILE', '墙砖', 3, 20),
  ('MAT_MAIN_TILE_SKIRTING', 'MAT_MAIN_TILE', '踢脚线', 3, 30),
  ('MAT_MAIN_FLOORING_WOOD', 'MAT_MAIN_FLOORING', '木地板', 3, 10),
  ('MAT_MAIN_FLOORING_SPC', 'MAT_MAIN_FLOORING', 'SPC地板', 3, 20),
  ('MAT_MAIN_DOOR_WINDOW_DOOR', 'MAT_MAIN_DOOR_WINDOW', '室内门', 3, 10),
  ('MAT_MAIN_DOOR_WINDOW_WINDOW', 'MAT_MAIN_DOOR_WINDOW', '窗', 3, 20),
  ('MAT_MAIN_SANITARY_TOILET', 'MAT_MAIN_SANITARY', '马桶', 3, 10),
  ('MAT_MAIN_SANITARY_BASIN', 'MAT_MAIN_SANITARY', '台盆', 3, 20),
  ('MAT_MAIN_CABINET_KITCHEN', 'MAT_MAIN_CABINET', '橱柜', 3, 10),
  ('MAT_MAIN_CABINET_WARDROBE', 'MAT_MAIN_CABINET', '衣柜', 3, 20),
  ('MAT_MAIN_LIGHTING_CEILING', 'MAT_MAIN_LIGHTING', '吸顶灯', 3, 10),
  ('MAT_MAIN_LIGHTING_DOWNLIGHT', 'MAT_MAIN_LIGHTING', '筒灯射灯', 3, 20),
  ('MAT_AUX_CEMENT_SAND_CEMENT', 'MAT_AUX_CEMENT_SAND', '水泥', 3, 10),
  ('MAT_AUX_CEMENT_SAND_AGGREGATE', 'MAT_AUX_CEMENT_SAND', '砂石', 3, 20),
  ('MAT_AUX_BOARD_KEEL_GYPSUM', 'MAT_AUX_BOARD_KEEL', '石膏板', 3, 10),
  ('MAT_AUX_BOARD_KEEL_LIGHT_STEEL', 'MAT_AUX_BOARD_KEEL', '轻钢龙骨', 3, 20),
  ('MAT_AUX_BOARD_KEEL_WOOD', 'MAT_AUX_BOARD_KEEL', '木工板', 3, 30),
  ('MAT_AUX_WATERPROOF_COATING', 'MAT_AUX_WATERPROOF', '防水涂料', 3, 10),
  ('MAT_AUX_WATERPROOF_MEMBRANE', 'MAT_AUX_WATERPROOF', '防水卷材', 3, 20),
  ('MAT_AUX_PUTTY_PAINT_PUTTY', 'MAT_AUX_PUTTY_PAINT', '腻子粉', 3, 10),
  ('MAT_AUX_PUTTY_PAINT_LATEX', 'MAT_AUX_PUTTY_PAINT', '乳胶漆', 3, 20),
  ('MAT_AUX_PUTTY_PAINT_PAINT', 'MAT_AUX_PUTTY_PAINT', '油漆', 3, 30),
  ('MAT_AUX_ADHESIVE_GROUT_TILE_ADHESIVE', 'MAT_AUX_ADHESIVE_GROUT', '瓷砖胶', 3, 10),
  ('MAT_AUX_ADHESIVE_GROUT_SEALANT', 'MAT_AUX_ADHESIVE_GROUT', '美缝剂', 3, 20),
  ('MAT_AUX_ADHESIVE_GROUT_GLASS_GLUE', 'MAT_AUX_ADHESIVE_GROUT', '玻璃胶', 3, 30),
  ('MAT_WATER_ELECTRIC_WIRE_HOME', 'MAT_WATER_ELECTRIC_WIRE', '家装电线', 3, 10),
  ('MAT_WATER_ELECTRIC_WIRE_NETWORK', 'MAT_WATER_ELECTRIC_WIRE', '网线弱电', 3, 20),
  ('MAT_WATER_ELECTRIC_PIPE_SUPPLY', 'MAT_WATER_ELECTRIC_PIPE', '给水管', 3, 10),
  ('MAT_WATER_ELECTRIC_PIPE_DRAIN', 'MAT_WATER_ELECTRIC_PIPE', '排水管', 3, 20),
  ('MAT_WATER_ELECTRIC_PIPE_CONDUIT', 'MAT_WATER_ELECTRIC_PIPE', '线管', 3, 30);

INSERT INTO public.catalog_categories (
  id,
  parent_id,
  code,
  name,
  level,
  full_name,
  is_leaf,
  mapped_platform_category_id,
  ownership_scope,
  owner_tenant_id,
  status,
  sort_order,
  version,
  created_by_employee_id,
  updated_by_employee_id
)
SELECT
  gen_random_uuid(),
  NULL,
  seed.code,
  seed.name,
  1,
  seed.name,
  true,
  NULL,
  'platform',
  NULL,
  'active',
  seed.sort_order,
  1,
  actor.id,
  actor.id
FROM construction_category_seed AS seed
CROSS JOIN LATERAL (
  SELECT employee.id
  FROM public.employees AS employee
  WHERE employee.tenant_id IS NULL
    AND employee.status = 'active'
  ORDER BY employee.created_at, employee.id
  LIMIT 1
) AS actor
WHERE seed.depth = 1
ON CONFLICT (upper(btrim(code))) WHERE ownership_scope = 'platform'
DO UPDATE SET
  name = EXCLUDED.name,
  status = 'active',
  sort_order = EXCLUDED.sort_order,
  updated_by_employee_id = EXCLUDED.updated_by_employee_id,
  updated_at = now()
WHERE catalog_categories.name IS DISTINCT FROM EXCLUDED.name
   OR catalog_categories.status IS DISTINCT FROM 'active'
   OR catalog_categories.sort_order IS DISTINCT FROM EXCLUDED.sort_order;

INSERT INTO public.catalog_categories (
  id,
  parent_id,
  code,
  name,
  level,
  full_name,
  is_leaf,
  mapped_platform_category_id,
  ownership_scope,
  owner_tenant_id,
  status,
  sort_order,
  version,
  created_by_employee_id,
  updated_by_employee_id
)
SELECT
  gen_random_uuid(),
  parent.id,
  seed.code,
  seed.name,
  parent.level + 1,
  parent.full_name || ' / ' || seed.name,
  true,
  NULL,
  'platform',
  NULL,
  'active',
  seed.sort_order,
  1,
  actor.id,
  actor.id
FROM construction_category_seed AS seed
JOIN public.catalog_categories AS parent
  ON upper(btrim(parent.code)) = upper(btrim(seed.parent_code))
  AND parent.ownership_scope = 'platform'
CROSS JOIN LATERAL (
  SELECT employee.id
  FROM public.employees AS employee
  WHERE employee.tenant_id IS NULL
    AND employee.status = 'active'
  ORDER BY employee.created_at, employee.id
  LIMIT 1
) AS actor
WHERE seed.depth = 2
ON CONFLICT (upper(btrim(code))) WHERE ownership_scope = 'platform'
DO UPDATE SET
  name = EXCLUDED.name,
  status = 'active',
  sort_order = EXCLUDED.sort_order,
  updated_by_employee_id = EXCLUDED.updated_by_employee_id,
  updated_at = now()
WHERE catalog_categories.name IS DISTINCT FROM EXCLUDED.name
   OR catalog_categories.status IS DISTINCT FROM 'active'
   OR catalog_categories.sort_order IS DISTINCT FROM EXCLUDED.sort_order;

INSERT INTO public.catalog_categories (
  id,
  parent_id,
  code,
  name,
  level,
  full_name,
  is_leaf,
  mapped_platform_category_id,
  ownership_scope,
  owner_tenant_id,
  status,
  sort_order,
  version,
  created_by_employee_id,
  updated_by_employee_id
)
SELECT
  gen_random_uuid(),
  parent.id,
  seed.code,
  seed.name,
  parent.level + 1,
  parent.full_name || ' / ' || seed.name,
  true,
  NULL,
  'platform',
  NULL,
  'active',
  seed.sort_order,
  1,
  actor.id,
  actor.id
FROM construction_category_seed AS seed
JOIN public.catalog_categories AS parent
  ON upper(btrim(parent.code)) = upper(btrim(seed.parent_code))
  AND parent.ownership_scope = 'platform'
CROSS JOIN LATERAL (
  SELECT employee.id
  FROM public.employees AS employee
  WHERE employee.tenant_id IS NULL
    AND employee.status = 'active'
  ORDER BY employee.created_at, employee.id
  LIMIT 1
) AS actor
WHERE seed.depth = 3
ON CONFLICT (upper(btrim(code))) WHERE ownership_scope = 'platform'
DO UPDATE SET
  name = EXCLUDED.name,
  status = 'active',
  sort_order = EXCLUDED.sort_order,
  updated_by_employee_id = EXCLUDED.updated_by_employee_id,
  updated_at = now()
WHERE catalog_categories.name IS DISTINCT FROM EXCLUDED.name
   OR catalog_categories.status IS DISTINCT FROM 'active'
   OR catalog_categories.sort_order IS DISTINCT FROM EXCLUDED.sort_order;

CREATE TEMP TABLE construction_unit_seed (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  unit_dimension text NOT NULL,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO construction_unit_seed (
  code,
  name,
  symbol,
  unit_dimension,
  sort_order
)
VALUES
  ('UNIT_PC', '个', '个', 'quantity', 10),
  ('UNIT_ITEM', '只', '只', 'quantity', 20),
  ('UNIT_SET', '套', '套', 'quantity', 30),
  ('UNIT_SHEET', '片', '片', 'quantity', 40),
  ('UNIT_BLOCK', '块', '块', 'quantity', 50),
  ('UNIT_ROOT', '根', '根', 'quantity', 60),
  ('UNIT_STICK', '支', '支', 'quantity', 70),
  ('UNIT_STRIP', '条', '条', 'quantity', 80),
  ('UNIT_BOX', '箱', '箱', 'quantity', 90),
  ('UNIT_ROLL', '卷', '卷', 'quantity', 100),
  ('UNIT_BAG', '袋', '袋', 'quantity', 110),
  ('UNIT_BUCKET', '桶', '桶', 'quantity', 120),
  ('UNIT_M', '米', 'm', 'length', 210),
  ('UNIT_CM', '厘米', 'cm', 'length', 220),
  ('UNIT_MM', '毫米', 'mm', 'length', 230),
  ('UNIT_SQM', '平方米', '㎡', 'area', 310),
  ('UNIT_CBM', '立方米', 'm³', 'volume', 410),
  ('UNIT_L', '升', 'L', 'volume', 420),
  ('UNIT_G', '克', 'g', 'weight', 510),
  ('UNIT_KG', '千克', 'kg', 'weight', 520),
  ('UNIT_TON', '吨', 't', 'weight', 530);

INSERT INTO public.catalog_units (
  id,
  code,
  name,
  symbol,
  base_unit_id,
  conversion_factor,
  unit_dimension,
  status,
  sort_order,
  version,
  created_by_employee_id,
  updated_by_employee_id
)
SELECT
  gen_random_uuid(),
  seed.code,
  seed.name,
  seed.symbol,
  NULL,
  1,
  seed.unit_dimension,
  'active',
  seed.sort_order,
  1,
  actor.id,
  actor.id
FROM construction_unit_seed AS seed
CROSS JOIN LATERAL (
  SELECT employee.id
  FROM public.employees AS employee
  WHERE employee.tenant_id IS NULL
    AND employee.status = 'active'
  ORDER BY employee.created_at, employee.id
  LIMIT 1
) AS actor
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol,
  unit_dimension = EXCLUDED.unit_dimension,
  status = 'active',
  sort_order = EXCLUDED.sort_order,
  updated_by_employee_id = EXCLUDED.updated_by_employee_id,
  updated_at = now()
WHERE catalog_units.name IS DISTINCT FROM EXCLUDED.name
   OR catalog_units.symbol IS DISTINCT FROM EXCLUDED.symbol
   OR catalog_units.unit_dimension IS DISTINCT FROM EXCLUDED.unit_dimension
   OR catalog_units.status IS DISTINCT FROM 'active'
   OR catalog_units.sort_order IS DISTINCT FROM EXCLUDED.sort_order;

COMMIT;
