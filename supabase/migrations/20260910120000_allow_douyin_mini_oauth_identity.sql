-- Allow Douyin mini-program customer auth credentials.
-- Rollback: deploy an API that no longer writes platform = 'douyin_mini',
-- mark any active douyin_mini identities unbound after export, then restore the
-- previous check constraint without 'douyin_mini'.
BEGIN;

ALTER TABLE public.user_oauth_identities
  DROP CONSTRAINT IF EXISTS user_oauth_identities_platform_check;

ALTER TABLE public.user_oauth_identities
  ADD CONSTRAINT user_oauth_identities_platform_check
  CHECK (platform IN (
    'wechat_mini',
    'wechat_web',
    'ios',
    'android',
    'web',
    'apple',
    'douyin_mini'
  ));

COMMENT ON COLUMN public.user_oauth_identities.platform IS
  '登录平台：wechat_mini/wechat_web/ios/android/web/apple/douyin_mini';

COMMIT;
