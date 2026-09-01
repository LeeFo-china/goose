BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Forward-only rollback procedure:
-- 1. Revoke API and RPC privileges and deploy callers that no longer use them.
-- 2. Existing claim data must not be dropped. Preserve all note, version,
--    command-ledger, claim, and material marketing-event history.
-- 3. Only when no claim or command data has ever existed may a reviewed forward migration
--    remove these objects. Never edit this applied migration.

CREATE FUNCTION public.is_valid_douyin_material_note_content_blocks(
  p_blocks jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  block jsonb;
BEGIN
  IF p_blocks IS NULL
    OR jsonb_typeof(p_blocks) <> 'array'
    OR jsonb_array_length(p_blocks) > 100
    OR pg_column_size(p_blocks) > 524288
    OR octet_length(convert_to(p_blocks::text, 'UTF8')) > 524288
  THEN
    RETURN false;
  END IF;

  FOR block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    IF jsonb_typeof(block) <> 'object'
      OR jsonb_typeof(block -> 'type') <> 'string'
    THEN
      RETURN false;
    END IF;

    CASE block ->> 'type'
      WHEN 'paragraph' THEN
        IF NOT (block ?& ARRAY['type', 'text'])
          OR block - ARRAY['type', 'text']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 20000
        THEN
          RETURN false;
        END IF;
      WHEN 'heading' THEN
        IF NOT (block ?& ARRAY['type', 'level', 'text'])
          OR block - ARRAY['type', 'level', 'text']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'level') <> 'number'
          OR block ->> 'level' NOT IN ('2', '3')
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 300
        THEN
          RETURN false;
        END IF;
      WHEN 'quote' THEN
        IF NOT (block ?& ARRAY['type', 'text'])
          OR block - ARRAY['type', 'text', 'attribution']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 20000
          OR (
            block ? 'attribution'
            AND (
              jsonb_typeof(block -> 'attribution') <> 'string'
              OR char_length(btrim(block ->> 'attribution')) NOT BETWEEN 1 AND 300
            )
          )
        THEN
          RETURN false;
        END IF;
      WHEN 'list' THEN
        IF NOT (block ?& ARRAY['type', 'style', 'items'])
          OR block - ARRAY['type', 'style', 'items']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'style') <> 'string'
          OR block ->> 'style' NOT IN ('ordered', 'unordered')
          OR jsonb_typeof(block -> 'items') <> 'array'
          OR jsonb_array_length(block -> 'items') NOT BETWEEN 1 AND 50
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(block -> 'items') AS item(value)
            WHERE jsonb_typeof(item.value) <> 'string'
              OR char_length(btrim(item.value #>> '{}')) NOT BETWEEN 1 AND 2000
          )
        THEN
          RETURN false;
        END IF;
      WHEN 'callout' THEN
        IF NOT (block ?& ARRAY['type', 'tone', 'title', 'text'])
          OR block - ARRAY['type', 'tone', 'title', 'text']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'tone') <> 'string'
          OR block ->> 'tone' NOT IN ('info', 'warning')
          OR jsonb_typeof(block -> 'title') <> 'string'
          OR char_length(btrim(block ->> 'title')) NOT BETWEEN 1 AND 300
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 20000
        THEN
          RETURN false;
        END IF;
      ELSE
        RETURN false;
    END CASE;
  END LOOP;

  RETURN true;
END;
$function$;

CREATE FUNCTION public.remove_douyin_material_note_claim(
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_claim record;
BEGIN
  IF p_tenant_id IS NULL OR p_douyin_miniapp_installation_id IS NULL
    OR p_claim_id IS NULL OR p_subject_hash IS NULL
    OR p_subject_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_INSTALLATION_NOT_ACTIVE';
  END IF;

  SELECT claim.* INTO v_claim
  FROM public.douyin_material_note_claims AS claim
  WHERE claim.id = p_claim_id
    AND claim.tenant_id = p_tenant_id
    AND claim.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND claim.subject_hash = p_subject_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_CLAIM_NOT_FOUND';
  END IF;
  IF v_claim.removed_at IS NULL THEN
    UPDATE public.douyin_material_note_claims
    SET removed_at = clock_timestamp()
    WHERE id = v_claim.id;
  END IF;
  RETURN jsonb_build_object('removed', true);
END;
$function$;

CREATE FUNCTION public.clear_douyin_material_note_claims(
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_removed_count integer;
BEGIN
  IF p_tenant_id IS NULL OR p_douyin_miniapp_installation_id IS NULL
    OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_INSTALLATION_NOT_ACTIVE';
  END IF;

  UPDATE public.douyin_material_note_claims
  SET removed_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id
    AND douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND subject_hash = p_subject_hash
    AND removed_at IS NULL;
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;
  RETURN jsonb_build_object('removed_count', v_removed_count);
END;
$function$;

CREATE FUNCTION public.erase_douyin_material_note_subject_data(
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_deleted_claim_count integer;
  v_deleted_event_count integer;
BEGIN
  IF p_tenant_id IS NULL OR p_douyin_miniapp_installation_id IS NULL
    OR p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_FOUND';
  END IF;
  PERFORM 1 FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_INSTALLATION_NOT_FOUND';
  END IF;

  DELETE FROM public.douyin_material_note_claims AS claim
  WHERE claim.tenant_id = p_tenant_id
    AND claim.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND claim.subject_hash = p_subject_hash;
  GET DIAGNOSTICS v_deleted_claim_count = ROW_COUNT;

  DELETE FROM public.marketing_events AS event
  WHERE event.source = 'douyin_miniapp'
    AND event.event_name IN ('material_preview', 'material_claim', 'material_copy', 'material_budget_click', 'material_lead_click')
    AND event.tenant_id = p_tenant_id
    AND event.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND event.subject_hash = p_subject_hash;
  GET DIAGNOSTICS v_deleted_event_count = ROW_COUNT;
  RETURN jsonb_build_object(
    'deleted_claim_count', v_deleted_claim_count,
    'deleted_event_count', v_deleted_event_count
  );
END;
$function$;

CREATE FUNCTION public.execute_douyin_material_note_state_command(
  p_tenant_id uuid,
  p_note_id uuid,
  p_actor_employee_id uuid,
  p_command text,
  p_target_version_id uuid,
  p_expected_status text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_note record;
  v_event record;
  v_target record;
  v_reason text;
  v_request_digest text;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  v_reason := CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END;
  IF p_tenant_id IS NULL OR p_note_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR p_command IS NULL
    OR p_command NOT IN ('publish', 'archive', 'withdraw')
    OR p_expected_status IS NULL
    OR p_expected_status NOT IN ('draft', 'published', 'archived', 'withdrawn')
    OR (p_command = 'publish' AND (p_target_version_id IS NULL OR p_reason IS NOT NULL))
    OR (p_command IN ('archive', 'withdraw') AND (
      p_target_version_id IS NOT NULL OR v_reason IS NULL
      OR char_length(v_reason) NOT BETWEEN 1 AND 1000
    ))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;

  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_ACTOR_NOT_ACTIVE';
  END IF;

  v_request_digest := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'note_id', p_note_id,
    'actor_employee_id', p_actor_employee_id,
    'command', p_command,
    'target_version_id', p_target_version_id,
    'expected_status', p_expected_status,
    'reason', v_reason,
    'idempotency_key', p_idempotency_key
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':' || p_idempotency_key::text, 0
  ));
  SELECT event.* INTO v_event
  FROM public.douyin_material_note_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.request_digest IS DISTINCT FROM v_request_digest
      OR v_event.command IS DISTINCT FROM p_command
      OR v_event.note_id IS DISTINCT FROM p_note_id
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result;
  END IF;

  SELECT note.* INTO v_note
  FROM public.douyin_material_notes AS note
  WHERE note.id = p_note_id AND note.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_NOT_FOUND';
  END IF;
  IF v_note.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_STATE_CONFLICT';
  END IF;
  IF v_note.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_WITHDRAWN';
  END IF;
  IF NOT (
    (v_note.status = 'draft' AND p_command IN ('publish', 'archive'))
    OR (v_note.status = 'published' AND p_command IN ('publish', 'archive', 'withdraw'))
    OR (v_note.status = 'archived' AND p_command IN ('publish', 'withdraw'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_STATE_CONFLICT';
  END IF;

  IF p_command = 'publish' THEN
    SELECT version.* INTO v_target
    FROM public.douyin_material_note_versions AS version
    WHERE version.id = p_target_version_id
      AND version.note_id = p_note_id
      AND version.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_VERSION_CONFLICT';
    END IF;
    UPDATE public.douyin_material_notes
    SET status = 'published', published_version_id = v_target.id,
      published_at = v_now, updated_by = p_actor_employee_id, updated_at = v_now
    WHERE id = p_note_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_note;
  ELSIF p_command = 'archive' THEN
    UPDATE public.douyin_material_notes
    SET status = 'archived', updated_by = p_actor_employee_id, updated_at = v_now
    WHERE id = p_note_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_note;
  ELSE
    UPDATE public.douyin_material_notes
    SET status = 'withdrawn', updated_by = p_actor_employee_id, updated_at = v_now
    WHERE id = p_note_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_note;
  END IF;

  v_result := jsonb_build_object(
    'note_id', v_note.id,
    'status', v_note.status,
    'published_version_id', v_note.published_version_id,
    'published_at', v_note.published_at
  );
  INSERT INTO public.douyin_material_note_command_events (
    tenant_id, idempotency_key, note_id, command, request_digest,
    reason, result, created_by, created_at
  ) VALUES (
    p_tenant_id, p_idempotency_key, p_note_id, p_command, v_request_digest,
    v_reason, v_result, p_actor_employee_id, v_now
  );
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.claim_douyin_material_note(
  p_tenant_id uuid,
  p_douyin_miniapp_installation_id uuid,
  p_subject_hash text,
  p_note_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_note record;
  v_claim record;
  v_version record;
  v_now timestamptz := clock_timestamp();
  v_already_claimed boolean := false;
  v_write_event boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_douyin_miniapp_installation_id IS NULL
    OR p_note_id IS NULL OR p_subject_hash IS NULL
    OR p_subject_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_INSTALLATION_NOT_ACTIVE';
  END IF;

  SELECT note.* INTO v_note
  FROM public.douyin_material_notes AS note
  WHERE note.id = p_note_id AND note.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_NOT_AVAILABLE';
  END IF;
  IF v_note.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_WITHDRAWN';
  END IF;

  SELECT claim.* INTO v_claim
  FROM public.douyin_material_note_claims AS claim
  WHERE claim.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND claim.tenant_id = p_tenant_id
    AND claim.subject_hash = p_subject_hash
    AND claim.note_id = p_note_id
  FOR UPDATE;
  IF FOUND AND v_claim.removed_at IS NULL THEN
    v_already_claimed := true;
  ELSE
    IF v_note.status <> 'published' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_NOT_AVAILABLE';
    END IF;
    IF FOUND THEN
      UPDATE public.douyin_material_note_claims
      SET removed_at = NULL, claimed_version_id = v_note.published_version_id,
        claimed_at = v_now, tenant_id = p_tenant_id
      WHERE id = v_claim.id
      RETURNING * INTO v_claim;
      v_write_event := true;
    ELSE
      INSERT INTO public.douyin_material_note_claims (
        tenant_id, douyin_miniapp_installation_id, subject_hash,
        note_id, claimed_version_id, claimed_at
      ) VALUES (
        p_tenant_id, p_douyin_miniapp_installation_id, p_subject_hash,
        p_note_id, v_note.published_version_id, v_now
      ) RETURNING * INTO v_claim;
      v_write_event := true;
    END IF;
  END IF;

  SELECT version.* INTO v_version
  FROM public.douyin_material_note_versions AS version
  WHERE version.id = v_claim.claimed_version_id
    AND version.note_id = p_note_id
    AND version.tenant_id = p_tenant_id;

  IF v_write_event THEN
    INSERT INTO public.marketing_events (
      tenant_id, douyin_miniapp_installation_id, source, subject_hash,
      event_name, payload, created_at
    ) VALUES (
      p_tenant_id, p_douyin_miniapp_installation_id, 'douyin_miniapp',
      p_subject_hash, 'material_claim', jsonb_build_object(
        'note_id', p_note_id,
        'claim_id', v_claim.id,
        'version', v_version.version_no
      ), v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'claim_id', v_claim.id,
    'already_claimed', v_already_claimed,
    'claimed_at', v_claim.claimed_at,
    'material', jsonb_build_object(
      'id', p_note_id,
      'version', v_version.version_no,
      'title', v_version.title,
      'summary', v_version.summary,
      'category', v_version.category,
      'applicable_to', v_version.applicable_to,
      'content_blocks', v_version.content_blocks
    )
  );
END;
$function$;

CREATE TABLE public.douyin_material_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  published_version_id uuid NULL,
  published_at timestamptz NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  CONSTRAINT douyin_material_notes_created_by_tenant_fkey
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_notes_updated_by_tenant_fkey
    FOREIGN KEY (updated_by, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_notes_status_check
    CHECK (status IN ('draft', 'published', 'archived', 'withdrawn')),
  CONSTRAINT douyin_material_notes_publication_shape_check CHECK (
    (status = 'draft' AND published_version_id IS NULL AND published_at IS NULL)
    OR (status = 'published' AND published_version_id IS NOT NULL AND published_at IS NOT NULL)
    OR (
      status IN ('archived', 'withdrawn')
      AND (
        (published_version_id IS NULL AND published_at IS NULL)
        OR (published_version_id IS NOT NULL AND published_at IS NOT NULL)
      )
    )
  )
);

CREATE TABLE public.douyin_material_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  note_id uuid NOT NULL,
  version_no integer NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL,
  applicable_to text NULL,
  content_blocks jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, version_no),
  UNIQUE (id, note_id, tenant_id),
  CONSTRAINT douyin_material_note_versions_note_tenant_fkey
    FOREIGN KEY (note_id, tenant_id)
    REFERENCES public.douyin_material_notes(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_versions_created_by_tenant_fkey
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_versions_version_no_check CHECK (version_no > 0),
  CONSTRAINT douyin_material_note_versions_title_check
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT douyin_material_note_versions_summary_check
    CHECK (char_length(btrim(summary)) BETWEEN 1 AND 1000),
  CONSTRAINT douyin_material_note_versions_category_check
    CHECK (char_length(btrim(category)) BETWEEN 1 AND 100),
  CONSTRAINT douyin_material_note_versions_applicable_to_check
    CHECK (applicable_to IS NULL OR char_length(btrim(applicable_to)) BETWEEN 1 AND 300),
  CONSTRAINT douyin_material_note_versions_content_blocks_check
    CHECK (public.is_valid_douyin_material_note_content_blocks(content_blocks))
);

ALTER TABLE public.douyin_material_notes
ADD CONSTRAINT douyin_material_notes_published_version_owner_fkey
FOREIGN KEY (published_version_id, id, tenant_id)
REFERENCES public.douyin_material_note_versions(id, note_id, tenant_id)
ON DELETE RESTRICT;

CREATE FUNCTION public.protect_douyin_material_note_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'douyin_material_note_versions' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_VERSION_IMMUTABLE';
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_COMMAND_EVENT_IMMUTABLE';
END;
$function$;

CREATE TRIGGER material_note_version_immutable
BEFORE UPDATE OR DELETE ON public.douyin_material_note_versions
FOR EACH ROW EXECUTE FUNCTION public.protect_douyin_material_note_immutable_row();

CREATE FUNCTION public.prevent_douyin_material_note_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_DELETE_FORBIDDEN';
END;
$function$;

CREATE TRIGGER material_note_delete_forbidden
BEFORE DELETE ON public.douyin_material_notes
FOR EACH ROW EXECUTE FUNCTION public.prevent_douyin_material_note_delete();

CREATE TABLE public.douyin_material_note_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  douyin_miniapp_installation_id uuid NOT NULL,
  subject_hash text NOT NULL,
  note_id uuid NOT NULL,
  claimed_version_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,
  UNIQUE (douyin_miniapp_installation_id, subject_hash, note_id),
  UNIQUE (id, tenant_id),
  CONSTRAINT douyin_material_note_claims_subject_hash_check
    CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_material_note_claims_installation_tenant_fkey
    FOREIGN KEY (douyin_miniapp_installation_id, tenant_id)
    REFERENCES public.douyin_miniapp_installations(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_claims_note_tenant_fkey
    FOREIGN KEY (note_id, tenant_id)
    REFERENCES public.douyin_material_notes(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_claims_version_owner_fkey
    FOREIGN KEY (claimed_version_id, note_id, tenant_id)
    REFERENCES public.douyin_material_note_versions(id, note_id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE public.douyin_material_note_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  note_id uuid NOT NULL,
  command text NOT NULL,
  request_digest text NOT NULL,
  reason text NULL,
  result jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (id, tenant_id),
  CONSTRAINT douyin_material_note_command_events_command_check
    CHECK (command IN ('publish', 'archive', 'withdraw')),
  CONSTRAINT douyin_material_note_command_events_digest_check
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_material_note_command_events_reason_check
    CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 1000),
  CONSTRAINT douyin_material_note_command_events_result_check
    CHECK (jsonb_typeof(result) = 'object'),
  CONSTRAINT douyin_material_note_command_events_note_tenant_fkey
    FOREIGN KEY (note_id, tenant_id)
    REFERENCES public.douyin_material_notes(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_command_events_created_by_tenant_fkey
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT
);

CREATE TRIGGER material_note_command_event_immutable
BEFORE UPDATE OR DELETE ON public.douyin_material_note_command_events
FOR EACH ROW EXECUTE FUNCTION public.protect_douyin_material_note_immutable_row();

CREATE INDEX douyin_material_notes_public_idx
ON public.douyin_material_notes(tenant_id, status, published_at DESC, id DESC);
CREATE INDEX douyin_material_notes_tenant_idx
ON public.douyin_material_notes(tenant_id, updated_at DESC, id DESC);
CREATE INDEX douyin_material_note_claims_owned_idx
ON public.douyin_material_note_claims(
  douyin_miniapp_installation_id, subject_hash, claimed_at DESC, id DESC
)
WHERE removed_at IS NULL;
CREATE INDEX douyin_material_note_versions_tenant_note_idx
ON public.douyin_material_note_versions(tenant_id, note_id, version_no DESC);
CREATE INDEX douyin_material_note_versions_title_trgm_idx
ON public.douyin_material_note_versions USING GIN (title extensions.gin_trgm_ops);
CREATE INDEX douyin_material_note_versions_summary_trgm_idx
ON public.douyin_material_note_versions USING GIN (summary extensions.gin_trgm_ops);
CREATE INDEX douyin_material_note_versions_category_trgm_idx
ON public.douyin_material_note_versions USING GIN (category extensions.gin_trgm_ops);

ALTER TABLE public.douyin_material_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_material_note_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_material_note_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_material_note_command_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_material_notes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_material_note_versions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_material_note_claims FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_material_note_command_events FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.douyin_material_notes TO service_role;
GRANT SELECT ON TABLE public.douyin_material_note_versions TO service_role;
GRANT SELECT ON TABLE public.douyin_material_note_claims TO service_role;
GRANT SELECT ON TABLE public.douyin_material_note_command_events TO service_role;

ALTER TABLE public.marketing_events
DROP CONSTRAINT IF EXISTS marketing_events_event_name_check;
ALTER TABLE public.marketing_events
ADD CONSTRAINT marketing_events_event_name_check CHECK (
  event_name IN (
    'page_view', 'button_click', 'phone_click', 'form_submit', 'app_launch',
    'case_view', 'site_view', 'lead_cta_click', 'sms_send', 'lead_submit',
    'lead_submit_success', 'phone_call_click', 'material_preview',
    'material_claim', 'material_copy', 'material_budget_click',
    'material_lead_click'
  )
);

INSERT INTO public.permissions (
  code, name, module, resource, action, description, status
)
VALUES
  ('douyin_material_note.read', '查看抖音资料', 'douyin_miniapp', 'douyin_material_note', 'read', '查看抖音小程序资料笔记', 'active'),
  ('douyin_material_note.manage', '管理抖音资料', 'douyin_miniapp', 'douyin_material_note', 'manage', '创建和编辑抖音小程序资料笔记', 'active'),
  ('douyin_material_note.publish', '发布抖音资料', 'douyin_miniapp', 'douyin_material_note', 'publish', '发布、归档和撤回抖音小程序资料笔记', 'active')
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
JOIN public.tenants AS tenants ON tenants.id = roles.tenant_id
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'douyin_material_note.read',
    'douyin_material_note.manage',
    'douyin_material_note.publish'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
  AND roles.status = 'active'
  AND tenants.status = 'active'
  AND permissions.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE FUNCTION public.create_douyin_material_note(
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_title text,
  p_summary text,
  p_category text,
  p_applicable_to text,
  p_content_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_note_id uuid;
  v_version_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_employee_id IS NULL
    OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 300
    OR p_summary IS NULL OR char_length(btrim(p_summary)) NOT BETWEEN 1 AND 1000
    OR p_category IS NULL OR char_length(btrim(p_category)) NOT BETWEEN 1 AND 100
    OR (p_applicable_to IS NOT NULL AND char_length(btrim(p_applicable_to)) NOT BETWEEN 1 AND 300)
    OR NOT public.is_valid_douyin_material_note_content_blocks(p_content_blocks)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;

  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_ACTOR_NOT_ACTIVE';
  END IF;

  INSERT INTO public.douyin_material_notes (tenant_id, created_by, updated_by)
  VALUES (p_tenant_id, p_actor_employee_id, p_actor_employee_id)
  RETURNING id INTO v_note_id;
  INSERT INTO public.douyin_material_note_versions (
    tenant_id, note_id, version_no, title, summary, category,
    applicable_to, content_blocks, created_by
  ) VALUES (
    p_tenant_id, v_note_id, 1, btrim(p_title), btrim(p_summary),
    btrim(p_category), CASE WHEN p_applicable_to IS NULL THEN NULL ELSE btrim(p_applicable_to) END,
    p_content_blocks, p_actor_employee_id
  ) RETURNING id INTO v_version_id;

  RETURN jsonb_build_object('note_id', v_note_id, 'version_id', v_version_id,
    'version_no', 1, 'status', 'draft');
END;
$function$;

CREATE FUNCTION public.append_douyin_material_note_version(
  p_tenant_id uuid,
  p_note_id uuid,
  p_actor_employee_id uuid,
  p_title text,
  p_summary text,
  p_category text,
  p_applicable_to text,
  p_content_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_note public.douyin_material_notes%ROWTYPE;
  v_version_id uuid;
  v_version_no integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_tenant_id IS NULL OR p_note_id IS NULL OR p_actor_employee_id IS NULL
    OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 300
    OR p_summary IS NULL OR char_length(btrim(p_summary)) NOT BETWEEN 1 AND 1000
    OR p_category IS NULL OR char_length(btrim(p_category)) NOT BETWEEN 1 AND 100
    OR (p_applicable_to IS NOT NULL AND char_length(btrim(p_applicable_to)) NOT BETWEEN 1 AND 300)
    OR NOT public.is_valid_douyin_material_note_content_blocks(p_content_blocks)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_ACTOR_NOT_ACTIVE';
  END IF;

  SELECT note.* INTO v_note
  FROM public.douyin_material_notes AS note
  WHERE note.id = p_note_id AND note.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_NOT_FOUND';
  END IF;
  IF v_note.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_WITHDRAWN';
  END IF;

  SELECT coalesce(max(version.version_no), 0) + 1 INTO v_version_no
  FROM public.douyin_material_note_versions AS version
  WHERE version.note_id = p_note_id;
  INSERT INTO public.douyin_material_note_versions (
    tenant_id, note_id, version_no, title, summary, category,
    applicable_to, content_blocks, created_by
  ) VALUES (
    p_tenant_id, p_note_id, v_version_no, btrim(p_title), btrim(p_summary),
    btrim(p_category), CASE WHEN p_applicable_to IS NULL THEN NULL ELSE btrim(p_applicable_to) END,
    p_content_blocks, p_actor_employee_id
  ) RETURNING id INTO v_version_id;
  UPDATE public.douyin_material_notes
  SET updated_by = p_actor_employee_id, updated_at = v_now
  WHERE id = p_note_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('note_id', p_note_id, 'version_id', v_version_id,
    'version_no', v_version_no, 'status', v_note.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_material_note_content_blocks(jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_douyin_material_note_immutable_row()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_douyin_material_note_delete()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_douyin_material_note(uuid, uuid, text, text, text, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.append_douyin_material_note_version(uuid, uuid, uuid, text, text, text, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.execute_douyin_material_note_state_command(uuid, uuid, uuid, text, uuid, text, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_douyin_material_note(uuid, uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_douyin_material_note_claim(uuid, uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_douyin_material_note_claims(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.erase_douyin_material_note_subject_data(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_douyin_material_note(uuid, uuid, text, text, text, text, jsonb)
TO service_role;
GRANT EXECUTE ON FUNCTION public.append_douyin_material_note_version(uuid, uuid, uuid, text, text, text, text, jsonb)
TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_douyin_material_note_state_command(uuid, uuid, uuid, text, uuid, text, text, uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_douyin_material_note(uuid, uuid, text, uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_douyin_material_note_claim(uuid, uuid, text, uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_douyin_material_note_claims(uuid, uuid, text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.erase_douyin_material_note_subject_data(uuid, uuid, text)
TO service_role;

COMMENT ON TABLE public.douyin_material_notes IS
  '抖音小程序租户资料笔记状态与当前发布版本指针。';
COMMENT ON TABLE public.douyin_material_note_versions IS
  '抖音资料笔记不可变内容版本。';
COMMENT ON TABLE public.douyin_material_note_claims IS
  '抖音小程序主体领取资料时锁定的内容版本。';
COMMENT ON TABLE public.douyin_material_note_command_events IS
  '抖音资料发布、归档和撤回命令的不可变幂等账本。';

COMMIT;
