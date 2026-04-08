-- 增加计划开工时间字段
ALTER TABLE "public"."projects" 
ADD COLUMN "start_date" timestamptz;

-- 加上注释
COMMENT ON COLUMN "public"."projects"."start_date" IS '计划开工日期';