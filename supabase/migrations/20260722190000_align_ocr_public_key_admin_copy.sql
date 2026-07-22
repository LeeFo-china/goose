-- Align the stored help copy with the Admin public-key normalizer without touching the secret value.

UPDATE public.system_settings
SET
  description = '腾讯OCR售后提供的1024位PKCS#1 RSA公钥；支持上传原始PKCS#1 PEM，或粘贴该PEM的外层Base64编码，保存时自动规范化。',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM'
  AND description IS DISTINCT FROM
    '腾讯OCR售后提供的1024位PKCS#1 RSA公钥；支持上传原始PKCS#1 PEM，或粘贴该PEM的外层Base64编码，保存时自动规范化。';
