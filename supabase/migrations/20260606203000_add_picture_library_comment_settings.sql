INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
SELECT *
FROM (
  VALUES
    (
      'PICTURE_COMMENT_DEFAULT_STATUS',
      'picture_library',
      '图片资料库评论默认状态',
      '控制 visitor 新提交图片资料库评论后的默认状态。visible 为立即展示，pending 为进入待处理。',
      'string',
      'visible',
      false,
      'active'
    )
) AS incoming (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = incoming.key
);

UPDATE public.system_settings existing
SET
  group_code = incoming.group_code,
  name = incoming.name,
  description = incoming.description,
  value_type = incoming.value_type,
  is_secret = incoming.is_secret,
  status = incoming.status,
  updated_at = now()
FROM (
  VALUES
    (
      'PICTURE_COMMENT_DEFAULT_STATUS',
      'picture_library',
      '图片资料库评论默认状态',
      '控制 visitor 新提交图片资料库评论后的默认状态。visible 为立即展示，pending 为进入待处理。',
      'string',
      false,
      'active'
    )
) AS incoming (
  key,
  group_code,
  name,
  description,
  value_type,
  is_secret,
  status
)
WHERE existing.tenant_id IS NULL
  AND existing.key = incoming.key;
