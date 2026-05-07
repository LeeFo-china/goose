WITH department_dictionary(code, name) AS (
  VALUES
    ('BOARD', '董事会'),
    ('EXEC_OFFICE', '总裁办/总经理办公室'),
    ('SALES', '销售部/客户部'),
    ('MARKETING', '市场部'),
    ('DESIGN', '设计部'),
    ('PROJECT', '工程部'),
    ('PROCURE', '采购部'),
    ('AFTER_SALE', '售后部/维保部'),
    ('PRODUCT', '产品部'),
    ('TECH', '技术研发部'),
    ('IT', '信息技术部'),
    ('BIM_CENTER', 'BIM中心'),
    ('SUPPLY_CHAIN', '供应链管理部'),
    ('LOGISTICS', '物流部'),
    ('WAREHOUSE', '仓储部'),
    ('FACTORY', '工厂/生产基地'),
    ('PROJECT_MGT', '工程项目管理部'),
    ('QUALITY_SUPERVISION', '质量监理部'),
    ('SAFETY', '安全监察部'),
    ('ACCEPTANCE', '竣工验收部'),
    ('MAINTENANCE', '维修保养部'),
    ('ADMIN', '行政人事部'),
    ('FINANCE', '财务部'),
    ('LEGAL', '法务部'),
    ('COMPLIANCE', '合规部'),
    ('INTERNAL_AUDIT', '内审部'),
    ('BRAND', '品牌管理部'),
    ('PUBLIC_RELATIONS', '公关部'),
    ('DIGITAL_MARKETING', '数字营销部'),
    ('SELF_MEDIA', '自媒体部'),
    ('CHANNEL', '渠道部'),
    ('COMMUNITY', '社区运营部'),
    ('CUSTOMER_SERVICE', '客服部'),
    ('CUSTOMER_SUCCESS', '客户成功部'),
    ('COMPLAINTS', '客诉处理部'),
    ('STRATEGY', '战略发展部'),
    ('INVESTOR', '投资者关系部'),
    ('BUSINESS_DEV', '商务拓展部'),
    ('PMO', '项目管理办公室'),
    ('TRAINING', '培训部'),
    ('OPERATIONS', '运营部'),
    ('DATA_CENTER', '数据中心')
)
INSERT INTO public.departments (
  code,
  name
)
SELECT
  department_dictionary.code,
  department_dictionary.name
FROM department_dictionary
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;

WITH department_dictionary(code, name) AS (
  VALUES
    ('BOARD', '董事会'),
    ('EXEC_OFFICE', '总裁办/总经理办公室'),
    ('SALES', '销售部/客户部'),
    ('MARKETING', '市场部'),
    ('DESIGN', '设计部'),
    ('PROJECT', '工程部'),
    ('PROCURE', '采购部'),
    ('AFTER_SALE', '售后部/维保部'),
    ('PRODUCT', '产品部'),
    ('TECH', '技术研发部'),
    ('IT', '信息技术部'),
    ('BIM_CENTER', 'BIM中心'),
    ('SUPPLY_CHAIN', '供应链管理部'),
    ('LOGISTICS', '物流部'),
    ('WAREHOUSE', '仓储部'),
    ('FACTORY', '工厂/生产基地'),
    ('PROJECT_MGT', '工程项目管理部'),
    ('QUALITY_SUPERVISION', '质量监理部'),
    ('SAFETY', '安全监察部'),
    ('ACCEPTANCE', '竣工验收部'),
    ('MAINTENANCE', '维修保养部'),
    ('ADMIN', '行政人事部'),
    ('FINANCE', '财务部'),
    ('LEGAL', '法务部'),
    ('COMPLIANCE', '合规部'),
    ('INTERNAL_AUDIT', '内审部'),
    ('BRAND', '品牌管理部'),
    ('PUBLIC_RELATIONS', '公关部'),
    ('DIGITAL_MARKETING', '数字营销部'),
    ('SELF_MEDIA', '自媒体部'),
    ('CHANNEL', '渠道部'),
    ('COMMUNITY', '社区运营部'),
    ('CUSTOMER_SERVICE', '客服部'),
    ('CUSTOMER_SUCCESS', '客户成功部'),
    ('COMPLAINTS', '客诉处理部'),
    ('STRATEGY', '战略发展部'),
    ('INVESTOR', '投资者关系部'),
    ('BUSINESS_DEV', '商务拓展部'),
    ('PMO', '项目管理办公室'),
    ('TRAINING', '培训部'),
    ('OPERATIONS', '运营部'),
    ('DATA_CENTER', '数据中心')
),
legacy_departments AS (
  SELECT department.id AS legacy_id, standard.id AS standard_id
  FROM public.departments AS department
  JOIN department_dictionary
    ON btrim(department.name) = department_dictionary.name
  JOIN public.departments AS standard
    ON standard.code = department_dictionary.code
  WHERE department.id <> standard.id
)
UPDATE public.employees AS employee
SET department_id = legacy_departments.standard_id
FROM legacy_departments
WHERE employee.department_id = legacy_departments.legacy_id;

WITH department_dictionary(code, name) AS (
  VALUES
    ('BOARD', '董事会'),
    ('EXEC_OFFICE', '总裁办/总经理办公室'),
    ('SALES', '销售部/客户部'),
    ('MARKETING', '市场部'),
    ('DESIGN', '设计部'),
    ('PROJECT', '工程部'),
    ('PROCURE', '采购部'),
    ('AFTER_SALE', '售后部/维保部'),
    ('PRODUCT', '产品部'),
    ('TECH', '技术研发部'),
    ('IT', '信息技术部'),
    ('BIM_CENTER', 'BIM中心'),
    ('SUPPLY_CHAIN', '供应链管理部'),
    ('LOGISTICS', '物流部'),
    ('WAREHOUSE', '仓储部'),
    ('FACTORY', '工厂/生产基地'),
    ('PROJECT_MGT', '工程项目管理部'),
    ('QUALITY_SUPERVISION', '质量监理部'),
    ('SAFETY', '安全监察部'),
    ('ACCEPTANCE', '竣工验收部'),
    ('MAINTENANCE', '维修保养部'),
    ('ADMIN', '行政人事部'),
    ('FINANCE', '财务部'),
    ('LEGAL', '法务部'),
    ('COMPLIANCE', '合规部'),
    ('INTERNAL_AUDIT', '内审部'),
    ('BRAND', '品牌管理部'),
    ('PUBLIC_RELATIONS', '公关部'),
    ('DIGITAL_MARKETING', '数字营销部'),
    ('SELF_MEDIA', '自媒体部'),
    ('CHANNEL', '渠道部'),
    ('COMMUNITY', '社区运营部'),
    ('CUSTOMER_SERVICE', '客服部'),
    ('CUSTOMER_SUCCESS', '客户成功部'),
    ('COMPLAINTS', '客诉处理部'),
    ('STRATEGY', '战略发展部'),
    ('INVESTOR', '投资者关系部'),
    ('BUSINESS_DEV', '商务拓展部'),
    ('PMO', '项目管理办公室'),
    ('TRAINING', '培训部'),
    ('OPERATIONS', '运营部'),
    ('DATA_CENTER', '数据中心')
)
UPDATE public.employees AS employee
SET department_id = NULL
FROM public.departments AS department
WHERE employee.department_id = department.id
  AND NOT EXISTS (
    SELECT 1
    FROM department_dictionary
    WHERE department_dictionary.code = department.code
  );

WITH department_dictionary(code, name) AS (
  VALUES
    ('BOARD', '董事会'),
    ('EXEC_OFFICE', '总裁办/总经理办公室'),
    ('SALES', '销售部/客户部'),
    ('MARKETING', '市场部'),
    ('DESIGN', '设计部'),
    ('PROJECT', '工程部'),
    ('PROCURE', '采购部'),
    ('AFTER_SALE', '售后部/维保部'),
    ('PRODUCT', '产品部'),
    ('TECH', '技术研发部'),
    ('IT', '信息技术部'),
    ('BIM_CENTER', 'BIM中心'),
    ('SUPPLY_CHAIN', '供应链管理部'),
    ('LOGISTICS', '物流部'),
    ('WAREHOUSE', '仓储部'),
    ('FACTORY', '工厂/生产基地'),
    ('PROJECT_MGT', '工程项目管理部'),
    ('QUALITY_SUPERVISION', '质量监理部'),
    ('SAFETY', '安全监察部'),
    ('ACCEPTANCE', '竣工验收部'),
    ('MAINTENANCE', '维修保养部'),
    ('ADMIN', '行政人事部'),
    ('FINANCE', '财务部'),
    ('LEGAL', '法务部'),
    ('COMPLIANCE', '合规部'),
    ('INTERNAL_AUDIT', '内审部'),
    ('BRAND', '品牌管理部'),
    ('PUBLIC_RELATIONS', '公关部'),
    ('DIGITAL_MARKETING', '数字营销部'),
    ('SELF_MEDIA', '自媒体部'),
    ('CHANNEL', '渠道部'),
    ('COMMUNITY', '社区运营部'),
    ('CUSTOMER_SERVICE', '客服部'),
    ('CUSTOMER_SUCCESS', '客户成功部'),
    ('COMPLAINTS', '客诉处理部'),
    ('STRATEGY', '战略发展部'),
    ('INVESTOR', '投资者关系部'),
    ('BUSINESS_DEV', '商务拓展部'),
    ('PMO', '项目管理办公室'),
    ('TRAINING', '培训部'),
    ('OPERATIONS', '运营部'),
    ('DATA_CENTER', '数据中心')
)
DELETE FROM public.departments AS department
WHERE NOT EXISTS (
  SELECT 1
  FROM department_dictionary
  WHERE department_dictionary.code = department.code
);

ALTER TABLE public.departments
ALTER COLUMN code SET NOT NULL;

ALTER TABLE public.departments
DROP CONSTRAINT IF EXISTS departments_code_check;

ALTER TABLE public.departments
ADD CONSTRAINT departments_code_check
CHECK (
  code = ANY (
    ARRAY[
      'BOARD'::text,
      'EXEC_OFFICE'::text,
      'SALES'::text,
      'MARKETING'::text,
      'DESIGN'::text,
      'PROJECT'::text,
      'PROCURE'::text,
      'AFTER_SALE'::text,
      'PRODUCT'::text,
      'TECH'::text,
      'IT'::text,
      'BIM_CENTER'::text,
      'SUPPLY_CHAIN'::text,
      'LOGISTICS'::text,
      'WAREHOUSE'::text,
      'FACTORY'::text,
      'PROJECT_MGT'::text,
      'QUALITY_SUPERVISION'::text,
      'SAFETY'::text,
      'ACCEPTANCE'::text,
      'MAINTENANCE'::text,
      'ADMIN'::text,
      'FINANCE'::text,
      'LEGAL'::text,
      'COMPLIANCE'::text,
      'INTERNAL_AUDIT'::text,
      'BRAND'::text,
      'PUBLIC_RELATIONS'::text,
      'DIGITAL_MARKETING'::text,
      'SELF_MEDIA'::text,
      'CHANNEL'::text,
      'COMMUNITY'::text,
      'CUSTOMER_SERVICE'::text,
      'CUSTOMER_SUCCESS'::text,
      'COMPLAINTS'::text,
      'STRATEGY'::text,
      'INVESTOR'::text,
      'BUSINESS_DEV'::text,
      'PMO'::text,
      'TRAINING'::text,
      'OPERATIONS'::text,
      'DATA_CENTER'::text
    ]
  )
);
