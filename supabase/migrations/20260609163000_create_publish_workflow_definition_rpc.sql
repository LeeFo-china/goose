CREATE OR REPLACE FUNCTION public.publish_workflow_definition(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_snapshot jsonb,
  p_validation_result jsonb,
  p_published_by uuid,
  p_updated_by uuid
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

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version_number
  FROM public.workflow_versions
  WHERE tenant_id = p_tenant_id
    AND definition_id = p_definition_id;

  INSERT INTO public.workflow_versions (
    tenant_id,
    definition_id,
    version_number,
    status,
    snapshot,
    validation_result,
    published_by
  )
  VALUES (
    p_tenant_id,
    p_definition_id,
    v_next_version_number,
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

COMMENT ON FUNCTION public.publish_workflow_definition(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  uuid
) IS 'Atomically creates a workflow version and activates it on the definition.';
