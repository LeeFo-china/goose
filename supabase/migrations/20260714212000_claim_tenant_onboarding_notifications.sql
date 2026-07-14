-- Add tokenized notification leases so only one worker may deliver/finalize an
-- attempt. Rollback: revoke/drop RPCs and the lease index; only remove columns
-- and processing status after all processing rows have been reconciled.

BEGIN;

ALTER TABLE public.tenant_onboarding_notification_deliveries
ADD COLUMN IF NOT EXISTS claim_token uuid NULL,
ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz NULL;

ALTER TABLE public.tenant_onboarding_notification_deliveries
DROP CONSTRAINT IF EXISTS tenant_onboarding_notifications_status_check;

ALTER TABLE public.tenant_onboarding_notification_deliveries
ADD CONSTRAINT tenant_onboarding_notifications_status_check CHECK (
  status IN ('pending', 'processing', 'sent', 'failed')
);

ALTER TABLE public.tenant_onboarding_notification_deliveries
ADD CONSTRAINT tenant_onboarding_notifications_claim_lease_check CHECK (
  (
    status = 'processing'
    AND claim_token IS NOT NULL
    AND claim_expires_at IS NOT NULL
  ) OR (
    status <> 'processing'
    AND claim_token IS NULL
    AND claim_expires_at IS NULL
  )
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_notifications_processing_lease_idx
ON public.tenant_onboarding_notification_deliveries(claim_expires_at, id)
WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.claim_tenant_onboarding_notification(
  p_delivery_id uuid,
  p_application_id uuid,
  p_max_attempts integer,
  p_lease_seconds integer,
  p_now timestamptz
)
RETURNS SETOF public.tenant_onboarding_notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_max_attempts NOT BETWEEN 1 AND 10
    OR p_lease_seconds NOT BETWEEN 30 AND 900
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_NOTIFICATION_CLAIM_INVALID';
  END IF;

  UPDATE public.tenant_onboarding_notification_deliveries AS delivery
  SET status = 'failed',
      last_error = 'TENANT_ONBOARDING_NOTIFICATION_ATTEMPTS_EXHAUSTED',
      claim_token = NULL,
      claim_expires_at = NULL
  WHERE delivery.id = p_delivery_id
    AND delivery.application_id = p_application_id
    AND delivery.status = 'processing'
    AND delivery.claim_expires_at <= p_now
    AND delivery.attempt_count >= p_max_attempts;

  RETURN QUERY
  UPDATE public.tenant_onboarding_notification_deliveries AS delivery
  SET status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      last_error = NULL,
      claim_token = gen_random_uuid(),
      claim_expires_at = p_now + make_interval(secs => p_lease_seconds)
  WHERE delivery.id = p_delivery_id
    AND delivery.application_id = p_application_id
    AND delivery.attempt_count < p_max_attempts
    AND (
      delivery.status IN ('pending', 'failed')
      OR (
        delivery.status = 'processing'
        AND delivery.claim_expires_at <= p_now
      )
    )
  RETURNING delivery.id, delivery.application_id, delivery.application_version,
    delivery.event_type, delivery.channel, delivery.status,
    delivery.attempt_count, delivery.last_error, delivery.sent_at,
    delivery.created_at, delivery.updated_at, delivery.claim_token,
    delivery.claim_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tenant_onboarding_notification_sent(
  p_delivery_id uuid,
  p_application_id uuid,
  p_claim_token uuid,
  p_sent_at timestamptz
)
RETURNS SETOF public.tenant_onboarding_notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tenant_onboarding_notification_deliveries AS delivery
  SET status = 'sent', sent_at = p_sent_at, last_error = NULL,
      claim_token = NULL, claim_expires_at = NULL
  WHERE delivery.id = p_delivery_id
    AND delivery.application_id = p_application_id
    AND delivery.status = 'processing'
    AND delivery.claim_token = p_claim_token
  RETURNING delivery.id, delivery.application_id, delivery.application_version,
    delivery.event_type, delivery.channel, delivery.status,
    delivery.attempt_count, delivery.last_error, delivery.sent_at,
    delivery.created_at, delivery.updated_at, delivery.claim_token,
    delivery.claim_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tenant_onboarding_notification_failed(
  p_delivery_id uuid,
  p_application_id uuid,
  p_claim_token uuid,
  p_last_error text
)
RETURNS SETOF public.tenant_onboarding_notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tenant_onboarding_notification_deliveries AS delivery
  SET status = 'failed', sent_at = NULL, last_error = left(p_last_error, 96),
      claim_token = NULL, claim_expires_at = NULL
  WHERE delivery.id = p_delivery_id
    AND delivery.application_id = p_application_id
    AND delivery.status = 'processing'
    AND delivery.claim_token = p_claim_token
  RETURNING delivery.id, delivery.application_id, delivery.application_version,
    delivery.event_type, delivery.channel, delivery.status,
    delivery.attempt_count, delivery.last_error, delivery.sent_at,
    delivery.created_at, delivery.updated_at, delivery.claim_token,
    delivery.claim_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tenant_onboarding_notification(uuid, uuid, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tenant_onboarding_notification(uuid, uuid, integer, integer, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_tenant_onboarding_notification_sent(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tenant_onboarding_notification_sent(uuid, uuid, uuid, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_tenant_onboarding_notification_failed(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tenant_onboarding_notification_failed(uuid, uuid, uuid, text) TO service_role;

COMMIT;
