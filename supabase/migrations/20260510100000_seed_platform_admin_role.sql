DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.roles
    WHERE tenant_id IS NULL
      AND code = 'platform_admin'
  ) THEN
    INSERT INTO public.roles (
      tenant_id,
      code,
      name,
      description,
      status
    )
    VALUES (
      NULL,
      'platform_admin',
      '平台超管',
      '平台级超级管理员，可访问 /platform/* 管理能力',
      'active'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'roles_platform_code_unique'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.roles
    WHERE tenant_id IS NULL
    GROUP BY code
    HAVING count(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX roles_platform_code_unique ON public.roles(code) WHERE tenant_id IS NULL';
  END IF;
END $$;
