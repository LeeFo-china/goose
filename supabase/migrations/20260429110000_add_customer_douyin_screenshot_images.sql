ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS douyin_screenshot_images text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.customers.douyin_screenshot_images IS '抖音来源客户截图凭证公网 URL 列表';
