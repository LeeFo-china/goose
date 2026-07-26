-- Rollback: in a new migration, REVOKE and DROP FUNCTION
-- public.create_supplier_onboarding(uuid, text, text, text, text, text, text,
-- uuid, uuid, date, date, text, text, text, integer, uuid, uuid, text).
-- If any supplier was created through this command, first export and reconcile
-- suppliers, supplier_qualifications, supplier_contacts, platform_file_objects,
-- ocr_recognitions, and supplier_command_events rows linked by the returned
-- supplier id before attempting data cleanup.

BEGIN;

CREATE FUNCTION public.create_supplier_onboarding(
  p_supplier_id uuid,
  p_name text,
  p_legal_name text,
  p_unified_social_credit_code text,
  p_supplier_type text,
  p_legal_representative_name text,
  p_registered_address_text text,
  p_license_file_id uuid,
  p_ocr_recognition_id uuid,
  p_license_valid_from date,
  p_license_valid_until date,
  p_primary_contact_name text,
  p_primary_contact_phone text,
  p_primary_contact_email text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_qualification public.supplier_qualifications%ROWTYPE;
  v_contact public.supplier_contacts%ROWTYPE;
  v_file public.platform_file_objects%ROWTYPE;
  v_ocr public.ocr_recognitions%ROWTYPE;
  v_qualification_type public.supplier_qualification_types%ROWTYPE;
  v_credit_code text;
  v_supplier_code text;
  v_request jsonb;
  v_aggregate jsonb;
BEGIN
  IF p_supplier_id IS NULL
    OR p_license_file_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_expected_version IS DISTINCT FROM 0
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VALIDATION_ERROR';
  END IF;

  IF btrim(coalesce(p_name, '')) = ''
    OR btrim(coalesce(p_legal_name, '')) = ''
    OR btrim(coalesce(p_unified_social_credit_code, '')) = ''
    OR btrim(coalesce(p_supplier_type, '')) = ''
    OR btrim(coalesce(p_primary_contact_name, '')) = ''
    OR btrim(coalesce(p_primary_contact_phone, '')) = ''
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VALIDATION_ERROR';
  END IF;

  IF p_license_valid_from IS NOT NULL
    AND p_license_valid_until IS NOT NULL
    AND p_license_valid_until < p_license_valid_from
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VALIDATION_ERROR';
  END IF;

  v_credit_code := upper(btrim(p_unified_social_credit_code));
  IF v_credit_code !~ '^[0-9A-HJ-NPQRTUWXY]{18}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VALIDATION_ERROR';
  END IF;

  v_supplier_code := 'SUP-' ||
    upper(substr(replace(p_supplier_id::text, '-', ''), 1, 12));
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id,
    'name', btrim(p_name),
    'legal_name', btrim(p_legal_name),
    'unified_social_credit_code', v_credit_code,
    'supplier_type', btrim(p_supplier_type),
    'legal_representative_name', nullif(btrim(coalesce(p_legal_representative_name, '')), ''),
    'registered_address_text', nullif(btrim(coalesce(p_registered_address_text, '')), ''),
    'license_file_id', p_license_file_id,
    'ocr_recognition_id', p_ocr_recognition_id,
    'license_valid_from', p_license_valid_from,
    'license_valid_until', p_license_valid_until,
    'primary_contact_name', btrim(p_primary_contact_name),
    'primary_contact_phone', btrim(p_primary_contact_phone),
    'primary_contact_email', nullif(btrim(coalesce(p_primary_contact_email, '')), ''),
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-onboarding:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier'
      OR v_event.command <> 'create_supplier_onboarding'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object('idempotent', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE upper(btrim(supplier.unified_social_credit_code)) = v_credit_code
    LIMIT 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SUPPLIER_IDENTITY_CONFLICT';
  END IF;

  SELECT qualification_type.* INTO v_qualification_type
  FROM public.supplier_qualification_types AS qualification_type
  WHERE qualification_type.code = 'business_license'
    AND qualification_type.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_BUSINESS_LICENSE_TYPE_MISSING';
  END IF;

  SELECT file.* INTO v_file
  FROM public.platform_file_objects AS file
  WHERE file.id = p_license_file_id
    AND file.scene = 'supplier_business_license'
    AND file.visibility = 'private'
    AND file.status = 'active'
    AND file.tenant_id IS NULL
    AND file.owner_type = 'supplier_business_license'
    AND file.owner_id IS NULL
    AND file.deleted_at IS NULL
    AND file.created_by_employee_id = p_actor_employee_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_FILE_INVALID';
  END IF;

  IF p_ocr_recognition_id IS NOT NULL THEN
    SELECT recognition.* INTO v_ocr
    FROM public.ocr_recognitions AS recognition
    WHERE recognition.id = p_ocr_recognition_id
      AND recognition.scope_type = 'platform'
      AND recognition.tenant_id IS NULL
      AND recognition.scene = 'supplier_onboarding'
      AND recognition.document_type = 'business_license'
      AND recognition.file_object_id = p_license_file_id
      AND recognition.actor_employee_id = p_actor_employee_id
      AND recognition.status = 'succeeded'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OCR_RECORD_INVALID';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.suppliers (
      id,
      code,
      name,
      legal_name,
      unified_social_credit_code,
      supplier_type,
      legal_representative_name,
      registered_address_text,
      onboarding_status,
      operational_status,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_supplier_id,
      v_supplier_code,
      btrim(p_name),
      btrim(p_legal_name),
      v_credit_code,
      btrim(p_supplier_type),
      nullif(btrim(coalesce(p_legal_representative_name, '')), ''),
      nullif(btrim(coalesce(p_registered_address_text, '')), ''),
      'draft',
      'active',
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_supplier;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SUPPLIER_IDENTITY_CONFLICT';
  END;

  INSERT INTO public.supplier_qualifications (
    supplier_id,
    qualification_type_id,
    document_file_id,
    certificate_no,
    valid_from,
    valid_until,
    verification_status,
    version,
    created_by_employee_id,
    updated_by_employee_id
  )
  VALUES (
    v_supplier.id,
    v_qualification_type.id,
    p_license_file_id,
    v_credit_code,
    p_license_valid_from,
    p_license_valid_until,
    'pending',
    1,
    p_actor_employee_id,
    p_actor_employee_id
  )
  RETURNING * INTO v_qualification;

  INSERT INTO public.supplier_contacts (
    supplier_id,
    contact_type,
    name,
    phone,
    email,
    is_public,
    is_primary,
    status,
    version,
    created_by_employee_id,
    updated_by_employee_id
  )
  VALUES (
    v_supplier.id,
    'primary',
    btrim(p_primary_contact_name),
    btrim(p_primary_contact_phone),
    nullif(btrim(coalesce(p_primary_contact_email, '')), ''),
    false,
    true,
    'active',
    1,
    p_actor_employee_id,
    p_actor_employee_id
  )
  RETURNING * INTO v_contact;

  UPDATE public.platform_file_objects
  SET owner_type = 'supplier',
    owner_id = v_supplier.id,
    updated_at = now()
  WHERE id = p_license_file_id;

  IF p_ocr_recognition_id IS NOT NULL THEN
    UPDATE public.ocr_recognitions
    SET subject_type = 'supplier',
      subject_id = v_supplier.id,
      updated_at = now()
    WHERE id = p_ocr_recognition_id;
  END IF;

  v_aggregate := jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'version', 1,
    'supplier', to_jsonb(v_supplier),
    'qualification', to_jsonb(v_qualification),
    'primary_contact', to_jsonb(v_contact)
  );

  INSERT INTO public.supplier_command_events (
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    'supplier',
    v_supplier.id,
    'create_supplier_onboarding',
    jsonb_build_object('_request', v_request),
    v_aggregate,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    1
  );

  RETURN v_aggregate;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_onboarding(
  uuid, text, text, text, text, text, text, uuid, uuid,
  date, date, text, text, text, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_supplier_onboarding(
  uuid, text, text, text, text, text, text, uuid, uuid,
  date, date, text, text, text, integer, uuid, uuid, text
) TO service_role;

COMMIT;
