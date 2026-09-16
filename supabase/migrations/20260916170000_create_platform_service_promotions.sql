-- Limited-time service package promotions. No activity is seeded or enabled.
-- Rollback: stop published activities through the audited command, then use a
-- forward migration to restore the previous order/product RPCs and revoke the
-- promotion RPCs. Preserve version history and frozen order snapshots.
BEGIN;

CREATE TABLE public.platform_service_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (btrim(code) <> '' AND char_length(code) <= 80),
  draft_version_id uuid,
  published_version_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_service_promotion_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.platform_service_promotions(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'superseded', 'stopped')),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  badge_text text NOT NULL CHECK (btrim(badge_text) <> '' AND char_length(badge_text) <= 20),
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 60),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 200),
  rules_text text NOT NULL DEFAULT '' CHECK (char_length(rules_text) <= 2000),
  discount_rate_basis_points integer NOT NULL DEFAULT 2000
    CHECK (discount_rate_basis_points BETWEEN 1 AND 9999),
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  published_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  stopped_at timestamptz,
  stopped_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  stop_reason text CHECK (stop_reason IS NULL OR char_length(btrim(stop_reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, version_no),
  UNIQUE (id, promotion_id),
  CONSTRAINT platform_service_promotion_schedule_valid CHECK (
    publication_status = 'draft' OR
    (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at < ends_at)
  ),
  -- Range-only exclusion is global; the built-in range GiST opclass needs no extension.
  CONSTRAINT platform_service_promotion_published_no_overlap
    EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (publication_status = 'published')
);

ALTER TABLE public.platform_service_promotions
  ADD CONSTRAINT platform_service_promotions_draft_fkey
    FOREIGN KEY (draft_version_id, id)
    REFERENCES public.platform_service_promotion_versions(id, promotion_id) ON DELETE RESTRICT,
  ADD CONSTRAINT platform_service_promotions_published_fkey
    FOREIGN KEY (published_version_id, id)
    REFERENCES public.platform_service_promotion_versions(id, promotion_id) ON DELETE RESTRICT;

CREATE INDEX platform_service_promotions_created_idx
  ON public.platform_service_promotions (created_at DESC, id DESC) WHERE archived_at IS NULL;
CREATE INDEX platform_service_promotion_versions_status_time_idx
  ON public.platform_service_promotion_versions (publication_status, ends_at, starts_at);
CREATE TRIGGER tr_platform_service_promotions_updated_at
  BEFORE UPDATE ON public.platform_service_promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.platform_service_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_service_promotion_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_service_promotions, public.platform_service_promotion_versions FROM PUBLIC, anon, authenticated;
-- Clear default privileges, including DELETE/TRUNCATE, before the minimal grant.
REVOKE ALL ON TABLE public.platform_service_promotions, public.platform_service_promotion_versions FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_service_promotions, public.platform_service_promotion_versions TO service_role;

-- Published facts remain immutable even for direct service_role UPDATEs.
CREATE OR REPLACE FUNCTION public.platform_service_guard_promotion_version_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.publication_status = 'draft' THEN
    IF NEW.publication_status NOT IN ('draft', 'published') THEN
      RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
    END IF;
    -- Draft edits and the initial publication may set publication metadata.
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.id, NEW.promotion_id, NEW.version_no, NEW.name, NEW.badge_text,
    NEW.title, NEW.summary, NEW.rules_text, NEW.discount_rate_basis_points,
    NEW.starts_at, NEW.ends_at, NEW.created_at,
    NEW.published_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.promotion_id, OLD.version_no, OLD.name, OLD.badge_text,
    OLD.title, OLD.summary, OLD.rules_text, OLD.discount_rate_basis_points,
    OLD.starts_at, OLD.ends_at, OLD.created_at,
    OLD.published_at
  ) THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
  END IF;

  -- Employee deletion uses ON DELETE SET NULL. Allow clearing the FK, but
  -- never attaching a different employee to an existing publication record.
  IF NEW.published_by_employee_id IS NOT NULL
    AND NEW.published_by_employee_id IS DISTINCT FROM OLD.published_by_employee_id
  THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.publication_status = 'published' AND NEW.publication_status = 'stopped' THEN
    IF NEW.stopped_at IS NULL OR NEW.stopped_by_employee_id IS NULL
      OR NEW.stop_reason IS NULL OR char_length(btrim(NEW.stop_reason)) NOT BETWEEN 1 AND 500
    THEN
      RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.publication_status IS DISTINCT FROM OLD.publication_status
    AND NOT (OLD.publication_status = 'published' AND NEW.publication_status = 'superseded')
  THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
  END IF;
  -- The stop transition above may initially set its actor. Afterwards only
  -- FK cleanup to NULL is permitted; stop timing and reason remain frozen.
  IF NEW.stopped_by_employee_id IS NOT NULL
    AND NEW.stopped_by_employee_id IS DISTINCT FROM OLD.stopped_by_employee_id
  THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
  END IF;
  IF ROW(NEW.stopped_at, NEW.stop_reason)
    IS DISTINCT FROM ROW(OLD.stopped_at, OLD.stop_reason)
  THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_platform_service_promotion_versions_immutable
  BEFORE UPDATE ON public.platform_service_promotion_versions
  FOR EACH ROW EXECUTE FUNCTION public.platform_service_guard_promotion_version_update();

-- These helpers resolve individual order snapshots and command activity previews.
-- Tenant lists use a bounded set-based query instead of per-product helper calls.
-- Keep their pricing parity covered by isolated-database verification.
-- The snapshot caller supplies one database clock value for the whole operation.
CREATE OR REPLACE FUNCTION public.platform_service_promotion_snapshot(
  p_product_code text, p_base_amount_fen bigint, p_now timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', promotion.id, 'version_id', published.id, 'version', published.version_no,
    'name', published.name, 'badge_text', published.badge_text,
    'title', published.title, 'summary', published.summary, 'rules_text', published.rules_text,
    'discount_rate_basis_points', published.discount_rate_basis_points,
    'starts_at', published.starts_at, 'ends_at', published.ends_at,
    'base_amount_fen', p_base_amount_fen,
    'effective_amount_fen', GREATEST(1, round(p_base_amount_fen::numeric * published.discount_rate_basis_points / 10000.0))::bigint
  )
  FROM public.platform_service_promotion_versions AS published
  JOIN public.platform_service_promotions AS promotion
    ON promotion.published_version_id = published.id AND promotion.id = published.promotion_id
  WHERE p_product_code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y')
    AND promotion.archived_at IS NULL
    AND published.publication_status = 'published'
    AND tstzrange(published.starts_at, published.ends_at, '[)') @> p_now
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_promotion_price_preview(p_rate integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Internal preview is bounded to exactly three unique formal product codes.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'product_id', product.id, 'code', product.code, 'title', published.title,
    'term_years', published.term_years, 'base_amount_fen', published.amount_fen,
    'effective_amount_fen', GREATEST(1, round(published.amount_fen::numeric * p_rate / 10000.0))::bigint,
    'base_price_rate_basis_points', 10000, 'price_rate_basis_points', p_rate
  ) ORDER BY published.term_years), '[]'::jsonb)
  FROM public.platform_service_products AS product
  JOIN public.platform_service_product_versions AS published
    ON published.id = product.published_version_id AND published.product_id = product.id
  WHERE product.code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y')
    AND product.status = 'enabled';
$$;

CREATE OR REPLACE FUNCTION public.platform_service_create_promotion_draft(
  p_code text, p_draft jsonb, p_actor_employee_id uuid, p_actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promotion public.platform_service_promotions%ROWTYPE;
  v_draft public.platform_service_promotion_versions%ROWTYPE;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  INSERT INTO public.platform_service_promotions (code, created_by_employee_id, updated_by_employee_id)
  VALUES (btrim(p_code), p_actor_employee_id, p_actor_employee_id) RETURNING * INTO v_promotion;
  INSERT INTO public.platform_service_promotion_versions (
    promotion_id, version_no, name, badge_text, title, summary, rules_text,
    discount_rate_basis_points, starts_at, ends_at
  ) VALUES (
    v_promotion.id, 1, btrim(p_draft->>'name'), btrim(p_draft->>'badge_text'), btrim(p_draft->>'title'),
    coalesce(p_draft->>'summary', ''), coalesce(p_draft->>'rules_text', ''),
    coalesce((p_draft->>'discount_rate_basis_points')::integer, 2000),
    (p_draft->>'starts_at')::timestamptz, (p_draft->>'ends_at')::timestamptz
  ) RETURNING * INTO v_draft;
  UPDATE public.platform_service_promotions SET draft_version_id = v_draft.id
  WHERE id = v_promotion.id RETURNING * INTO v_promotion;
  v_result := jsonb_build_object('idempotent', false, 'promotion', to_jsonb(v_promotion), 'draft', to_jsonb(v_draft), 'published', NULL);
  v_result := v_result || jsonb_build_object('price_preview', public.platform_service_promotion_price_preview(v_draft.discount_rate_basis_points), 'server_time', v_now);
  PERFORM public.write_platform_command_audit(
    'platform_service_promotion_create', p_actor_employee_id, p_actor_user_id, NULL,
    'platform_service_promotion', v_promotion.id, v_draft.name, '创建平台服务活动草稿', v_result
  );
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'SERVICE_PROMOTION_CODE_CONFLICT' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_save_promotion_draft(
  p_promotion_id uuid, p_expected_version integer, p_draft jsonb,
  p_actor_employee_id uuid, p_actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promotion public.platform_service_promotions%ROWTYPE;
  v_draft public.platform_service_promotion_versions%ROWTYPE;
  v_published public.platform_service_promotion_versions%ROWTYPE;
  v_next_version integer;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  SELECT * INTO v_promotion FROM public.platform_service_promotions
  WHERE id = p_promotion_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_PROMOTION_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_promotion.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT version_no + 1 INTO v_next_version FROM public.platform_service_promotion_versions
  WHERE promotion_id = p_promotion_id ORDER BY version_no DESC LIMIT 1;
  INSERT INTO public.platform_service_promotion_versions (
    promotion_id, version_no, name, badge_text, title, summary, rules_text,
    discount_rate_basis_points, starts_at, ends_at
  ) VALUES (
    p_promotion_id, coalesce(v_next_version, 1), btrim(p_draft->>'name'), btrim(p_draft->>'badge_text'), btrim(p_draft->>'title'),
    coalesce(p_draft->>'summary', ''), coalesce(p_draft->>'rules_text', ''),
    coalesce((p_draft->>'discount_rate_basis_points')::integer, 2000),
    (p_draft->>'starts_at')::timestamptz, (p_draft->>'ends_at')::timestamptz
  ) RETURNING * INTO v_draft;
  UPDATE public.platform_service_promotions
  SET draft_version_id = v_draft.id, version = version + 1, updated_by_employee_id = p_actor_employee_id
  WHERE id = p_promotion_id RETURNING * INTO v_promotion;
  SELECT * INTO v_published FROM public.platform_service_promotion_versions WHERE id = v_promotion.published_version_id;
  v_result := jsonb_build_object('idempotent', false, 'promotion', to_jsonb(v_promotion), 'draft', to_jsonb(v_draft), 'published', CASE WHEN v_published.id IS NULL THEN NULL ELSE to_jsonb(v_published) END);
  v_result := v_result || jsonb_build_object('price_preview', public.platform_service_promotion_price_preview(v_draft.discount_rate_basis_points), 'server_time', v_now);
  PERFORM public.write_platform_command_audit(
    'platform_service_promotion_update', p_actor_employee_id, p_actor_user_id, NULL,
    'platform_service_promotion', v_promotion.id, v_draft.name, '更新平台服务活动草稿', v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_publish_promotion(
  p_promotion_id uuid, p_expected_version integer, p_idempotency_key uuid,
  p_actor_employee_id uuid, p_actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promotion public.platform_service_promotions%ROWTYPE;
  v_draft public.platform_service_promotion_versions%ROWTYPE;
  v_existing jsonb;
  v_result jsonb;
  v_product_count integer;
  v_invalid_price boolean;
  v_now timestamptz;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  IF p_idempotency_key IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_IDEMPOTENCY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key, 'platform_service_promotion_publish');
  IF v_existing IS NOT NULL THEN
    IF v_existing->'promotion'->>'id' IS DISTINCT FROM p_promotion_id::text THEN
      RAISE EXCEPTION 'SERVICE_PROMOTION_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_existing;
  END IF;
  -- Shared with product publication and order pricing; always before row locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-service-promotion-pricing', 0));
  v_now := clock_timestamp();
  SELECT * INTO v_promotion FROM public.platform_service_promotions
  WHERE id = p_promotion_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_PROMOTION_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_promotion.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_draft FROM public.platform_service_promotion_versions
  WHERE id = v_promotion.draft_version_id AND publication_status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001'; END IF;
  IF v_draft.starts_at IS NULL OR v_draft.ends_at IS NULL OR v_draft.starts_at >= v_draft.ends_at OR v_draft.ends_at <= v_now THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_TIME_INVALID' USING ERRCODE = 'P0001';
  END IF;
  WITH eligible_products AS MATERIALIZED (
    -- Product archival is status = 'archived'; requiring enabled excludes it.
    -- These three unique codes bound the internal query and its row locks.
    SELECT published.amount_fen
    FROM public.platform_service_products AS product
    JOIN public.platform_service_product_versions AS published
      ON published.id = product.published_version_id AND published.product_id = product.id
    WHERE product.code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y')
      AND product.status = 'enabled'
    FOR SHARE OF product, published
  )
  SELECT count(*), bool_or(GREATEST(1, round(published.amount_fen::numeric * v_draft.discount_rate_basis_points / 10000.0)) >= published.amount_fen)
  INTO v_product_count, v_invalid_price
  FROM eligible_products AS published;
  IF v_product_count <> 3 THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_PRODUCT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;
  IF v_invalid_price THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_PRICE_NOT_LOWER' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.platform_service_promotion_versions SET publication_status = 'superseded'
  WHERE id = v_promotion.published_version_id AND publication_status = 'published';
  UPDATE public.platform_service_promotion_versions
  SET publication_status = 'published', published_at = v_now, published_by_employee_id = p_actor_employee_id
  WHERE id = v_draft.id RETURNING * INTO v_draft;
  UPDATE public.platform_service_promotions
  SET published_version_id = v_draft.id, draft_version_id = NULL,
    version = version + 1, updated_by_employee_id = p_actor_employee_id
  WHERE id = p_promotion_id RETURNING * INTO v_promotion;
  v_result := jsonb_build_object('idempotent', false, 'promotion', to_jsonb(v_promotion), 'draft', NULL, 'published', to_jsonb(v_draft));
  v_result := v_result || jsonb_build_object('price_preview', public.platform_service_promotion_price_preview(v_draft.discount_rate_basis_points), 'server_time', v_now);
  PERFORM public.write_platform_command_audit(
    'platform_service_promotion_publish', p_actor_employee_id, p_actor_user_id, p_idempotency_key,
    'platform_service_promotion', v_promotion.id, v_draft.name, '发布平台服务活动', v_result
  );
  RETURN v_result;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'SERVICE_PROMOTION_OVERLAP' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_stop_promotion(
  p_promotion_id uuid, p_expected_version integer, p_idempotency_key uuid,
  p_reason text, p_actor_employee_id uuid, p_actor_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promotion public.platform_service_promotions%ROWTYPE;
  v_published public.platform_service_promotion_versions%ROWTYPE;
  v_draft public.platform_service_promotion_versions%ROWTYPE;
  v_existing jsonb;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  IF p_idempotency_key IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_IDEMPOTENCY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key, 'platform_service_promotion_stop');
  IF v_existing IS NOT NULL THEN
    IF v_existing->'promotion'->>'id' IS DISTINCT FROM p_promotion_id::text THEN
      RAISE EXCEPTION 'SERVICE_PROMOTION_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_existing;
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_STOP_REASON_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-service-promotion-pricing', 0));
  SELECT * INTO v_promotion FROM public.platform_service_promotions
  WHERE id = p_promotion_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_PROMOTION_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_promotion.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.platform_service_promotion_versions
  SET publication_status = 'stopped', stopped_at = v_now,
    stopped_by_employee_id = p_actor_employee_id, stop_reason = btrim(p_reason)
  WHERE id = v_promotion.published_version_id AND publication_status = 'published'
  RETURNING * INTO v_published;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_STATE' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.platform_service_promotions
  SET version = version + 1, updated_by_employee_id = p_actor_employee_id
  WHERE id = p_promotion_id RETURNING * INTO v_promotion;
  SELECT * INTO v_draft FROM public.platform_service_promotion_versions WHERE id = v_promotion.draft_version_id;
  v_result := jsonb_build_object('idempotent', false, 'promotion', to_jsonb(v_promotion), 'draft', CASE WHEN v_draft.id IS NULL THEN NULL ELSE to_jsonb(v_draft) END, 'published', to_jsonb(v_published));
  v_result := v_result || jsonb_build_object('price_preview', public.platform_service_promotion_price_preview(coalesce(v_draft.discount_rate_basis_points, v_published.discount_rate_basis_points)), 'server_time', v_now);
  PERFORM public.write_platform_command_audit(
    'platform_service_promotion_stop', p_actor_employee_id, p_actor_user_id, p_idempotency_key,
    'platform_service_promotion', v_promotion.id, v_published.name, '停止平台服务活动', v_result
  );
  RETURN v_result;
END;
$$;



CREATE OR REPLACE FUNCTION public.platform_service_list_promotions(
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_PAGINATION' USING ERRCODE = 'P0001';
  END IF;
  WITH totals AS (
    SELECT count(*) AS total FROM public.platform_service_promotions WHERE archived_at IS NULL
  ), page AS MATERIALIZED (
    SELECT id, code, version, draft_version_id, published_version_id, created_at, updated_at,
      archived_at, created_by_employee_id, updated_by_employee_id
    FROM public.platform_service_promotions WHERE archived_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT p_page_size OFFSET ((p_page - 1) * p_page_size)
  ), packages AS MATERIALIZED (
    -- Three unique package codes bound this internal price preview to <= 3 rows.
    SELECT product.id, product.code, published.title, published.term_years, published.amount_fen
    FROM public.platform_service_products AS product
    JOIN public.platform_service_product_versions AS published
      ON published.id = product.published_version_id AND published.product_id = product.id
    WHERE product.code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y')
      AND product.status = 'enabled'
  ), records AS (
    SELECT page.created_at, page.id, to_jsonb(page) || jsonb_build_object(
      'draft', CASE WHEN draft.id IS NULL THEN NULL ELSE to_jsonb(draft) END,
      'published', CASE WHEN published.id IS NULL THEN NULL ELSE to_jsonb(published) END,
      'phase', CASE
        WHEN published.id IS NULL THEN 'draft'
        WHEN published.publication_status = 'stopped' THEN 'stopped'
        WHEN published.ends_at <= v_now THEN 'ended'
        WHEN published.starts_at > v_now THEN 'scheduled'
        ELSE 'active' END,
      'price_preview', preview.prices
    ) AS item
    FROM page
    LEFT JOIN public.platform_service_promotion_versions AS draft ON draft.id = page.draft_version_id
    LEFT JOIN public.platform_service_promotion_versions AS published ON published.id = page.published_version_id
    CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'product_id', packages.id, 'code', packages.code, 'title', packages.title,
        'term_years', packages.term_years, 'base_amount_fen', packages.amount_fen,
        'effective_amount_fen', GREATEST(1, round(packages.amount_fen::numeric * coalesce(draft.discount_rate_basis_points, published.discount_rate_basis_points, 10000) / 10000.0))::bigint,
        'base_price_rate_basis_points', 10000,
        'price_rate_basis_points', coalesce(draft.discount_rate_basis_points, published.discount_rate_basis_points, 10000)
      ) ORDER BY packages.term_years), '[]'::jsonb) AS prices FROM packages
    ) AS preview
  )
  SELECT jsonb_build_object(
    'list', coalesce((SELECT jsonb_agg(item ORDER BY created_at DESC, id DESC) FROM records), '[]'::jsonb),
    'pagination', (SELECT jsonb_build_object('page', p_page, 'pageSize', p_page_size,
      'total', total, 'totalPages', ceil(total::numeric / p_page_size)::bigint) FROM totals),
    'server_time', v_now
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_list_effective_products(
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_INVALID_PAGINATION' USING ERRCODE = 'P0001';
  END IF;
  WITH totals AS (
    SELECT count(*) AS total FROM public.platform_service_products AS product
    JOIN public.platform_service_product_versions AS published
      ON published.id = product.published_version_id AND published.product_id = product.id
    WHERE product.status = 'enabled'
  ), active_promotion AS MATERIALIZED (
    SELECT promotion.id, published.id AS version_id, published.version_no, published.name,
      published.badge_text, published.title, published.summary, published.rules_text,
      published.discount_rate_basis_points, published.starts_at, published.ends_at
    FROM public.platform_service_promotion_versions AS published
    JOIN public.platform_service_promotions AS promotion
      ON promotion.published_version_id = published.id AND promotion.id = published.promotion_id
    WHERE promotion.archived_at IS NULL AND published.publication_status = 'published'
      AND tstzrange(published.starts_at, published.ends_at, '[)') @> v_now
    LIMIT 1
  ), page AS MATERIALIZED (
    SELECT product.id, product.code, product.sort_order, published.id AS product_version_id,
      published.version AS pricing_version, published.title, published.term_years,
      published.list_amount_fen, published.amount_fen AS base_amount_fen,
      published.service_scope, published.terms_version, published.terms_content
    FROM public.platform_service_products AS product
    JOIN public.platform_service_product_versions AS published
      ON published.id = product.published_version_id AND published.product_id = product.id
    WHERE product.status = 'enabled'
    ORDER BY product.sort_order, product.id
    LIMIT p_page_size OFFSET ((p_page - 1) * p_page_size)
  ), priced AS (
    SELECT page.*, active_promotion.id AS promotion_id,
      coalesce(active_promotion.discount_rate_basis_points, 10000) AS rate,
      GREATEST(1, round(page.base_amount_fen::numeric * coalesce(active_promotion.discount_rate_basis_points, 10000) / 10000.0))::bigint AS effective_amount_fen,
      CASE WHEN active_promotion.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', active_promotion.id, 'version_id', active_promotion.version_id,
          'version', active_promotion.version_no, 'name', active_promotion.name,
          'badge_text', active_promotion.badge_text, 'title', active_promotion.title,
          'summary', active_promotion.summary, 'rules_text', active_promotion.rules_text,
          'discount_rate_basis_points', active_promotion.discount_rate_basis_points,
          'starts_at', active_promotion.starts_at, 'ends_at', active_promotion.ends_at,
          'base_amount_fen', page.base_amount_fen,
          'effective_amount_fen', GREATEST(1, round(page.base_amount_fen::numeric * active_promotion.discount_rate_basis_points / 10000.0))::bigint)
      END AS promotion
    FROM page LEFT JOIN active_promotion
      ON page.code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y')
  )
  SELECT jsonb_build_object(
    'list', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'product_id', id, 'product_version_id', product_version_id,
      'code', code, 'title', title, 'term_years', term_years, 'pricing_version', pricing_version,
      'list_amount_fen', list_amount_fen, 'base_amount_fen', base_amount_fen,
      'effective_amount_fen', effective_amount_fen, 'amount_fen', effective_amount_fen,
      'base_price_rate_basis_points', 10000, 'price_rate_basis_points', rate,
      'service_scope', service_scope, 'terms_version', terms_version, 'terms_content', terms_content,
      'promotion', promotion
    ) ORDER BY sort_order, id) FROM priced), '[]'::jsonb),
    'pagination', (SELECT jsonb_build_object('page', p_page, 'pageSize', p_page_size,
      'total', total, 'totalPages', ceil(total::numeric / p_page_size)::bigint) FROM totals),
    'server_time', v_now
  ) INTO v_result;
  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.platform_service_publish_product_version(
  p_product_id uuid,
  p_expected_version integer,
  p_title text,
  p_term_years integer,
  p_list_amount_fen bigint,
  p_amount_fen bigint,
  p_service_scope jsonb,
  p_terms_version integer,
  p_terms_content text,
  p_published_by_employee_id uuid
)
RETURNS public.platform_service_product_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_service_products%ROWTYPE;
  v_version public.platform_service_product_versions%ROWTYPE;
  v_next_version integer;
  v_now timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-service-promotion-pricing', 0));
  v_now := clock_timestamp();
  SELECT *
  INTO v_product
  FROM public.platform_service_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_PRODUCT_NOT_FOUND';
  END IF;

  IF v_product.version <> p_expected_version THEN
    RETURN NULL;
  END IF;

  -- Check all three daily published prices, substituting this new version's
  -- amount for the product being published. Scheduled promotions count too.
  IF v_product.code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y') AND EXISTS (
    SELECT 1 FROM public.platform_service_promotion_versions AS promotion
    JOIN public.platform_service_promotions AS activity
      ON activity.published_version_id = promotion.id AND activity.id = promotion.promotion_id
    CROSS JOIN public.platform_service_products AS product
    JOIN public.platform_service_product_versions AS published
      ON published.id = product.published_version_id AND published.product_id = product.id
    WHERE promotion.publication_status = 'published' AND promotion.ends_at > v_now
      AND activity.archived_at IS NULL
      AND product.code IN ('platform_service_1y', 'platform_service_2y', 'platform_service_3y')
      AND GREATEST(1, round((CASE WHEN product.id = p_product_id THEN p_amount_fen ELSE published.amount_fen END)::numeric * promotion.discount_rate_basis_points / 10000.0))
        >= (CASE WHEN product.id = p_product_id THEN p_amount_fen ELSE published.amount_fen END)
  ) THEN
    RAISE EXCEPTION 'SERVICE_PROMOTION_PRICE_NOT_LOWER' USING ERRCODE = 'P0001';
  END IF;

  v_next_version := p_expected_version + 1;

  INSERT INTO public.platform_service_product_versions (
    product_id,
    version,
    title,
    term_years,
    list_amount_fen,
    amount_fen,
    service_scope,
    terms_version,
    terms_content,
    published_by_employee_id
  )
  VALUES (
    p_product_id,
    v_next_version,
    p_title,
    p_term_years,
    p_list_amount_fen,
    p_amount_fen,
    p_service_scope,
    p_terms_version,
    p_terms_content,
    p_published_by_employee_id
  )
  RETURNING * INTO v_version;

  UPDATE public.platform_service_products
  SET
    published_version_id = v_version.id,
    version = v_next_version,
    updated_by_employee_id = p_published_by_employee_id
  WHERE id = p_product_id;

  RETURN v_version;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SERVICE_PRODUCT_VERSION_CONFLICT';
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_create_pending_order(
  p_tenant_id uuid,
  p_product_id uuid,
  p_product_version_id uuid,
  p_order_no text,
  p_out_trade_no text,
  p_idempotency_key uuid,
  p_product_code text,
  p_pricing_version integer,
  p_product_snapshot jsonb,
  p_term_years integer,
  p_amount_fen bigint,
  p_payment_config_id uuid,
  p_payment_config_guard_version integer,
  p_payer_openid text,
  p_payment_expires_at timestamptz,
  p_terms_version integer,
  p_terms_accepted_at timestamptz,
  p_created_by_employee_id uuid,
  p_required_channel text DEFAULT 'platform_service',
  p_source_trial_id uuid DEFAULT NULL
)
RETURNS public.tenant_service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_config public.platform_payment_configs%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_trial_identity record;
  v_now timestamptz;
  v_pricing record;
  v_effective_amount_fen bigint;
  v_promotion_snapshot jsonb;
BEGIN
  -- Promotion publish/stop and product publish take the exclusive counterpart.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('platform-service-promotion-pricing', 0));
  v_now := clock_timestamp();
  IF p_required_channel IS NULL OR btrim(p_required_channel) = '' THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CHANNEL_REQUIRED';
  END IF;

  IF p_source_trial_id IS NOT NULL THEN
    -- Lock the employee identity before any trial/order fact lock so employee
    -- deletion cannot invert the FK lock order with this source-attributed path.
    PERFORM employee.id
    FROM public.employees AS employee
    WHERE employee.id = p_created_by_employee_id
      AND employee.tenant_id = p_tenant_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT trial.tenant_id, trial.enterprise_identity_hash
    INTO v_trial_identity
    FROM public.tenant_service_trials AS trial
    WHERE trial.id = p_source_trial_id
      AND trial.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'service-trial-enterprise:' || encode(v_trial_identity.enterprise_identity_hash, 'hex'),
      20260811005555
    ));
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'service-trial-tenant:' || p_tenant_id::text, 20260811005555
    ));
    v_trial := public.platform_service_trial_normalize_effective_status(
      p_source_trial_id, p_tenant_id, v_now
    );
    IF v_trial.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_trial.status NOT IN (
        'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
        'rejected', 'withdrawn', 'revoked', 'converted'
      )
    THEN RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'service-order-create:' || p_tenant_id::text || ':' || p_idempotency_key::text, 0
    ));
    SELECT * INTO v_order FROM public.tenant_service_orders
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_order.product_id IS DISTINCT FROM p_product_id
        OR v_order.source_trial_id IS DISTINCT FROM p_source_trial_id
        OR v_order.created_by_employee_id IS DISTINCT FROM p_created_by_employee_id
      THEN RAISE EXCEPTION 'SERVICE_ORDER_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001'; END IF;
      -- Existing pending orders retain their original frozen amount and terms.
      RETURN v_order;
    END IF;
  END IF;

  SELECT *
  INTO v_payment_config
  FROM public.platform_payment_configs
  WHERE id = p_payment_config_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_NOT_FOUND';
  END IF;

  IF v_payment_config.provider <> 'wechat_pay'
    OR v_payment_config.principal_type <> 'platform'
    OR v_payment_config.merchant_mode <> 'direct_merchant'
    OR v_payment_config.status <> 'active'
    OR NOT (p_required_channel = ANY(v_payment_config.enabled_channels))
  THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_INVALID';
  END IF;

  IF v_payment_config.recharge_guard_version <> p_payment_config_guard_version THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_VERSION_CONFLICT';
  END IF;

  SELECT product.code, published.id AS product_version_id, published.version,
    published.title, published.term_years, published.list_amount_fen, published.amount_fen,
    published.service_scope, published.terms_version, published.terms_content
  INTO v_pricing
  FROM public.platform_service_products AS product
  JOIN public.platform_service_product_versions AS published
    ON published.id = product.published_version_id AND published.product_id = product.id
  WHERE product.id = p_product_id AND product.status = 'enabled'
  FOR SHARE OF product, published;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF p_terms_version IS DISTINCT FROM v_pricing.terms_version THEN
    RAISE EXCEPTION 'SERVICE_TERMS_VERSION_STALE' USING ERRCODE = 'P0001';
  END IF;
  v_promotion_snapshot := public.platform_service_promotion_snapshot(v_pricing.code, v_pricing.amount_fen, v_now);
  v_effective_amount_fen := coalesce((v_promotion_snapshot->>'effective_amount_fen')::bigint, v_pricing.amount_fen);
  -- Keep the legacy RPC arguments for callers, but replace every price/product
  -- fact from the locked published version and database-clock promotion.
  p_product_version_id := v_pricing.product_version_id;
  p_product_code := v_pricing.code;
  p_pricing_version := v_pricing.version;
  p_term_years := v_pricing.term_years;
  p_terms_version := v_pricing.terms_version;
  p_amount_fen := v_effective_amount_fen;
  p_product_snapshot := jsonb_build_object(
    'product_id', p_product_id, 'product_version_id', v_pricing.product_version_id,
    'code', v_pricing.code, 'title', v_pricing.title, 'pricing_version', v_pricing.version,
    'term_years', v_pricing.term_years, 'list_amount_fen', v_pricing.list_amount_fen,
    'base_amount_fen', v_pricing.amount_fen, 'amount_fen', v_effective_amount_fen,
    'effective_amount_fen', v_effective_amount_fen,
    'base_price_rate_basis_points', 10000,
    'price_rate_basis_points', coalesce((v_promotion_snapshot->>'discount_rate_basis_points')::integer, 10000),
    'service_scope', v_pricing.service_scope, 'terms_version', v_pricing.terms_version,
    'terms_content', v_pricing.terms_content, 'promotion', v_promotion_snapshot
  );

  BEGIN
    INSERT INTO public.tenant_service_orders (
      tenant_id,
      product_id,
      product_version_id,
      order_no,
      out_trade_no,
      idempotency_key,
      product_code,
      pricing_version,
      product_snapshot,
      term_years,
      amount_fen,
      payment_config_id,
      payment_config_guard_version,
      payer_openid,
      payment_expires_at,
      terms_version,
      terms_accepted_at,
      created_by_employee_id,
      source_trial_id
    )
    VALUES (
      p_tenant_id,
      p_product_id,
      p_product_version_id,
      p_order_no,
      p_out_trade_no,
      p_idempotency_key,
      p_product_code,
      p_pricing_version,
      p_product_snapshot,
      p_term_years,
      p_amount_fen,
      p_payment_config_id,
      p_payment_config_guard_version,
      p_payer_openid,
      p_payment_expires_at,
      p_terms_version,
      p_terms_accepted_at,
      p_created_by_employee_id,
      p_source_trial_id
    )
    RETURNING * INTO v_order;
  EXCEPTION WHEN unique_violation THEN
    IF p_source_trial_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_service_orders AS conflicting
      WHERE conflicting.source_trial_id = p_source_trial_id
        AND conflicting.payment_status <> 'closed'
    ) THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RAISE;
  END;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_guard_promotion_version_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_guard_promotion_version_update() TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_promotion_snapshot(text, bigint, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_promotion_snapshot(text, bigint, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_promotion_price_preview(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_promotion_price_preview(integer) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_create_promotion_draft(text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_create_promotion_draft(text, jsonb, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_save_promotion_draft(uuid, integer, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_save_promotion_draft(uuid, integer, jsonb, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_publish_promotion(uuid, integer, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_publish_promotion(uuid, integer, uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_stop_promotion(uuid, integer, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_stop_promotion(uuid, integer, uuid, text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_list_promotions(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_list_promotions(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_list_effective_products(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_list_effective_products(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_publish_product_version(uuid, integer, text, integer, bigint, bigint, jsonb, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_publish_product_version(uuid, integer, text, integer, bigint, bigint, jsonb, integer, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_create_pending_order(uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer, bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_create_pending_order(uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer, bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text, uuid) TO service_role;

COMMIT;
