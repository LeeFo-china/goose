CREATE TABLE IF NOT EXISTS public.wechat_identities (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openid text NOT NULL UNIQUE,
  unionid text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_identities_openid_unique
ON public.wechat_identities (openid);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_identities_unionid_unique
ON public.wechat_identities (unionid)
WHERE unionid IS NOT NULL;
