ALTER TABLE public.workflow_versions
ADD COLUMN IF NOT EXISTS version_label text;

ALTER TABLE public.workflow_versions
DROP CONSTRAINT IF EXISTS workflow_versions_version_label_length;

ALTER TABLE public.workflow_versions
ADD CONSTRAINT workflow_versions_version_label_length
CHECK (
  version_label IS NULL
  OR char_length(version_label) <= 80
);

COMMENT ON COLUMN public.workflow_versions.version_label
IS 'Optional human-readable label for a published workflow version.';

CREATE OR REPLACE FUNCTION public.publish_workflow_definition(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_snapshot jsonb,
  p_validation_result jsonb,
  p_published_by uuid,
  p_updated_by uuid,
  p_expected_updated_at timestamptz,
  p_version_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_definition public.workflow_definitions%ROWTYPE;
  v_version public.workflow_versions%ROWTYPE;
  v_next_version_number integer;
BEGIN
  SELECT *
  INTO v_definition
  FROM public.workflow_definitions
  WHERE id = p_definition_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'definition_not_found'
    );
  END IF;

  IF v_definition.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'stale_draft'
    );
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version_number
  FROM public.workflow_versions
  WHERE tenant_id = p_tenant_id
    AND definition_id = p_definition_id;

  INSERT INTO public.workflow_versions (
    tenant_id,
    definition_id,
    version_number,
    version_label,
    status,
    snapshot,
    validation_result,
    published_by
  )
  VALUES (
    p_tenant_id,
    p_definition_id,
    v_next_version_number,
    NULLIF(btrim(p_version_label), ''),
    'published',
    jsonb_set(
      COALESCE(p_snapshot, '{}'::jsonb),
      '{version_number}',
      to_jsonb(v_next_version_number),
      true
    ),
    COALESCE(p_validation_result, '{}'::jsonb),
    p_published_by
  )
  RETURNING *
  INTO v_version;

  UPDATE public.workflow_definitions
  SET
    active_version_id = v_version.id,
    status = 'active',
    updated_by = p_updated_by
  WHERE id = p_definition_id
    AND tenant_id = p_tenant_id
  RETURNING *
  INTO v_definition;

  RETURN jsonb_build_object(
    'ok', true,
    'definition', to_jsonb(v_definition),
    'version', to_jsonb(v_version)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_workflow_definition(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_snapshot jsonb,
  p_validation_result jsonb,
  p_published_by uuid,
  p_updated_by uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.publish_workflow_definition(
    p_tenant_id,
    p_definition_id,
    p_snapshot,
    p_validation_result,
    p_published_by,
    p_updated_by,
    p_expected_updated_at,
    NULL::text
  );
$$;

REVOKE EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz,
  text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz,
  text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz,
  text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz,
  text
) TO service_role;

COMMENT ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz
) IS 'Creates and activates a workflow version without a version label for legacy callers.';

COMMENT ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid,
  timestamptz,
  text
) IS 'Creates and activates a workflow version with an optional human-readable version label.';
