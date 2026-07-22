-- Clarify the exact Tencent OCR encrypted-ID public key format without changing its secret value.

UPDATE public.system_settings
SET
  description = '腾讯OCR售后提供的1024位PKCS#1 RSA公钥PEM；如收到Base64包裹内容，须先解码再保存。',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM'
  AND description IS DISTINCT FROM
    '腾讯OCR售后提供的1024位PKCS#1 RSA公钥PEM；如收到Base64包裹内容，须先解码再保存。';
