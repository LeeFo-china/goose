WITH employee_posts(code, name, sort) AS (
  VALUES
    ('GENERAL_MANAGER', '总经理', 10),
    ('OPERATIONS_DIRECTOR', '运营总监', 20),
    ('GENERAL_MANAGER_ASSISTANT', '总经理助理', 30),
    ('HR_ADMIN_MANAGER', '行政人事主管', 110),
    ('HR_SPECIALIST', '人事专员', 120),
    ('ADMIN_SPECIALIST', '行政专员', 130),
    ('MARKETING_DIRECTOR', '营销总监', 210),
    ('MARKETING_MANAGER', '市场经理', 220),
    ('NEW_MEDIA_OPERATOR', '新媒体运营', 230),
    ('VIDEO_EDITOR', '摄影剪辑', 240),
    ('LIVE_STREAM_OPERATOR', '直播运营', 250),
    ('AD_OPERATOR', '投流专员', 260),
    ('CUSTOMER_INVITER', '客服邀约专员', 270),
    ('SALES_MANAGER', '销售经理', 310),
    ('SALES_CONSULTANT', '客户经理', 320),
    ('TELESALES', '电话销售', 330),
    ('CHANNEL_MANAGER', '渠道经理', 340),
    ('DESIGN_DIRECTOR', '设计总监', 410),
    ('CHIEF_DESIGNER', '主案设计师', 420),
    ('INTERIOR_DESIGNER', '设计师', 430),
    ('ASSISTANT_DESIGNER', '助理设计师', 440),
    ('RENDERING_DESIGNER', '效果图设计师', 450),
    ('ENGINEERING_DIRECTOR', '工程总监', 510),
    ('PROJECT_MANAGER', '项目经理', 520),
    ('CONSTRUCTION_SUPER', '工程监理', 530),
    ('QUALITY_INSPECTOR', '质检专员', 540),
    ('SAFETY_OFFICER', '安全员', 550),
    ('HYDROPOWER_FOREMAN', '水电工长', 560),
    ('TILE_FOREMAN', '瓦工工长', 570),
    ('CARPENTRY_FOREMAN', '木工工长', 580),
    ('PAINT_FOREMAN', '油漆工长', 590),
    ('MAINTENANCE_WORKER', '维修工', 600),
    ('PROCUREMENT_MANAGER', '采购主管', 610),
    ('PROCURE_OFFICER', '采购专员', 620),
    ('MATERIAL_CLERK', '材料员', 630),
    ('WAREHOUSE_KEEPER', '仓库管理员', 640),
    ('DELIVERY_COORDINATOR', '配送协调员', 650),
    ('FINANCE_MANAGER', '财务经理', 710),
    ('FINANCE_ACCOUNTANT', '会计', 720),
    ('CASHIER', '出纳', 730),
    ('COST_ACCOUNTANT', '成本核算员', 740),
    ('CUSTOMER_SERVICE_MANAGER', '客服主管', 810),
    ('CUSTOMER_SERVICE', '客服专员', 820),
    ('AFTER_SALES_SPECIALIST', '售后专员', 830),
    ('CUSTOMER_RETURN_VISITOR', '回访专员', 840),
    ('SYSTEM_ADMIN', '系统管理员', 910),
    ('DATA_SPECIALIST', '数据专员', 920),
    ('IT_SUPPORT', 'IT技术支持', 930)
)
UPDATE public.posts AS post
SET
  code = employee_posts.code,
  sort = COALESCE(post.sort, employee_posts.sort),
  status = COALESCE(post.status, 1),
  updated_at = now()
FROM employee_posts
WHERE post.code IS NULL
  AND btrim(post.name) = employee_posts.name
  AND NOT EXISTS (
    SELECT 1
    FROM public.posts AS used_post
    WHERE used_post.code = employee_posts.code
      AND used_post.id <> post.id
  );

WITH employee_posts(code, name, sort) AS (
  VALUES
    ('GENERAL_MANAGER', '总经理', 10),
    ('OPERATIONS_DIRECTOR', '运营总监', 20),
    ('GENERAL_MANAGER_ASSISTANT', '总经理助理', 30),
    ('HR_ADMIN_MANAGER', '行政人事主管', 110),
    ('HR_SPECIALIST', '人事专员', 120),
    ('ADMIN_SPECIALIST', '行政专员', 130),
    ('MARKETING_DIRECTOR', '营销总监', 210),
    ('MARKETING_MANAGER', '市场经理', 220),
    ('NEW_MEDIA_OPERATOR', '新媒体运营', 230),
    ('VIDEO_EDITOR', '摄影剪辑', 240),
    ('LIVE_STREAM_OPERATOR', '直播运营', 250),
    ('AD_OPERATOR', '投流专员', 260),
    ('CUSTOMER_INVITER', '客服邀约专员', 270),
    ('SALES_MANAGER', '销售经理', 310),
    ('SALES_CONSULTANT', '客户经理', 320),
    ('TELESALES', '电话销售', 330),
    ('CHANNEL_MANAGER', '渠道经理', 340),
    ('DESIGN_DIRECTOR', '设计总监', 410),
    ('CHIEF_DESIGNER', '主案设计师', 420),
    ('INTERIOR_DESIGNER', '设计师', 430),
    ('ASSISTANT_DESIGNER', '助理设计师', 440),
    ('RENDERING_DESIGNER', '效果图设计师', 450),
    ('ENGINEERING_DIRECTOR', '工程总监', 510),
    ('PROJECT_MANAGER', '项目经理', 520),
    ('CONSTRUCTION_SUPER', '工程监理', 530),
    ('QUALITY_INSPECTOR', '质检专员', 540),
    ('SAFETY_OFFICER', '安全员', 550),
    ('HYDROPOWER_FOREMAN', '水电工长', 560),
    ('TILE_FOREMAN', '瓦工工长', 570),
    ('CARPENTRY_FOREMAN', '木工工长', 580),
    ('PAINT_FOREMAN', '油漆工长', 590),
    ('MAINTENANCE_WORKER', '维修工', 600),
    ('PROCUREMENT_MANAGER', '采购主管', 610),
    ('PROCURE_OFFICER', '采购专员', 620),
    ('MATERIAL_CLERK', '材料员', 630),
    ('WAREHOUSE_KEEPER', '仓库管理员', 640),
    ('DELIVERY_COORDINATOR', '配送协调员', 650),
    ('FINANCE_MANAGER', '财务经理', 710),
    ('FINANCE_ACCOUNTANT', '会计', 720),
    ('CASHIER', '出纳', 730),
    ('COST_ACCOUNTANT', '成本核算员', 740),
    ('CUSTOMER_SERVICE_MANAGER', '客服主管', 810),
    ('CUSTOMER_SERVICE', '客服专员', 820),
    ('AFTER_SALES_SPECIALIST', '售后专员', 830),
    ('CUSTOMER_RETURN_VISITOR', '回访专员', 840),
    ('SYSTEM_ADMIN', '系统管理员', 910),
    ('DATA_SPECIALIST', '数据专员', 920),
    ('IT_SUPPORT', 'IT技术支持', 930)
),
null_posts AS (
  SELECT id, row_number() OVER (ORDER BY random()) AS rn
  FROM public.posts
  WHERE code IS NULL
),
unused_codes AS (
  SELECT employee_posts.code, row_number() OVER (ORDER BY random()) AS rn
  FROM employee_posts
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.posts AS post
    WHERE post.code = employee_posts.code
  )
),
matched_codes AS (
  SELECT null_posts.id, unused_codes.code
  FROM null_posts
  JOIN unused_codes ON unused_codes.rn = null_posts.rn
)
UPDATE public.posts AS post
SET
  code = matched_codes.code,
  updated_at = now()
FROM matched_codes
WHERE post.id = matched_codes.id;

UPDATE public.posts
SET
  code = ('LEGACY_POST_' || substr(replace(id::text, '-', ''), 1, 12))::varchar(64),
  updated_at = now()
WHERE code IS NULL;

WITH employee_posts(code, name, sort) AS (
  VALUES
    ('GENERAL_MANAGER', '总经理', 10),
    ('OPERATIONS_DIRECTOR', '运营总监', 20),
    ('GENERAL_MANAGER_ASSISTANT', '总经理助理', 30),
    ('HR_ADMIN_MANAGER', '行政人事主管', 110),
    ('HR_SPECIALIST', '人事专员', 120),
    ('ADMIN_SPECIALIST', '行政专员', 130),
    ('MARKETING_DIRECTOR', '营销总监', 210),
    ('MARKETING_MANAGER', '市场经理', 220),
    ('NEW_MEDIA_OPERATOR', '新媒体运营', 230),
    ('VIDEO_EDITOR', '摄影剪辑', 240),
    ('LIVE_STREAM_OPERATOR', '直播运营', 250),
    ('AD_OPERATOR', '投流专员', 260),
    ('CUSTOMER_INVITER', '客服邀约专员', 270),
    ('SALES_MANAGER', '销售经理', 310),
    ('SALES_CONSULTANT', '客户经理', 320),
    ('TELESALES', '电话销售', 330),
    ('CHANNEL_MANAGER', '渠道经理', 340),
    ('DESIGN_DIRECTOR', '设计总监', 410),
    ('CHIEF_DESIGNER', '主案设计师', 420),
    ('INTERIOR_DESIGNER', '设计师', 430),
    ('ASSISTANT_DESIGNER', '助理设计师', 440),
    ('RENDERING_DESIGNER', '效果图设计师', 450),
    ('ENGINEERING_DIRECTOR', '工程总监', 510),
    ('PROJECT_MANAGER', '项目经理', 520),
    ('CONSTRUCTION_SUPER', '工程监理', 530),
    ('QUALITY_INSPECTOR', '质检专员', 540),
    ('SAFETY_OFFICER', '安全员', 550),
    ('HYDROPOWER_FOREMAN', '水电工长', 560),
    ('TILE_FOREMAN', '瓦工工长', 570),
    ('CARPENTRY_FOREMAN', '木工工长', 580),
    ('PAINT_FOREMAN', '油漆工长', 590),
    ('MAINTENANCE_WORKER', '维修工', 600),
    ('PROCUREMENT_MANAGER', '采购主管', 610),
    ('PROCURE_OFFICER', '采购专员', 620),
    ('MATERIAL_CLERK', '材料员', 630),
    ('WAREHOUSE_KEEPER', '仓库管理员', 640),
    ('DELIVERY_COORDINATOR', '配送协调员', 650),
    ('FINANCE_MANAGER', '财务经理', 710),
    ('FINANCE_ACCOUNTANT', '会计', 720),
    ('CASHIER', '出纳', 730),
    ('COST_ACCOUNTANT', '成本核算员', 740),
    ('CUSTOMER_SERVICE_MANAGER', '客服主管', 810),
    ('CUSTOMER_SERVICE', '客服专员', 820),
    ('AFTER_SALES_SPECIALIST', '售后专员', 830),
    ('CUSTOMER_RETURN_VISITOR', '回访专员', 840),
    ('SYSTEM_ADMIN', '系统管理员', 910),
    ('DATA_SPECIALIST', '数据专员', 920),
    ('IT_SUPPORT', 'IT技术支持', 930)
)
INSERT INTO public.posts (
  code,
  name,
  status,
  sort,
  description,
  salary_type
)
SELECT
  employee_posts.code,
  employee_posts.name,
  1,
  employee_posts.sort,
  '标准岗位字典',
  NULL
FROM employee_posts
WHERE NOT EXISTS (
    SELECT 1
    FROM public.posts AS post
    WHERE post.code = employee_posts.code
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.posts AS post
    WHERE btrim(post.name) = employee_posts.name
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.posts
ALTER COLUMN code SET NOT NULL;
