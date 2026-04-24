CREATE TABLE IF NOT EXISTS public.user_profiles (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NULL,
  avatar_path text NULL,
  profile_completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_profiles IS '通用登录用户资料';
COMMENT ON COLUMN public.user_profiles.auth_user_id IS '关联 auth.users.id';
COMMENT ON COLUMN public.user_profiles.nickname IS '用户昵称';
COMMENT ON COLUMN public.user_profiles.avatar_path IS '头像存储路径';
COMMENT ON COLUMN public.user_profiles.profile_completed_at IS '资料首次完成时间';

DROP TRIGGER IF EXISTS tr_user_profiles_updated_at ON public.user_profiles;

CREATE TRIGGER tr_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();
