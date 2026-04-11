-- 给 projects 表增加设计师和监理字段
ALTER TABLE "public"."projects" 
ADD COLUMN "designer_id" uuid REFERENCES "public"."employees" ("id") ON DELETE SET NULL,
ADD COLUMN "supervisor_id" uuid REFERENCES "public"."employees" ("id") ON DELETE SET NULL;

-- 加上注释说明（推荐，方便后期维护）
COMMENT ON COLUMN "public"."projects"."designer_id" IS '负责该项目的设计师 ID';
COMMENT ON COLUMN "public"."projects"."supervisor_id" IS '负责该项目的监理 ID';