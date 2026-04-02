-- 1. 增加 code 字段
ALTER TABLE "public"."posts" ADD COLUMN IF NOT EXISTS "code" varchar(50);

-- 2. 设置唯一约束（防止重复）
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_code_key" UNIQUE ("code");