-- 1. 增加 user_id 字段，类型为 uuid
-- 允许为 NULL，以便兼容不需要登录的员工（如临时工或旧店历史数据）
ALTER TABLE "public"."employees" 
ADD COLUMN IF NOT EXISTS "user_id" uuid;

-- 2. 建立外键约束，关联到 auth.users 表
-- 使用 ON DELETE SET NULL：如果删除了 auth 账号，保留员工档案但解除关联
ALTER TABLE "public"."employees"
ADD CONSTRAINT "employees_user_id_fkey" 
FOREIGN KEY ("user_id") 
REFERENCES "auth"."users" ("id") 
ON DELETE SET NULL;