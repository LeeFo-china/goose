BEGIN;

ALTER TABLE public.customer_log_share_opens
DROP CONSTRAINT IF EXISTS customer_log_share_opens_source_check;

ALTER TABLE public.customer_log_share_opens
ADD CONSTRAINT customer_log_share_opens_source_check
CHECK (source IN ('qrcode', 'poster', 'wechat_friend'));

ALTER TABLE public.customer_log_share_assists
DROP CONSTRAINT IF EXISTS customer_log_share_assists_source_check;

ALTER TABLE public.customer_log_share_assists
ADD CONSTRAINT customer_log_share_assists_source_check
CHECK (source IN ('qrcode', 'poster', 'wechat_friend'));

COMMIT;
