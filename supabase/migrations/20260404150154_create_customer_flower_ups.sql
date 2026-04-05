-- 1. 增强客户位置信息
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]';

-- 2. 创建独立的跟进记录表（区分于施工日志）
CREATE TABLE IF NOT EXISTS public.customer_follow_ups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  content text NOT NULL,
  next_follow_at timestamptz, -- 关键：下次联系提醒时间
  created_at timestamptz DEFAULT now()
  
);
