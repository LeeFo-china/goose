-- Durable, fenced customer-rendering work. Provider submission is synchronous and
-- has no recoverable task ID: an expired submitted attempt needs human review.
-- Rollback: disable the worker/admission switches and reconcile reservations;
-- preserve jobs, attempts and result facts, then repair through a forward migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.customer_rendering_jobs
  ADD COLUMN attempt_id uuid,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN provider_state text NOT NULL DEFAULT 'not_started'
    CHECK (provider_state IN ('not_started', 'intent_recorded', 'response_received', 'uncertain')),
  ADD COLUMN provider_request_id text,
  ADD COLUMN result_bucket text,
  ADD COLUMN result_region text,
  ADD COLUMN result_object_key text,
  ADD COLUMN result_sha256 text CHECK (result_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN result_size_bytes integer CHECK (result_size_bytes BETWEEN 1 AND 10485760),
  ADD COLUMN output_review_decision text CHECK (output_review_decision IN ('approved', 'rejected', 'manual')),
  ADD COLUMN output_review_request_id text,
  ADD COLUMN output_review_raw_result integer,
  ADD COLUMN output_reviewed_at timestamptz,
  ADD COLUMN failure_code text,
  ADD COLUMN finished_at timestamptz,
  ADD CONSTRAINT customer_rendering_jobs_result_complete_check CHECK (
    (result_bucket IS NULL AND result_region IS NULL AND result_object_key IS NULL
      AND result_sha256 IS NULL AND result_size_bytes IS NULL)
    OR (result_bucket IS NOT NULL AND result_region IS NOT NULL AND result_object_key IS NOT NULL
      AND result_sha256 IS NOT NULL AND result_size_bytes IS NOT NULL)
  ),
  ADD CONSTRAINT customer_rendering_jobs_success_review_check CHECK (
    status <> 'succeeded' OR (output_review_decision = 'approved'
      AND output_reviewed_at IS NOT NULL AND result_object_key IS NOT NULL)
  ),
  ADD CONSTRAINT customer_rendering_jobs_processing_lease_check CHECK (
    status <> 'processing' OR (attempt_id IS NOT NULL AND lease_expires_at IS NOT NULL)
  );

CREATE UNIQUE INDEX customer_rendering_jobs_result_key_idx
  ON public.customer_rendering_jobs (result_bucket, result_region, result_object_key)
  WHERE result_object_key IS NOT NULL;
CREATE INDEX customer_rendering_jobs_claim_idx
  ON public.customer_rendering_jobs (lease_expires_at, created_at, id)
  WHERE status = 'processing';

CREATE TABLE public.customer_rendering_job_attempts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  state text NOT NULL DEFAULT 'preparing' CHECK (state IN
    ('preparing', 'submitted', 'response_received', 'abandoned', 'review_required', 'completed')),
  model_code text,
  provider_request_id text,
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT customer_rendering_job_attempts_job_fkey FOREIGN KEY (tenant_id, job_id)
    REFERENCES public.customer_rendering_jobs (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_job_attempts_number_key UNIQUE (tenant_id, job_id, attempt_number)
);
CREATE INDEX customer_rendering_job_attempts_job_idx
  ON public.customer_rendering_job_attempts (tenant_id, job_id, started_at DESC);
CREATE TRIGGER tr_customer_rendering_job_attempts_updated_at
  BEFORE UPDATE ON public.customer_rendering_job_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.customer_rendering_job_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_rendering_job_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.customer_rendering_job_attempts TO service_role;

CREATE FUNCTION public.claim_customer_rendering_job(p_lease_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.customer_rendering_jobs%ROWTYPE;
  v_input public.customer_rendering_inputs%ROWTYPE;
  v_attempt_id uuid;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  -- Expired pre-submit work is safe to retry; a submitted request never is.
  SELECT * INTO v_job FROM public.customer_rendering_jobs
  WHERE status = 'queued'
  ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    SELECT * INTO v_job FROM public.customer_rendering_jobs
    WHERE status = 'processing' AND provider_state = 'not_started'
      AND lease_expires_at < clock_timestamp() AND attempt_count < 3
    ORDER BY lease_expires_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'empty'); END IF;

  IF v_job.attempt_id IS NOT NULL THEN
    UPDATE public.customer_rendering_job_attempts
    SET state = 'abandoned', finished_at = clock_timestamp(), failure_code = 'PRE_SUBMIT_LEASE_EXPIRED'
    WHERE id = v_job.attempt_id AND state = 'preparing';
  END IF;
  v_attempt_id := gen_random_uuid();
  INSERT INTO public.customer_rendering_job_attempts (id, tenant_id, job_id, attempt_number)
  VALUES (v_attempt_id, v_job.tenant_id, v_job.id, v_job.attempt_count + 1);
  UPDATE public.customer_rendering_jobs
  SET status = 'processing', attempt_id = v_attempt_id, attempt_count = attempt_count + 1,
    provider_state = 'not_started', lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  WHERE id = v_job.id;

  SELECT * INTO v_input FROM public.customer_rendering_inputs
  WHERE tenant_id = v_job.tenant_id AND id = v_job.room_file_id;
  RETURN jsonb_build_object('decision', 'claimed', 'job_id', v_job.id, 'attempt_id', v_attempt_id,
    'tenant_id', v_job.tenant_id, 'style_asset_id', v_job.style_asset_id,
    'space', v_job.space, 'mode', v_job.mode,
    'keep_notes', v_job.keep_notes, 'style_snapshot', v_job.style_snapshot,
    'room', jsonb_build_object('file_id', v_input.id, 'bucket', v_input.bucket,
      'region', v_input.region, 'object_key', v_input.normalized_object_key,
      'size_bytes', v_input.normalized_size_bytes, 'sha256', v_input.checksum));
END;
$$;

CREATE FUNCTION public.mark_customer_rendering_job_submitted(
  p_job_id uuid, p_attempt_id uuid, p_model_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_job public.customer_rendering_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_attempt_id IS NULL OR nullif(btrim(p_model_code), '') IS NULL
    OR char_length(p_model_code) > 120 THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs
  WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempt_id <> p_attempt_id
    OR v_job.lease_expires_at <= clock_timestamp() OR v_job.provider_state <> 'not_started' THEN
    RETURN jsonb_build_object('decision', 'stale');
  END IF;
  UPDATE public.customer_rendering_job_attempts SET state = 'submitted', model_code = p_model_code
  WHERE id = p_attempt_id AND state = 'preparing';
  UPDATE public.customer_rendering_jobs SET provider_state = 'intent_recorded' WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'submitted');
END;
$$;

CREATE FUNCTION public.record_customer_rendering_job_result(
  p_job_id uuid, p_attempt_id uuid, p_provider_request_id text,
  p_bucket text, p_region text, p_object_key text, p_sha256 text, p_size_bytes integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_job public.customer_rendering_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_attempt_id IS NULL OR nullif(btrim(p_bucket), '') IS NULL
    OR nullif(btrim(p_region), '') IS NULL OR nullif(btrim(p_object_key), '') IS NULL
    OR p_object_key !~ ('^private/customer-rendering-results/[0-9a-f-]{36}/' || p_job_id::text || '/' || p_attempt_id::text || '/result.webp$')
    OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
    OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 10485760
    OR char_length(coalesce(p_provider_request_id, '')) > 200 THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempt_id <> p_attempt_id
    OR v_job.lease_expires_at <= clock_timestamp() OR v_job.provider_state <> 'intent_recorded' THEN
    RETURN jsonb_build_object('decision', 'stale');
  END IF;
  IF v_job.tenant_id::text <> split_part(p_object_key, '/', 3) THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  UPDATE public.customer_rendering_job_attempts
  SET state = 'response_received', provider_request_id = p_provider_request_id
  WHERE id = p_attempt_id AND state = 'submitted';
  UPDATE public.customer_rendering_jobs
  SET provider_state = 'response_received', provider_request_id = p_provider_request_id,
    result_bucket = p_bucket, result_region = p_region, result_object_key = p_object_key,
    result_sha256 = p_sha256, result_size_bytes = p_size_bytes
  WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'recorded');
END;
$$;

CREATE FUNCTION public.mark_customer_rendering_job_review_required(
  p_job_id uuid, p_attempt_id uuid, p_failure_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_job public.customer_rendering_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_attempt_id IS NULL OR nullif(btrim(p_failure_code), '') IS NULL
    OR char_length(p_failure_code) > 120 THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempt_id <> p_attempt_id THEN
    RETURN jsonb_build_object('decision', 'stale');
  END IF;
  UPDATE public.customer_rendering_job_attempts
  SET state = 'review_required', failure_code = p_failure_code, finished_at = clock_timestamp()
  WHERE id = p_attempt_id;
  UPDATE public.customer_rendering_jobs
  SET status = 'review_required', provider_state = CASE WHEN provider_state = 'intent_recorded'
      THEN 'uncertain' ELSE provider_state END,
    lease_expires_at = NULL, failure_code = p_failure_code, finished_at = clock_timestamp()
  WHERE id = p_job_id;
  -- Quota remains reserved until an explicit, audited reconciliation decision.
  RETURN jsonb_build_object('decision', 'review_required');
END;
$$;

CREATE FUNCTION public.record_customer_rendering_job_output_review(
  p_job_id uuid, p_attempt_id uuid, p_decision text,
  p_request_id text, p_raw_result integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_job public.customer_rendering_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_attempt_id IS NULL OR p_decision IS NULL
    OR p_decision NOT IN ('approved', 'rejected', 'manual')
    OR (p_decision <> 'manual' AND nullif(btrim(p_request_id), '') IS NULL)
    OR char_length(coalesce(p_request_id, '')) > 200
    OR (p_decision = 'approved' AND p_raw_result IS DISTINCT FROM 0)
    OR (p_decision = 'rejected' AND p_raw_result IS DISTINCT FROM 1) THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempt_id <> p_attempt_id
    OR v_job.lease_expires_at <= clock_timestamp() OR v_job.provider_state <> 'response_received'
    OR v_job.result_object_key IS NULL OR v_job.output_review_decision IS NOT NULL THEN
    RETURN jsonb_build_object('decision', 'stale');
  END IF;
  UPDATE public.customer_rendering_jobs SET output_review_decision = p_decision,
    output_review_request_id = p_request_id, output_review_raw_result = p_raw_result,
    output_reviewed_at = clock_timestamp() WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'recorded');
END;
$$;

CREATE FUNCTION public.finalize_customer_rendering_job(
  p_job_id uuid, p_attempt_id uuid, p_outcome text, p_failure_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.customer_rendering_jobs%ROWTYPE;
  v_quota jsonb;
  v_settlement text;
BEGIN
  IF p_job_id IS NULL OR p_attempt_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN
    ('approved', 'rejected', 'failed', 'provider_rejected')
    OR char_length(coalesce(p_failure_code, '')) > 120 THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempt_id <> p_attempt_id
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('decision', 'stale');
  END IF;
  IF p_outcome = 'approved' AND (v_job.provider_state <> 'response_received'
    OR v_job.result_object_key IS NULL
    OR v_job.output_review_decision IS DISTINCT FROM 'approved') THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_outcome = 'rejected' AND (v_job.provider_state <> 'response_received'
    OR v_job.output_review_decision IS DISTINCT FROM 'rejected') THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_outcome = 'failed' AND v_job.provider_state <> 'not_started' THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_outcome = 'provider_rejected' AND v_job.provider_state <> 'intent_recorded' THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  v_settlement := CASE WHEN p_outcome = 'approved' THEN 'consume' ELSE 'release' END;
  v_quota := public.settle_customer_rendering_quota(v_job.tenant_id, v_job.id, v_settlement);
  IF (v_quota->>'decision') IS NULL
    OR v_quota->>'decision' NOT IN (v_settlement, 'existing')
    OR v_quota->>'reservation_status' IS DISTINCT FROM
      (CASE WHEN v_settlement = 'consume' THEN 'consumed' ELSE 'released' END) THEN
    RAISE EXCEPTION 'customer rendering quota settlement failed for job %', v_job.id;
  END IF;
  UPDATE public.customer_rendering_job_attempts
  SET state = 'completed', failure_code = p_failure_code, finished_at = clock_timestamp()
  WHERE id = p_attempt_id;
  UPDATE public.customer_rendering_jobs
  SET status = CASE WHEN p_outcome = 'approved' THEN 'succeeded' ELSE 'failed' END,
    actual_cost_fen = CASE WHEN p_outcome = 'failed' THEN 0 ELSE actual_cost_fen END,
    failure_code = p_failure_code, lease_expires_at = NULL, finished_at = clock_timestamp()
  WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'finalized', 'status', CASE WHEN p_outcome = 'approved'
    THEN 'succeeded' ELSE 'failed' END, 'quota', v_quota);
END;
$$;

CREATE FUNCTION public.reconcile_expired_customer_rendering_jobs(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_job public.customer_rendering_jobs%ROWTYPE; v_count integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
    THEN RAISE EXCEPTION 'invalid reconciliation limit'; END IF;
  FOR v_job IN SELECT * FROM public.customer_rendering_jobs
    WHERE status = 'processing' AND lease_expires_at < clock_timestamp()
      AND (provider_state <> 'not_started' OR attempt_count >= 3)
    ORDER BY lease_expires_at, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.customer_rendering_job_attempts
      SET state = 'review_required', failure_code = 'WORKER_LEASE_EXPIRED', finished_at = clock_timestamp()
      WHERE id = v_job.attempt_id;
    UPDATE public.customer_rendering_jobs
      SET status = 'review_required', provider_state = CASE WHEN provider_state = 'intent_recorded'
        THEN 'uncertain' ELSE provider_state END,
        lease_expires_at = NULL, failure_code = 'WORKER_LEASE_EXPIRED', finished_at = clock_timestamp()
      WHERE id = v_job.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE TABLE public.customer_rendering_job_manual_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve_audited', 'release')),
  operator_ref text NOT NULL CHECK (operator_ref ~ '^[A-Za-z0-9._:@/-]{3,120}$'),
  evidence_ref text NOT NULL CHECK (evidence_ref ~ '^[A-Za-z0-9._:@/-]{3,120}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_job_manual_decisions_job_fkey FOREIGN KEY (tenant_id, job_id)
    REFERENCES public.customer_rendering_jobs (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_job_manual_decisions_job_key UNIQUE (tenant_id, job_id)
);
ALTER TABLE public.customer_rendering_job_manual_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_rendering_job_manual_decisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.customer_rendering_job_manual_decisions TO service_role;

-- Operator-only recovery. Never requeue an attempt whose paid outcome might be unknown.
CREATE FUNCTION public.reconcile_customer_rendering_job(
  p_tenant_id uuid, p_job_id uuid, p_decision text,
  p_operator_ref text, p_evidence_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.customer_rendering_jobs%ROWTYPE;
  v_existing public.customer_rendering_job_manual_decisions%ROWTYPE;
  v_settlement text;
  v_quota jsonb;
  v_status text;
BEGIN
  IF p_tenant_id IS NULL OR p_job_id IS NULL OR p_decision IS NULL
    OR p_decision NOT IN ('approve_audited', 'release')
    OR p_operator_ref IS NULL OR p_operator_ref !~ '^[A-Za-z0-9._:@/-]{3,120}$'
    OR p_evidence_ref IS NULL OR p_evidence_ref !~ '^[A-Za-z0-9._:@/-]{3,120}$' THEN
    RETURN jsonb_build_object('decision', 'invalid_request');
  END IF;
  SELECT * INTO v_job FROM public.customer_rendering_jobs
    WHERE tenant_id = p_tenant_id AND id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('decision', 'not_found'); END IF;
  SELECT * INTO v_existing FROM public.customer_rendering_job_manual_decisions
    WHERE tenant_id = p_tenant_id AND job_id = p_job_id;
  IF FOUND THEN
    IF v_existing.decision = p_decision AND v_existing.operator_ref = p_operator_ref
      AND v_existing.evidence_ref = p_evidence_ref THEN
      RETURN jsonb_build_object('decision', 'existing', 'status', v_job.status);
    END IF;
    RETURN jsonb_build_object('decision', 'conflict');
  END IF;
  IF v_job.status <> 'review_required' THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  IF p_decision = 'approve_audited' AND (v_job.output_review_decision IS DISTINCT FROM 'approved'
    OR v_job.output_review_request_id IS NULL OR v_job.result_object_key IS NULL
    OR v_job.result_sha256 IS NULL) THEN
    RETURN jsonb_build_object('decision', 'invalid_state');
  END IF;
  v_settlement := CASE WHEN p_decision = 'approve_audited' THEN 'consume' ELSE 'release' END;
  v_status := CASE WHEN p_decision = 'approve_audited' THEN 'succeeded' ELSE 'failed' END;
  v_quota := public.settle_customer_rendering_quota(p_tenant_id, p_job_id, v_settlement);
  IF (v_quota->>'decision') IS NULL OR v_quota->>'decision' NOT IN (v_settlement, 'existing')
    OR v_quota->>'reservation_status' IS DISTINCT FROM
      (CASE WHEN v_settlement = 'consume' THEN 'consumed' ELSE 'released' END) THEN
    RAISE EXCEPTION 'customer rendering manual settlement failed for job %', p_job_id;
  END IF;
  INSERT INTO public.customer_rendering_job_manual_decisions
    (tenant_id, job_id, decision, operator_ref, evidence_ref)
  VALUES (p_tenant_id, p_job_id, p_decision, p_operator_ref, p_evidence_ref);
  UPDATE public.customer_rendering_job_attempts
    SET state = 'completed', failure_code = CASE WHEN p_decision = 'release'
      THEN 'MANUAL_RELEASE' ELSE NULL END, finished_at = clock_timestamp()
    WHERE id = v_job.attempt_id;
  UPDATE public.customer_rendering_jobs
    SET status = v_status, failure_code = CASE WHEN p_decision = 'release'
      THEN 'MANUAL_RELEASE' ELSE NULL END,
      actual_cost_fen = CASE WHEN p_decision = 'release' AND provider_state = 'not_started'
        THEN 0 ELSE actual_cost_fen END,
      lease_expires_at = NULL, finished_at = clock_timestamp()
    WHERE id = p_job_id;
  RETURN jsonb_build_object('decision', 'reconciled', 'status', v_status, 'quota', v_quota);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_rendering_job(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_customer_rendering_job_submitted(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_customer_rendering_job_result(uuid, uuid, text, text, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_customer_rendering_job_review_required(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_customer_rendering_job_output_review(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_customer_rendering_job(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_expired_customer_rendering_jobs(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_customer_rendering_job(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_customer_rendering_job(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_customer_rendering_job_submitted(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_rendering_job_result(uuid, uuid, text, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_customer_rendering_job_review_required(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_rendering_job_output_review(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_customer_rendering_job(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_customer_rendering_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_rendering_job(uuid, uuid, text, text, text) TO service_role;
COMMIT;
