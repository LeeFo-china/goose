-- 1. 为支付增加凭证和经办人
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS evidence_images jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES public.employees(id),
ADD COLUMN IF NOT EXISTS pay_date timestamptz DEFAULT now();


-- 3. 给客户增加一个“最后跟进时间”的冗余字段（为了提升列表页查询速度）
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS last_follow_at timestamptz;

-- 4. 建立索引（大幅提升大数据量下的查询速度）
CREATE INDEX IF NOT EXISTS idx_properties_customer_id ON public.properties(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_property_id ON public.projects(property_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_next_time ON public.customer_follow_ups(next_follow_at);