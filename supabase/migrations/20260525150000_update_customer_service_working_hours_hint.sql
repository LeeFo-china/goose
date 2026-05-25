UPDATE public.system_settings
SET description = '客户侧展示的客服工作时间文案。示例：周一至周日 09:00-18:00。'
WHERE key = 'CUSTOMER_SERVICE_WORKING_HOURS';
