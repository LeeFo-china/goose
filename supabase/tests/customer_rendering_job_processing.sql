-- Run only against an isolated database with all migrations applied.
BEGIN;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('77777777-7777-4777-8777-777777777777', 'rendering job test', 'rendering-job-test');
INSERT INTO public.tenant_customer_rendering_settings
  (tenant_id, enabled, daily_task_limit, daily_budget_fen, per_job_reserve_fen)
VALUES ('77777777-7777-4777-8777-777777777777', true, 3, 300, 100);
INSERT INTO public.platform_file_objects
  (id, tenant_id, owner_type, scene, bucket, region, object_key,
    mime_type, size_bytes, checksum, visibility, public_url)
VALUES ('77777777-7777-4777-8777-777777777771',
  '77777777-7777-4777-8777-777777777777', 'tenant', 'rendering_style_public',
  'test-bucket-12345', 'ap-beijing',
  'public/renovation-styles/77777777-7777-4777-8777-777777777777/77777777-7777-4777-8777-777777777772/1.webp',
  'image/webp', 100, repeat('a', 64), 'public', 'https://example.test/style.webp');
INSERT INTO public.tenant_rendering_styles
  (id, tenant_id, title, space, style, source_type, rights_confirmed, file_id,
    status, published_title, published_space, published_style,
    published_color_notes, published_material_notes, published_source_type,
    published_file_id, published_version, published_at)
VALUES ('77777777-7777-4777-8777-777777777772',
  '77777777-7777-4777-8777-777777777777', 'test style', 'living_room',
  'modern_simple', 'design', true, '77777777-7777-4777-8777-777777777771',
  'published', 'test style', 'living_room', 'modern_simple', '', '', 'design',
  '77777777-7777-4777-8777-777777777771', 1, now());
INSERT INTO public.customer_rendering_inputs
  (id, tenant_id, channel, subject_key_version, subject_digest,
    purpose, declared_mime_type, declared_size_bytes, bucket, region,
    raw_object_key, normalized_object_key, normalized_size_bytes,
    width, height, checksum, status, expires_at, review_decision, reviewed_at)
VALUES
  ('77777777-7777-4777-8777-777777777773',
    '77777777-7777-4777-8777-777777777777', 'wechat', 1, repeat('b', 64),
    'room', 'image/webp', 100, 'test-bucket-12345', 'ap-beijing',
    'private/customer-rendering-inputs/77777777-7777-4777-8777-777777777777/77777777-7777-4777-8777-777777777773/raw',
    'private/customer-rendering-inputs/77777777-7777-4777-8777-777777777777/77777777-7777-4777-8777-777777777773/normalized.webp',
    100, 100, 100, repeat('c', 64), 'approved', now() + interval '1 day', 'approved', now()),
  ('77777777-7777-4777-8777-777777777774',
    '77777777-7777-4777-8777-777777777777', 'wechat', 1, repeat('d', 64),
    'room', 'image/webp', 100, 'test-bucket-12345', 'ap-beijing',
    'private/customer-rendering-inputs/77777777-7777-4777-8777-777777777777/77777777-7777-4777-8777-777777777774/raw',
    'private/customer-rendering-inputs/77777777-7777-4777-8777-777777777777/77777777-7777-4777-8777-777777777774/normalized.webp',
    100, 100, 100, repeat('e', 64), 'approved', now() + interval '1 day', 'approved', now());

DO $test$
DECLARE
  v_tenant uuid := '77777777-7777-4777-8777-777777777777';
  v_style uuid := '77777777-7777-4777-8777-777777777772';
  v_job uuid;
  v_attempt uuid;
  v_result jsonb;
  v_key text;
BEGIN
  v_result := public.create_customer_rendering_job(v_tenant, 'wechat', 1::smallint,
    repeat('b', 64), NULL, NULL, NULL::smallint, NULL, v_style,
    '77777777-7777-4777-8777-777777777773', NULL, 'living_room',
    'renovation', NULL, '77777777-7777-4777-8777-777777777775', repeat('f', 64));
  IF v_result->>'decision' <> 'created' THEN RAISE EXCEPTION 'admission: %', v_result; END IF;
  v_job := (v_result->>'job_id')::uuid;
  v_result := public.claim_customer_rendering_job(900);
  IF v_result->>'decision' <> 'claimed' OR (v_result->>'job_id')::uuid <> v_job
    THEN RAISE EXCEPTION 'claim: %', v_result; END IF;
  v_attempt := (v_result->>'attempt_id')::uuid;
  IF public.mark_customer_rendering_job_submitted(v_job, v_attempt, 'ark-test')->>'decision' <> 'submitted'
    THEN RAISE EXCEPTION 'submit'; END IF;
  v_key := 'private/customer-rendering-results/' || v_tenant || '/' || v_job || '/' || v_attempt || '/result.webp';
  IF public.record_customer_rendering_job_result(v_job, v_attempt, 'ark-request-test',
    'test-bucket-12345', 'ap-beijing', v_key, repeat('a', 64), 100)->>'decision' <> 'recorded'
    THEN RAISE EXCEPTION 'result'; END IF;
  IF public.finalize_customer_rendering_job(v_job, v_attempt, 'approved', NULL)->>'decision' <> 'invalid_state'
    THEN RAISE EXCEPTION 'approved without CI verdict'; END IF;
  IF public.record_customer_rendering_job_output_review(v_job, v_attempt,
    'approved', 'ci-request-test', NULL)->>'decision' <> 'invalid_request'
    THEN RAISE EXCEPTION 'approved without raw CI result'; END IF;
  IF public.record_customer_rendering_job_output_review(v_job, v_attempt,
    'approved', 'ci-request-test', 0)->>'decision' <> 'recorded'
    THEN RAISE EXCEPTION 'output review'; END IF;
  IF public.finalize_customer_rendering_job(v_job, v_attempt, 'approved', NULL)->>'decision' <> 'finalized'
    THEN RAISE EXCEPTION 'finalize'; END IF;
  IF (SELECT status FROM public.customer_rendering_jobs WHERE id = v_job) <> 'succeeded'
    OR (SELECT status FROM public.customer_rendering_quota_reservations WHERE job_id = v_job) <> 'consumed'
    THEN RAISE EXCEPTION 'terminal state and quota differ'; END IF;

  v_result := public.create_customer_rendering_job(v_tenant, 'wechat', 1::smallint,
    repeat('d', 64), NULL, NULL, NULL::smallint, NULL, v_style,
    '77777777-7777-4777-8777-777777777774', NULL, 'living_room',
    'renovation', NULL, '77777777-7777-4777-8777-777777777776', repeat('f', 64));
  IF v_result->>'decision' <> 'created' THEN RAISE EXCEPTION 'second admission: %', v_result; END IF;
  v_job := (v_result->>'job_id')::uuid;
  v_result := public.claim_customer_rendering_job(900);
  v_attempt := (v_result->>'attempt_id')::uuid;
  IF public.mark_customer_rendering_job_submitted(v_job, v_attempt, 'ark-test')->>'decision' <> 'submitted'
    THEN RAISE EXCEPTION 'second submit'; END IF;
  IF public.mark_customer_rendering_job_review_required(v_job, v_attempt,
    'PROVIDER_TIMEOUT')->>'decision' <> 'review_required'
    THEN RAISE EXCEPTION 'unknown result'; END IF;
  IF (SELECT status FROM public.customer_rendering_jobs WHERE id = v_job) <> 'review_required'
    OR (SELECT status FROM public.customer_rendering_quota_reservations WHERE job_id = v_job) <> 'reserved'
    THEN RAISE EXCEPTION 'unknown result released quota'; END IF;
  IF public.reconcile_customer_rendering_job(v_tenant, v_job, 'approve_audited',
    'ops:reviewer', 'TICKET-123')->>'decision' <> 'invalid_state'
    THEN RAISE EXCEPTION 'manual approval without CI audit'; END IF;
  IF public.reconcile_customer_rendering_job(v_tenant, v_job, 'release',
    'ops:reviewer', 'TICKET-123')->>'decision' <> 'reconciled'
    THEN RAISE EXCEPTION 'manual release'; END IF;
  IF public.reconcile_customer_rendering_job(v_tenant, v_job, 'release',
    'ops:reviewer', 'TICKET-123')->>'decision' <> 'existing'
    THEN RAISE EXCEPTION 'manual replay'; END IF;
  IF (SELECT status FROM public.customer_rendering_quota_reservations WHERE job_id = v_job) <> 'released'
    OR (SELECT count(*) FROM public.customer_rendering_job_manual_decisions WHERE job_id = v_job) <> 1
    THEN RAISE EXCEPTION 'manual release audit or quota'; END IF;

  v_result := public.create_customer_rendering_job(v_tenant, 'wechat', 1::smallint,
    repeat('d', 64), NULL, NULL, NULL::smallint, NULL, v_style,
    '77777777-7777-4777-8777-777777777774', NULL, 'living_room',
    'renovation', NULL, '77777777-7777-4777-8777-777777777777', repeat('f', 64));
  IF v_result->>'decision' <> 'created' THEN RAISE EXCEPTION 'third admission: %', v_result; END IF;
  v_job := (v_result->>'job_id')::uuid;
  v_result := public.claim_customer_rendering_job(900);
  v_attempt := (v_result->>'attempt_id')::uuid;
  IF public.finalize_customer_rendering_job(v_job, v_attempt, 'failed',
    'WORKER_PREFLIGHT_UNAVAILABLE')->>'decision' <> 'finalized'
    THEN RAISE EXCEPTION 'pre-submit failure'; END IF;
  IF (SELECT actual_cost_fen FROM public.customer_rendering_jobs WHERE id = v_job) IS DISTINCT FROM 0
    OR (SELECT status FROM public.customer_rendering_quota_reservations WHERE job_id = v_job) <> 'released'
    THEN RAISE EXCEPTION 'pre-submit budget not released'; END IF;
END;
$test$;

ROLLBACK;
