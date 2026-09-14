-- Run against an isolated database after all migrations. All fixtures roll back.
BEGIN;

INSERT INTO public.tenants (id, name, slug)
VALUES ('88888888-8888-4888-8888-888888888888', 'usage test', 'rendering-usage-test');

INSERT INTO public.platform_file_objects
  (id, tenant_id, owner_type, scene, bucket, region, object_key,
    mime_type, size_bytes, checksum, visibility, public_url)
VALUES ('88888888-8888-4888-8888-888888888881',
  '88888888-8888-4888-8888-888888888888', 'tenant', 'rendering_style_public',
  'test-bucket-12345', 'ap-beijing',
  'public/renovation-styles/88888888-8888-4888-8888-888888888888/88888888-8888-4888-8888-888888888882/1.webp',
  'image/webp', 100, repeat('a', 64), 'public', 'https://example.test/style.webp');

INSERT INTO public.tenant_rendering_styles
  (id, tenant_id, title, space, style, source_type, rights_confirmed, file_id,
    status, published_title, published_space, published_style,
    published_color_notes, published_material_notes, published_source_type,
    published_file_id, published_version, published_at)
VALUES ('88888888-8888-4888-8888-888888888882',
  '88888888-8888-4888-8888-888888888888', 'test style', 'living_room',
  'modern_simple', 'design', true, '88888888-8888-4888-8888-888888888881',
  'published', 'test style', 'living_room', 'modern_simple', '', '', 'design',
  '88888888-8888-4888-8888-888888888881', 1, now());

INSERT INTO public.customer_rendering_inputs
  (id, tenant_id, channel, subject_key_version, subject_digest,
    purpose, declared_mime_type, declared_size_bytes, bucket, region,
    raw_object_key, normalized_object_key, normalized_size_bytes,
    width, height, checksum, status, expires_at, review_decision, reviewed_at)
VALUES ('88888888-8888-4888-8888-888888888883',
  '88888888-8888-4888-8888-888888888888', 'wechat', 1, repeat('b', 64),
  'room', 'image/webp', 100, 'test-bucket-12345', 'ap-beijing',
  'private/customer-rendering-inputs/88888888-8888-4888-8888-888888888888/88888888-8888-4888-8888-888888888883/raw',
  'private/customer-rendering-inputs/88888888-8888-4888-8888-888888888888/88888888-8888-4888-8888-888888888883/normalized.webp',
  100, 100, 100, repeat('c', 64), 'approved', now() + interval '1 day', 'approved', now());

INSERT INTO public.customer_rendering_jobs
  (id, tenant_id, channel, subject_key_version, subject_digest,
    style_asset_id, style_snapshot, room_file_id, space, mode,
    idempotency_key, request_hash, status, budget_date,
    reserved_cost_fen, actual_cost_fen)
VALUES
  ('88888888-8888-4888-8888-888888888884',
    '88888888-8888-4888-8888-888888888888', 'wechat', 1, repeat('b', 64),
    '88888888-8888-4888-8888-888888888882', '{}'::jsonb,
    '88888888-8888-4888-8888-888888888883', 'living_room', 'renovation',
    '88888888-8888-4888-8888-888888888884', repeat('d', 64), 'queued',
    (now() AT TIME ZONE 'Asia/Shanghai')::date, 50, NULL),
  ('88888888-8888-4888-8888-888888888885',
    '88888888-8888-4888-8888-888888888888', 'wechat', 1, repeat('b', 64),
    '88888888-8888-4888-8888-888888888882', '{}'::jsonb,
    '88888888-8888-4888-8888-888888888883', 'living_room', 'renovation',
    '88888888-8888-4888-8888-888888888885', repeat('d', 64), 'review_required',
    (now() AT TIME ZONE 'Asia/Shanghai')::date, 100, 30),
  ('88888888-8888-4888-8888-888888888886',
    '88888888-8888-4888-8888-888888888888', 'wechat', 1, repeat('b', 64),
    '88888888-8888-4888-8888-888888888882', '{}'::jsonb,
    '88888888-8888-4888-8888-888888888883', 'living_room', 'renovation',
    '88888888-8888-4888-8888-888888888886', repeat('d', 64), 'failed',
    (now() AT TIME ZONE 'Asia/Shanghai')::date - 1, 200, 0);

DO $test$
DECLARE
  v_usage jsonb;
  v_empty jsonb;
BEGIN
  v_usage := public.get_tenant_customer_rendering_daily_usage(
    '88888888-8888-4888-8888-888888888888');
  IF v_usage->>'budget_date' <> (now() AT TIME ZONE 'Asia/Shanghai')::date::text
    OR (v_usage->>'task_count')::integer <> 2
    OR (v_usage->>'budget_used_fen')::bigint <> 80
  THEN RAISE EXCEPTION 'unexpected usage: %', v_usage; END IF;

  v_empty := public.get_tenant_customer_rendering_daily_usage(
    '99999999-9999-4999-8999-999999999999');
  IF (v_empty->>'task_count')::integer <> 0
    OR (v_empty->>'budget_used_fen')::bigint <> 0
  THEN RAISE EXCEPTION 'unexpected empty usage: %', v_empty; END IF;

  IF has_function_privilege('anon',
    'public.get_tenant_customer_rendering_daily_usage(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
    'public.get_tenant_customer_rendering_daily_usage(uuid)', 'EXECUTE')
  THEN RAISE EXCEPTION 'usage RPC privilege mismatch'; END IF;
END;
$test$;

ROLLBACK;
