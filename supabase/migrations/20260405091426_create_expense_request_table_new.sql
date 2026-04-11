-- 如果表已存在，先删除（注意：这会清空已有报销数据，生产环境请改用 ALTER）
DROP TABLE IF EXISTS public.expense_requests CASCADE;

CREATE TABLE public.expense_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 1. 基础信息关联
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- 2. 报销核心内容
  mode TEXT NOT NULL CHECK (mode IN ('事前申请', '事后报销')),
  category TEXT NOT NULL, -- 材料费、差旅费等
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  reason TEXT NOT NULL,
  evidence_images JSONB DEFAULT '[]'::jsonb, -- 附件数组
  
  -- 3. 多级审批核心字段
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  
  -- 当前审批节点：标记目前该哪个角色审核 (例如: 'project_manager', 'finance', 'admin')
  current_step_role TEXT DEFAULT 'project_manager',
  
  -- 审批流转痕迹 (JSONB 数组)
  -- 存储格式: [{"role": "manager", "name": "张三", "status": "approved", "comment": "OK", "at": "..."}]
  audit_log JSONB DEFAULT '[]'::jsonb,
  
  -- 4. 财务结算关联
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：优化查询，方便员工查自己的，也方便财务按状态筛选
CREATE INDEX idx_expense_employee ON public.expense_requests(employee_id);
CREATE INDEX idx_expense_status ON public.expense_requests(status);

-- 触发器：自动更新时间
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_expense_updated_at
    BEFORE UPDATE ON public.expense_requests
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 开启 RLS 权限
ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;

-- 权限策略：
-- 1. 员工看自己的
CREATE POLICY "View own" ON public.expense_requests FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM public.employees WHERE id = employee_id)
);

-- 2. 审批人看自己需要审的
CREATE POLICY "Approvers view pending" ON public.expense_requests FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.employees 
    WHERE user_id = auth.uid() AND role = current_step_role
  )
);