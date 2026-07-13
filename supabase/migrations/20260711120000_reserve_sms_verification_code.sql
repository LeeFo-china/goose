CREATE OR REPLACE FUNCTION public.reserve_sms_verification_code(
  p_phone text,
  p_scene text,
  p_code text,
  p_expired_at timestamptz,
  p_since timestamptz,
  p_request_ip text,
  p_request_device text,
  p_request_ip_limit integer
)
RETURNS TABLE (
  reserved boolean,
  reservation_id uuid,
  limited_dimension text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lock_key bigint;
  v_request_ip_count integer;
  v_reservation_id uuid;
BEGIN
  IF p_request_ip_limit IS NULL
    OR p_request_ip_limit < 1
    OR p_request_ip_limit > 100
  THEN
    RAISE EXCEPTION 'p_request_ip_limit must be between 1 and 100'
      USING ERRCODE = '22023';
  END IF;

  FOR v_lock_key IN
    SELECT locks.lock_key
    FROM unnest(ARRAY[
      pg_catalog.hashtextextended('sms:phone:' || p_scene || ':' || p_phone, 0),
      CASE
        WHEN p_request_ip IS NOT NULL THEN
          pg_catalog.hashtextextended('sms:ip:' || p_scene || ':' || p_request_ip, 0)
        ELSE NULL
      END,
      CASE
        WHEN p_request_device IS NOT NULL THEN
          pg_catalog.hashtextextended('sms:device:' || p_scene || ':' || p_request_device, 0)
        ELSE NULL
      END
    ]::bigint[]) AS locks(lock_key)
    WHERE locks.lock_key IS NOT NULL
    GROUP BY locks.lock_key
    ORDER BY locks.lock_key
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.sms_verification_codes AS codes
    WHERE codes.scene = p_scene
      AND codes.phone = p_phone
      AND codes.created_at >= p_since
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'phone'::text;
    RETURN;
  END IF;

  IF p_request_device IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sms_verification_codes AS codes
    WHERE codes.scene = p_scene
      AND codes.request_device = p_request_device
      AND codes.created_at >= p_since
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'request_device'::text;
    RETURN;
  END IF;

  IF p_request_ip IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_request_ip_count
    FROM public.sms_verification_codes AS codes
    WHERE codes.scene = p_scene
      AND codes.request_ip = p_request_ip
      AND codes.created_at >= p_since;

    IF v_request_ip_count >= p_request_ip_limit THEN
      RETURN QUERY SELECT false, NULL::uuid, 'request_ip'::text;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.sms_verification_codes (
    phone,
    scene,
    code,
    status,
    expired_at,
    request_ip,
    request_device
  ) VALUES (
    p_phone,
    p_scene,
    p_code,
    'pending',
    p_expired_at,
    p_request_ip,
    p_request_device
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT true, v_reservation_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_sms_verification_code(
  text, text, text, timestamptz, timestamptz, text, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_sms_verification_code(
  text, text, text, timestamptz, timestamptz, text, text, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sms_verification_code(
  text, text, text, timestamptz, timestamptz, text, text, integer
) TO service_role;
