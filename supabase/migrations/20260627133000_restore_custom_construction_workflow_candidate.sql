DO $$
DECLARE
  v_definition_id uuid := '2c0e27d5-f296-41de-9653-16c5a4f961d8';
  v_definition public.workflow_definitions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_definition
  FROM public.workflow_definitions
  WHERE id = v_definition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Workflow definition % not found; skip restoring construction candidate.',
      v_definition_id;
    RETURN;
  END IF;

  IF v_definition.category <> 'construction' THEN
    RAISE EXCEPTION 'Workflow definition % is %, expected construction.',
      v_definition_id,
      v_definition.category;
  END IF;

  IF v_definition.active_version_id IS NULL THEN
    RAISE EXCEPTION 'Workflow definition % has no active version.',
      v_definition_id;
  END IF;

  UPDATE public.workflow_definitions
  SET status = 'active'
  WHERE id = v_definition_id
    AND status <> 'active';

  INSERT INTO public.workflow_definition_bindings (
    tenant_id,
    subject_type,
    workflow_purpose,
    definition_id,
    selectable,
    is_default
  )
  VALUES (
    v_definition.tenant_id,
    'project',
    'construction',
    v_definition_id,
    true,
    false
  )
  ON CONFLICT (tenant_id, subject_type, workflow_purpose, definition_id)
  DO UPDATE SET
    selectable = true,
    updated_at = now();
END;
$$;
