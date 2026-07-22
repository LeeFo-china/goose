-- Keep encrypted ID OCR disabled until the master OCR service has passed smoke.
-- Do not override an already-enabled production OCR installation.

UPDATE public.system_settings AS id_card_setting
SET
  value_text = 'false',
  updated_at = now()
WHERE id_card_setting.tenant_id IS NULL
  AND id_card_setting.key = 'TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED'
  AND id_card_setting.value_text IS DISTINCT FROM 'false'
  AND EXISTS (
    SELECT 1
    FROM public.system_settings AS master_setting
    WHERE master_setting.tenant_id IS NULL
      AND master_setting.key = 'TENCENT_OCR_ENABLED'
      AND COALESCE(master_setting.value_text, 'false') = 'false'
  );
