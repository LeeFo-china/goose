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
      'TENCENT_LBS_WEBSERVICE_KEY',
      'tencent_lbs',
      '腾讯位置服务 WebService Key',
      '后端调用腾讯位置服务 WebService API 使用的 Key，例如行政区划、逆地址解析等接口。',
      'string',
      NULL,
      false,
      'active'
    ),
    (
      'TENCENT_LBS_WEBSERVICE_SK',
      'tencent_lbs',
      '腾讯位置服务 WebService SecretKey/SK',
      'WebService API 开启 SN 校验后用于计算 sig 的 SecretKey，加密存储。',
      'string',
      NULL,
      true,
      'active'
    ),
    (
      'TENCENT_LBS_MINIPROGRAM_KEY',
      'tencent_lbs',
      '腾讯位置服务小程序 Key',
      '微信小程序端腾讯位置服务 JS SDK 使用的 Key，用于定位、逆地址解析等小程序侧能力。',
      'string',
      NULL,
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
      'TENCENT_LBS_WEBSERVICE_KEY',
      'tencent_lbs',
      '腾讯位置服务 WebService Key',
      '后端调用腾讯位置服务 WebService API 使用的 Key，例如行政区划、逆地址解析等接口。',
      'string',
      false,
      'active'
    ),
    (
      'TENCENT_LBS_WEBSERVICE_SK',
      'tencent_lbs',
      '腾讯位置服务 WebService SecretKey/SK',
      'WebService API 开启 SN 校验后用于计算 sig 的 SecretKey，加密存储。',
      'string',
      true,
      'active'
    ),
    (
      'TENCENT_LBS_MINIPROGRAM_KEY',
      'tencent_lbs',
      '腾讯位置服务小程序 Key',
      '微信小程序端腾讯位置服务 JS SDK 使用的 Key，用于定位、逆地址解析等小程序侧能力。',
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
