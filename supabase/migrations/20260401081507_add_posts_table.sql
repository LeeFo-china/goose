CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,                       -- 职位名称
  base_salary NUMERIC(10, 2),               -- 基础薪资

  salary_type TEXT DEFAULT 'monthly',       -- 薪资类型：monthly/daily/project/commission

  description TEXT,

  status SMALLINT DEFAULT 1,                -- 1启用 0停用
  sort INT DEFAULT 0,                       -- 排序

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(name)
);

-- 为员工表增加职位外键（如果员工表已存在）
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id) ON DELETE SET NULL;