-- ============================================
-- 装修公司测试数据 seed.sql
-- ============================================

-- 1. 部门数据（先插入，因为其他表依赖它）
INSERT INTO departments (name, code) VALUES
  ('总经理办公室', 'CEO'),
  ('市场部', 'MARKETING'),
  ('设计部', 'DESIGN'),
  ('工程部', 'ENGINEERING'),
  ('预算部', 'BUDGET'),
  ('采购部', 'PURCHASE'),
  ('财务部', 'FINANCE'),
  ('行政部', 'ADMIN'),
  ('客服部', 'SERVICE'),
  ('新媒体部', 'NEW_MEDIA');

-- 2. 员工数据（依赖 departments）
INSERT INTO employees (name, phone, department_id, role, status) VALUES
  -- 总经理办公室
  ('陈总', '13800000001', (SELECT id FROM departments WHERE code = 'CEO'), '总经理', 'active'),
  ('张助理', '13800000002', (SELECT id FROM departments WHERE code = 'CEO'), '总经理助理', 'active'),
  
  -- 市场部
  ('王经理', '13800000003', (SELECT id FROM departments WHERE code = 'MARKETING'), '市场经理', 'active'),
  ('李专员', '13800000004', (SELECT id FROM departments WHERE code = 'MARKETING'), '市场专员', 'active'),
  ('赵推广', '13800000005', (SELECT id FROM departments WHERE code = 'MARKETING'), '网络推广', 'active'),
  
  -- 设计部
  ('刘总监', '13800000006', (SELECT id FROM departments WHERE code = 'DESIGN'), '设计总监', 'active'),
  ('周设计师', '13800000007', (SELECT id FROM departments WHERE code = 'DESIGN'), '主案设计师', 'active'),
  ('吴设计师', '13800000008', (SELECT id FROM departments WHERE code = 'DESIGN'), '设计师', 'active'),
  ('郑助理', '13800000009', (SELECT id FROM departments WHERE code = 'DESIGN'), '设计助理', 'active'),
  
  -- 工程部
  ('孙经理', '13800000010', (SELECT id FROM departments WHERE code = 'ENGINEERING'), '工程经理', 'active'),
  ('周工长', '13800000011', (SELECT id FROM departments WHERE code = 'ENGINEERING'), '施工队长', 'active'),
  ('郑水电', '13800000012', (SELECT id FROM departments WHERE code = 'ENGINEERING'), '水电工', 'active'),
  ('冯木工', '13800000013', (SELECT id FROM departments WHERE code = 'ENGINEERING'), '木工', 'active'),
  
  -- 预算部
  ('钱主管', '13800000014', (SELECT id FROM departments WHERE code = 'BUDGET'), '预算主管', 'active'),
  ('孙预算', '13800000015', (SELECT id FROM departments WHERE code = 'BUDGET'), '预算员', 'active'),
  
  -- 采购部
  ('周采购', '13800000016', (SELECT id FROM departments WHERE code = 'PURCHASE'), '采购专员', 'active'),
  
  -- 财务部
  ('吴会计', '13800000017', (SELECT id FROM departments WHERE code = 'FINANCE'), '会计', 'active'),
  ('郑出纳', '13800000018', (SELECT id FROM departments WHERE code = 'FINANCE'), '出纳', 'active'),
  
  -- 行政部
  ('冯行政', '13800000019', (SELECT id FROM departments WHERE code = 'ADMIN'), '行政专员', 'active'),
  
  -- 客服部
  ('陈客服', '13800000020', (SELECT id FROM departments WHERE code = 'SERVICE'), '客服专员', 'active');

-- 3. 客户数据（依赖 employees）
INSERT INTO customers (name, phone, source, status, owner_id) VALUES
  -- 住宅客户
  ('张三', '13900000001', '抖音', 'active', (SELECT id FROM employees WHERE phone = '13800000003')),
  ('李四', '13900000002', '小红书', 'active', (SELECT id FROM employees WHERE phone = '13800000003')),
  ('王五', '13900000003', '朋友推荐', 'active', (SELECT id FROM employees WHERE phone = '13800000004')),
  ('赵六', '13900000004', '电话咨询', 'lead', (SELECT id FROM employees WHERE phone = '13800000004')),
  ('钱七', '13900000005', '抖音', 'active', (SELECT id FROM employees WHERE phone = '13800000003')),
  ('孙八', '13900000006', '小区推广', 'negotiating', (SELECT id FROM employees WHERE phone = '13800000004')),
  ('周九', '13900000007', '小红书', 'active', (SELECT id FROM employees WHERE phone = '13800000005')),
  ('吴十', '13900000008', '抖音', 'lead', (SELECT id FROM employees WHERE phone = '13800000005')),
  
  -- 商业客户
  ('大华公司', '13900000010', '电话咨询', 'active', (SELECT id FROM employees WHERE phone = '13800000003')),
  ('华联超市', '13900000011', '朋友推荐', 'negotiating', (SELECT id FROM employees WHERE phone = '13800000004')),
  ('星辰餐厅', '13900000012', '抖音', 'signed', (SELECT id FROM employees WHERE phone = '13800000005')),
  ('云尚酒店', '13900000013', '小区推广', 'active', (SELECT id FROM employees WHERE phone = '13800000003'));

-- 4. 项目数据（依赖 customers）
INSERT INTO projects (name, customer_id, address, status, budget) VALUES
  -- 已完成项目
  ('张三种子店装修', (SELECT id FROM customers WHERE phone = '13900000001'), '北京市朝阳区建国路88号', 'completed', 150000),
  ('李四旧房翻新', (SELECT id FROM customers WHERE phone = '13900000002'), '上海市浦东新区张江路100号', 'completed', 280000),
  ('大华公司办公室', (SELECT id FROM customers WHERE phone = '13900000010'), '广州市天河区珠江新城', 'completed', 580000),
  
  -- 进行中项目
  ('王五新房装修', (SELECT id FROM customers WHERE phone = '13900000003'), '深圳市南山区科技园', 'construction', 350000),
  ('星辰餐厅装修', (SELECT id FROM customers WHERE phone = '13900000012'), '成都市锦江区春熙路', 'designing', 420000),
  
  -- 设计阶段项目
  ('钱七别墅装修', (SELECT id FROM customers WHERE phone = '13900000005'), '杭州市西湖区灵隐路', 'designing', 880000),
  
  -- 报价阶段项目
  ('周九咖啡厅', (SELECT id FROM customers WHERE phone = '13900000007'), '南京市鼓楼区中山路', 'quoting', 260000),
  
  -- 洽谈中项目
  ('华联超市新店', (SELECT id FROM customers WHERE phone = '13900000011'), '武汉市江汉区解放大道', 'negotiating', 1200000),
  
  -- 新项目
  ('赵六新房咨询', (SELECT id FROM customers WHERE phone = '13900000004'), '天津市和平区南京路', 'surveying', NULL),
  ('吴十工作室', (SELECT id FROM customers WHERE phone = '13900000008'), '重庆市渝中区解放碑', 'surveying', NULL),
  ('云尚酒店大堂', (SELECT id FROM customers WHERE phone = '13900000013'), '西安市雁塔区小寨', 'negotiating', 2000000);

-- 5. 收款记录（依赖 projects）
INSERT INTO payments (project_id, amount, type, status) VALUES
  -- 张三种子店（已完成，已收完）
  ((SELECT id FROM projects WHERE name = '张三种子店装修'), 45000, '定金', 'paid'),
  ((SELECT id FROM projects WHERE name = '张三种子店装修'), 75000, '进度款', 'paid'),
  ((SELECT id FROM projects WHERE name = '张三种子店装修'), 30000, '尾款', 'paid'),
  
  -- 李四旧房翻新（已完成，已收完）
  ((SELECT id FROM projects WHERE name = '李四旧房翻新'), 84000, '定金', 'paid'),
  ((SELECT id FROM projects WHERE name = '李四旧房翻新'), 140000, '进度款', 'paid'),
  ((SELECT id FROM projects WHERE name = '李四旧房翻新'), 56000, '尾款', 'paid'),
  
  -- 大华公司办公室（已完成，已收完）
  ((SELECT id FROM projects WHERE name = '大华公司办公室'), 174000, '定金', 'paid'),
  ((SELECT id FROM projects WHERE name = '大华公司办公室'), 290000, '进度款', 'paid'),
  ((SELECT id FROM projects WHERE name = '大华公司办公室'), 116000, '尾款', 'paid'),
  
  -- 王五新房装修（进行中，部分收款）
  ((SELECT id FROM projects WHERE name = '王五新房装修'), 105000, '定金', 'paid'),
  ((SELECT id FROM projects WHERE name = '王五新房装修'), 140000, '进度款', 'paid'),
  ((SELECT id FROM projects WHERE name = '王五新房装修'), 105000, '进度款', 'unpaid'),
  
  -- 钱七别墅装修（设计阶段，首付）
  ((SELECT id FROM projects WHERE name = '钱七别墅装修'), 264000, '定金', 'paid'),
  
  -- 星辰餐厅（已签约，部分收款）
  ((SELECT id FROM projects WHERE name = '星辰餐厅装修'), 126000, '定金', 'paid'),
  ((SELECT id FROM projects WHERE name = '星辰餐厅装修'), 168000, '设计费', 'unpaid'),
  
  -- 周九咖啡厅（报价中，未收款）
  ((SELECT id FROM projects WHERE name = '周九咖啡厅'), 78000, '定金', 'unpaid'),
  
  -- 云尚酒店大堂（洽谈中，未收款）
  ((SELECT id FROM projects WHERE name = '云尚酒店大堂'), 600000, '定金', 'unpaid');