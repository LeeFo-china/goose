-- 1. 为 customers 表添加 user_id 字段，关联到 auth.users
-- 使用 UUID 类型，并允许为空（因为录入潜客时可能还没有账号）
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. 开启 RLS (确保之前没开启过，开启了也没关系)
-- ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 3. 创建权限策略
-- 策略 A：老板 (boss) 可以查看和操作所有客户数据
-- CREATE POLICY "老板拥有所有权限" ON public.customers
-- FOR ALL
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM public.employees 
--     WHERE user_id = auth.uid() AND role = 'boss'
--   )
-- );

-- 策略 B：客户 (业主) 只能查看关联到自己账号的数据
-- CREATE POLICY "客户查看个人装修进度" ON public.customers
-- FOR SELECT
-- TO authenticated
-- USING (user_id = auth.uid());

-- 策略 C：员工查看自己负责的客户 (基于你现有的 owner_id)
-- CREATE POLICY "员工查看负责的客户" ON public.customers
-- FOR SELECT
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM public.employees 
--     WHERE user_id = auth.uid() AND id = owner_id
--   )
-- );