-- Platform-confirmed Douyin templates and tenant production publish permission.
-- Timestamp follows the production migration history observed on 2026-08-13.
--
-- Rollback (forward migration only):
-- 1. Disable platform template confirmation and tenant release mutations.
-- 2. Drop the unfinished-release trigger, function, and partial unique index.
-- 3. Revoke and drop confirm_douyin_deployable_template.
-- 4. Drop douyin_miniapp_deployable_templates after exporting its history.
-- 5. Remove douyin_miniapp.publish role mappings and permission only after
--    confirming no active tenant role depends on it.

BEGIN;

CREATE TABLE public.douyin_miniapp_deployable_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_app_id text NOT NULL,
  source_draft_id text NOT NULL,
  template_id text NOT NULL,
  template_version text NOT NULL,
  description text NOT NULL,
  channel text NOT NULL DEFAULT 'default',
  is_current boolean NOT NULL DEFAULT true,
  confirmed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_draft_id, channel),
  UNIQUE (template_id, channel),
  CONSTRAINT douyin_deployable_templates_app_id_check CHECK (
    template_app_id = 'tt0d647bd99301341b01'
  ),
  CONSTRAINT douyin_deployable_templates_template_id_check CHECK (
    template_id ~ '^[1-9][0-9]{0,18}$'
  ),
  CONSTRAINT douyin_deployable_templates_draft_id_check CHECK (
    source_draft_id ~ '^[1-9][0-9]{0,18}$'
  ),
  CONSTRAINT douyin_deployable_templates_version_check CHECK (
    char_length(template_version) BETWEEN 1 AND 64
    AND template_version = btrim(template_version)
  ),
  CONSTRAINT douyin_deployable_templates_description_check CHECK (
    char_length(description) BETWEEN 1 AND 200
    AND description = btrim(description)
  ),
  CONSTRAINT douyin_deployable_templates_channel_check CHECK (
    channel IN ('default', '1')
  )
);

CREATE UNIQUE INDEX douyin_deployable_templates_one_current_channel_idx
ON public.douyin_miniapp_deployable_templates(channel)
WHERE is_current = true;

CREATE INDEX douyin_deployable_templates_confirmed_idx
ON public.douyin_miniapp_deployable_templates(confirmed_at DESC, id DESC);

ALTER TABLE public.douyin_miniapp_deployable_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.douyin_miniapp_deployable_templates
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_miniapp_deployable_templates
TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_douyin_deployable_template(
  p_template_app_id text,
  p_source_draft_id text,
  p_template_id text,
  p_template_version text,
  p_description text,
  p_channel text,
  p_actor_employee_id uuid
)
RETURNS public.douyin_miniapp_deployable_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.douyin_miniapp_deployable_templates%ROWTYPE;
  v_result public.douyin_miniapp_deployable_templates%ROWTYPE;
BEGIN
  IF p_template_app_id IS NULL
     OR p_template_app_id <> 'tt0d647bd99301341b01'
     OR p_source_draft_id IS NULL
     OR p_source_draft_id !~ '^[1-9][0-9]{0,18}$'
     OR p_template_id IS NULL
     OR p_template_id !~ '^[1-9][0-9]{0,18}$'
     OR p_template_version IS NULL
     OR char_length(p_template_version) NOT BETWEEN 1 AND 64
     OR p_template_version <> btrim(p_template_version)
     OR p_description IS NULL
     OR char_length(p_description) NOT BETWEEN 1 AND 200
     OR p_description <> btrim(p_description)
     OR p_channel IS NULL
     OR p_channel NOT IN ('default', '1')
     OR p_actor_employee_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_DEPLOYABLE_TEMPLATE_INPUT_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    JOIN public.employee_roles AS employee_role
      ON employee_role.employee_id = employee.id
    JOIN public.roles AS role
      ON role.id = employee_role.role_id
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_id = role.id
    JOIN public.permissions AS permission
      ON permission.id = role_permission.permission_id
    WHERE employee.id = p_actor_employee_id
      AND employee.tenant_id IS NULL
      AND employee.status = 'active'
      AND role.tenant_id IS NULL
      AND role.status = 'active'
      AND permission.code = 'platform.douyin_miniapp.manage'
      AND permission.status = 'active'
      AND role_permission.access_scope = 'all'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TEMPLATE_CONFIRMATION_FORBIDDEN';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('douyin_deployable_template:' || p_channel, 0)
  );

  SELECT template.*
  INTO v_existing
  FROM public.douyin_miniapp_deployable_templates AS template
  WHERE template.channel = p_channel
    AND (
      template.template_id = p_template_id
      OR template.source_draft_id = p_source_draft_id
    )
  FOR UPDATE;

  IF FOUND AND (
    v_existing.template_app_id <> p_template_app_id
    OR v_existing.source_draft_id <> p_source_draft_id
    OR v_existing.template_version <> p_template_version
    OR v_existing.description <> p_description
    OR v_existing.channel <> p_channel
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'DOUYIN_DEPLOYABLE_TEMPLATE_ID_CONFLICT';
  END IF;

  UPDATE public.douyin_miniapp_deployable_templates AS template
  SET is_current = false
  WHERE template.channel = p_channel
    AND template.is_current = true
    AND template.template_id <> p_template_id;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.douyin_miniapp_deployable_templates AS template
    SET is_current = true
    WHERE template.id = v_existing.id
    RETURNING template.* INTO v_result;
  ELSE
    INSERT INTO public.douyin_miniapp_deployable_templates (
      template_app_id,
      source_draft_id,
      template_id,
      template_version,
      description,
      channel,
      is_current,
      confirmed_by_employee_id
    ) VALUES (
      p_template_app_id,
      p_source_draft_id,
      p_template_id,
      p_template_version,
      p_description,
      p_channel,
      true,
      p_actor_employee_id
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_douyin_deployable_template(
  text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_douyin_deployable_template(
  text, text, text, text, text, text, uuid
) TO service_role;

CREATE FUNCTION public.prevent_douyin_unfinished_release_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = NEW.installation_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS release
    WHERE release.installation_id = NEW.installation_id
      AND release.template_version <> NEW.template_version
      AND (
        release.status IN (
          'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved'
        )
        OR (
          release.operation_claim_token IS NOT NULL
          AND release.operation_claim_expires_at > clock_timestamp()
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_TENANT_RELEASE_IN_PROGRESS';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_douyin_unfinished_release_replacement()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_douyin_unfinished_release_replacement_trigger
BEFORE INSERT ON public.douyin_miniapp_releases
FOR EACH ROW
EXECUTE FUNCTION public.prevent_douyin_unfinished_release_replacement();

LOCK TABLE public.douyin_miniapp_releases IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS release
    WHERE release.status IN (
      'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved'
    )
    GROUP BY release.installation_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'DOUYIN_UNFINISHED_RELEASE_DUPLICATES_EXIST';
  END IF;
END;
$$;

CREATE UNIQUE INDEX douyin_miniapp_releases_one_unfinished_installation_idx
ON public.douyin_miniapp_releases(installation_id)
WHERE status IN (
  'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved'
);

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES (
  'douyin_miniapp.publish',
  '发布抖音小程序',
  'douyin_miniapp',
  'douyin_miniapp',
  'publish',
  '发布审核通过的租户抖音小程序版本',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code = 'douyin_miniapp.publish'
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
  AND roles.status = 'active'
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
