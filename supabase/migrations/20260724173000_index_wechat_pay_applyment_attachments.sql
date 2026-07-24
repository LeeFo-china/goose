-- Supports object-level preview authorization by file_object_id containment.
-- Rollback:
-- DROP INDEX public.tenant_wechat_pay_applyments_attachments_gin_idx;

CREATE INDEX tenant_wechat_pay_applyments_attachments_gin_idx
ON public.tenant_wechat_pay_applyments
USING gin (attachments jsonb_path_ops);
