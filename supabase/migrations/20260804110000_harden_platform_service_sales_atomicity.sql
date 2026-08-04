BEGIN;

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
BEGIN
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

CREATE OR REPLACE FUNCTION public.platform_service_request_refund_review(
  p_tenant_id uuid,
  p_order_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_reason text,
  p_created_by_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
  v_refund public.tenant_service_refund_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE tenant_id = p_tenant_id
    AND id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.tenant_service_refund_requests
  WHERE tenant_id = p_tenant_id
    AND service_order_id = p_order_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_order.payment_status = 'paid'
      AND v_order.version = p_expected_version
    THEN
      UPDATE public.tenant_service_orders
      SET
        payment_status = 'refund_reviewing',
        version = version + 1
      WHERE id = v_order.id
      RETURNING * INTO v_order;
    END IF;

    RETURN jsonb_build_object(
      'idempotent', true,
      'refund_request', to_jsonb(v_refund),
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'idempotent', false,
      'refund_request', NULL,
      'order', NULL,
      'error_code', 'SERVICE_ORDER_VERSION_CONFLICT'
    );
  END IF;

  IF v_order.payment_status <> 'paid' THEN
    RETURN jsonb_build_object(
      'idempotent', false,
      'refund_request', NULL,
      'order', NULL,
      'error_code', 'SERVICE_ORDER_INVALID_STATE'
    );
  END IF;

  INSERT INTO public.tenant_service_refund_requests (
    tenant_id,
    service_order_id,
    idempotency_key,
    reason,
    created_by_employee_id
  )
  VALUES (
    p_tenant_id,
    p_order_id,
    p_idempotency_key,
    p_reason,
    p_created_by_employee_id
  )
  RETURNING * INTO v_refund;

  UPDATE public.tenant_service_orders
  SET
    payment_status = 'refund_reviewing',
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'idempotent', false,
    'refund_request', to_jsonb(v_refund),
    'order', to_jsonb(v_order)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_prevent_ordered_product_code_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.code IS DISTINCT FROM NEW.code
    AND EXISTS (
      SELECT 1
      FROM public.tenant_service_orders AS service_order
      WHERE service_order.product_id = OLD.id
      LIMIT 1
    )
  THEN
    RAISE EXCEPTION 'SERVICE_PRODUCT_CODE_LOCKED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_platform_service_products_code_lock
  ON public.platform_service_products;

CREATE TRIGGER tr_platform_service_products_code_lock
BEFORE UPDATE OF code ON public.platform_service_products
FOR EACH ROW
EXECUTE FUNCTION public.platform_service_prevent_ordered_product_code_change();

REVOKE ALL ON FUNCTION public.platform_service_publish_product_version(
  uuid,
  integer,
  text,
  integer,
  bigint,
  bigint,
  jsonb,
  integer,
  text,
  uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_publish_product_version(
  uuid,
  integer,
  text,
  integer,
  bigint,
  bigint,
  jsonb,
  integer,
  text,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_request_refund_review(
  uuid,
  uuid,
  integer,
  uuid,
  text,
  uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_request_refund_review(
  uuid,
  uuid,
  integer,
  uuid,
  text,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_prevent_ordered_product_code_change()
FROM PUBLIC;

COMMIT;
