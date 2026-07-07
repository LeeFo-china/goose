CREATE OR REPLACE FUNCTION public.increment_platform_partner_invite_code_counts(
  p_invite_code_id uuid,
  p_scan_count integer DEFAULT 0,
  p_submitted_count integer DEFAULT 0,
  p_approved_count integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(p_scan_count, 0) < 0
    OR COALESCE(p_submitted_count, 0) < 0
    OR COALESCE(p_approved_count, 0) < 0 THEN
    RAISE EXCEPTION 'invite code count deltas must be non-negative';
  END IF;

  UPDATE public.platform_partner_invite_codes
  SET
    scan_count = scan_count + COALESCE(p_scan_count, 0),
    submitted_count = submitted_count + COALESCE(p_submitted_count, 0),
    approved_count = approved_count + COALESCE(p_approved_count, 0),
    updated_at = now()
  WHERE id = p_invite_code_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform partner invite code not found: %', p_invite_code_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_platform_partner_invite_code_counts(uuid, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_platform_partner_invite_code_counts(uuid, integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.increment_platform_partner_invite_code_counts(uuid, integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_platform_partner_invite_code_counts(uuid, integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.increment_platform_partner_invite_code_counts(uuid, integer, integer, integer)
IS 'Atomically increments city partner invite-code scan, submission, and approval counters.';
