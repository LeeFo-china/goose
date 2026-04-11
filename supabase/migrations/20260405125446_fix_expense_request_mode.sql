-- 1. 删除旧的约束 (如果你的约束名不是这个，请根据错误提示修改)
ALTER TABLE expense_requests 
DROP CONSTRAINT IF EXISTS expense_requests_mode_check;

-- 2. 添加新的英文约束
-- 将 '事前申请' 对应为 'advance'，'事后报销' 对应为 'reimbursement'
ALTER TABLE expense_requests 
ADD CONSTRAINT expense_requests_mode_check 
CHECK (mode = ANY (ARRAY['advance'::text, 'reimbursement'::text]));