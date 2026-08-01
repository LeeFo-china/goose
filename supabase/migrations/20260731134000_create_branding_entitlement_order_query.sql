-- Unified read model for legacy direct-payment and WeChat virtual-payment
-- branding entitlement orders. This migration intentionally depends only on
-- the 20260731130000/132000 virtual-payment foundation, not later fulfillment
-- or reconciliation columns.
-- Rollback: drop the two RPCs and the two query indexes below.

BEGIN;

CREATE INDEX IF NOT EXISTS tenant_virtual_addon_orders_tenant_query_status_idx
ON public.tenant_virtual_addon_orders(
  tenant_id,
  payment_status,
  fulfillment_status,
  refund_status,
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS tenant_virtual_addon_orders_platform_query_status_idx
ON public.tenant_virtual_addon_orders(
  payment_status,
  fulfillment_status,
  refund_status,
  created_at DESC,
  id DESC
);

CREATE OR REPLACE FUNCTION public.branding_list_entitlement_orders(
  p_tenant_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_payment_channel text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_fulfillment_status text DEFAULT NULL,
  p_refund_status text DEFAULT NULL,
  p_keyword text DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  payment_channel text,
  payment_platform text,
  payment_status text,
  fulfillment_status text,
  refund_status text,
  id uuid,
  tenant_id uuid,
  order_no text,
  product_code text,
  product_name text,
  amount_fen integer,
  term_years integer,
  payment_expires_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  failure_code text,
  created_at timestamptz,
  updated_at timestamptz,
  tenant_name text,
  tenant_slug text,
  entitlement_starts_at timestamptz,
  entitlement_expires_at timestamptz,
  entitlement_status text,
  entitlement_source text,
  entitlement_source_id uuid,
  count_only boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH unified AS (
    SELECT
      'legacy_direct'::text AS payment_channel,
      'unknown'::text AS payment_platform,
      CASE legacy.status
        WHEN 'paid' THEN 'succeeded'
        ELSE legacy.status
      END::text AS payment_status,
      CASE legacy.status
        WHEN 'paid' THEN 'granted'
        ELSE 'pending'
      END::text AS fulfillment_status,
      'none'::text AS refund_status,
      legacy.id,
      legacy.tenant_id,
      legacy.order_no,
      legacy.out_trade_no,
      legacy.transaction_id,
      legacy.product_code,
      legacy.product_name,
      legacy.amount_fen,
      legacy.term_years,
      legacy.payment_expires_at,
      legacy.paid_at,
      legacy.closed_at,
      legacy.failure_code,
      legacy.created_at,
      legacy.updated_at,
      legacy.entitlement_code
    FROM public.tenant_addon_orders AS legacy

    UNION ALL

    SELECT
      'wechat_virtual'::text AS payment_channel,
      virtual.requested_platform::text AS payment_platform,
      virtual.payment_status,
      virtual.fulfillment_status,
      virtual.refund_status,
      virtual.id,
      virtual.tenant_id,
      virtual.order_no,
      virtual.out_trade_no,
      virtual.transaction_id,
      virtual.product_code,
      virtual.product_name,
      virtual.amount_fen,
      virtual.term_years,
      virtual.payment_expires_at,
      virtual.paid_at,
      NULL::timestamptz AS closed_at,
      virtual.failure_code,
      virtual.created_at,
      virtual.updated_at,
      virtual.entitlement_code
    FROM public.tenant_virtual_addon_orders AS virtual
  ),
  filtered AS (
    SELECT
      unified.*,
      tenant.name AS tenant_name,
      tenant.slug AS tenant_slug,
      entitlement.starts_at AS entitlement_starts_at,
      entitlement.expires_at AS entitlement_expires_at,
      entitlement.status AS entitlement_status,
      entitlement.source_type AS entitlement_source,
      entitlement.source_id AS entitlement_source_id
    FROM unified
    JOIN public.tenants AS tenant
      ON tenant.id = unified.tenant_id
    LEFT JOIN public.tenant_entitlements AS entitlement
      ON entitlement.tenant_id = unified.tenant_id
     AND entitlement.entitlement_code = unified.entitlement_code
    WHERE (p_tenant_id IS NULL OR unified.tenant_id = p_tenant_id)
      AND (
        p_payment_channel IS NULL
        OR unified.payment_channel = p_payment_channel
      )
      AND (
        p_payment_status IS NULL
        OR unified.payment_status = p_payment_status
      )
      AND (
        p_fulfillment_status IS NULL
        OR unified.fulfillment_status = p_fulfillment_status
      )
      AND (
        p_refund_status IS NULL
        OR unified.refund_status = p_refund_status
      )
      AND (p_created_from IS NULL OR unified.created_at >= p_created_from)
      AND (p_created_to IS NULL OR unified.created_at <= p_created_to)
      AND (
        p_keyword IS NULL
        OR unified.order_no ILIKE '%' || p_keyword || '%'
        OR unified.out_trade_no ILIKE '%' || p_keyword || '%'
        OR unified.transaction_id ILIKE '%' || p_keyword || '%'
      )
  ),
  statistics AS (
    SELECT count(*)::bigint AS total_count
    FROM filtered
  ),
  paged AS (
    SELECT
      filtered.*,
      statistics.total_count
    FROM filtered
    CROSS JOIN statistics
    ORDER BY filtered.created_at DESC, filtered.id DESC
    OFFSET (
      GREATEST(COALESCE(p_page, 1), 1)::bigint - 1
    ) * LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)::bigint
    LIMIT LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100)
  ),
  result_rows AS (
    SELECT
      paged.payment_channel,
      paged.payment_platform,
      paged.payment_status,
      paged.fulfillment_status,
      paged.refund_status,
      paged.id,
      paged.tenant_id,
      paged.order_no,
      paged.product_code,
      paged.product_name,
      paged.amount_fen,
      paged.term_years,
      paged.payment_expires_at,
      paged.paid_at,
      paged.closed_at,
      paged.failure_code,
      paged.created_at,
      paged.updated_at,
      paged.tenant_name,
      paged.tenant_slug,
      paged.entitlement_starts_at,
      paged.entitlement_expires_at,
      paged.entitlement_status,
      paged.entitlement_source,
      paged.entitlement_source_id,
      false AS count_only,
      paged.total_count
    FROM paged

    UNION ALL

    SELECT
      NULL::text AS payment_channel,
      NULL::text AS payment_platform,
      NULL::text AS payment_status,
      NULL::text AS fulfillment_status,
      NULL::text AS refund_status,
      NULL::uuid AS id,
      NULL::uuid AS tenant_id,
      NULL::text AS order_no,
      NULL::text AS product_code,
      NULL::text AS product_name,
      NULL::integer AS amount_fen,
      NULL::integer AS term_years,
      NULL::timestamptz AS payment_expires_at,
      NULL::timestamptz AS paid_at,
      NULL::timestamptz AS closed_at,
      NULL::text AS failure_code,
      NULL::timestamptz AS created_at,
      NULL::timestamptz AS updated_at,
      NULL::text AS tenant_name,
      NULL::text AS tenant_slug,
      NULL::timestamptz AS entitlement_starts_at,
      NULL::timestamptz AS entitlement_expires_at,
      NULL::text AS entitlement_status,
      NULL::text AS entitlement_source,
      NULL::uuid AS entitlement_source_id,
      true AS count_only,
      statistics.total_count
    FROM statistics
    WHERE NOT EXISTS (SELECT 1 FROM paged)
  )
  SELECT result_rows.*
  FROM result_rows
  ORDER BY
    result_rows.count_only ASC,
    result_rows.created_at DESC NULLS LAST,
    result_rows.id DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.branding_list_entitlement_orders(
  uuid, integer, integer, text, text, text, text, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_list_entitlement_orders(
  uuid, integer, integer, text, text, text, text, text, timestamptz, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.branding_get_entitlement_order_detail(
  p_tenant_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate_count integer;
  v_channel text;
  v_result jsonb;
BEGIN
  SELECT count(*), min(candidate.payment_channel)
  INTO v_candidate_count, v_channel
  FROM (
    SELECT 'legacy_direct'::text AS payment_channel
    FROM public.tenant_addon_orders AS legacy
    WHERE legacy.id = p_order_id
      AND (p_tenant_id IS NULL OR legacy.tenant_id = p_tenant_id)

    UNION ALL

    SELECT 'wechat_virtual'::text AS payment_channel
    FROM public.tenant_virtual_addon_orders AS virtual
    WHERE virtual.id = p_order_id
      AND (p_tenant_id IS NULL OR virtual.tenant_id = p_tenant_id)
  ) AS candidate;

  IF v_candidate_count = 0 THEN
    RETURN NULL;
  END IF;

  IF v_candidate_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding entitlement order identity collision',
      DETAIL = 'BRANDING_ENTITLEMENT_ORDER_ID_COLLISION';
  END IF;

  IF v_channel = 'legacy_direct' THEN
    SELECT jsonb_build_object(
      'payment_channel', 'legacy_direct',
      'order', jsonb_build_object(
        'payment_channel', 'legacy_direct',
        'payment_platform', 'unknown',
        'payment_status', CASE legacy.status
          WHEN 'paid' THEN 'succeeded'
          ELSE legacy.status
        END,
        'fulfillment_status', CASE legacy.status
          WHEN 'paid' THEN 'granted'
          ELSE 'pending'
        END,
        'refund_status', 'none',
        'id', legacy.id,
        'tenant_id', legacy.tenant_id,
        'order_no', legacy.order_no,
        'out_trade_no', legacy.out_trade_no,
        'product_code', legacy.product_code,
        'entitlement_code', legacy.entitlement_code,
        'product_name', legacy.product_name,
        'amount_fen', legacy.amount_fen,
        'term_years', legacy.term_years,
        'purchase_notes', legacy.purchase_notes,
        'refund_policy', legacy.refund_policy,
        'channel', legacy.channel,
        'payment_expires_at', legacy.payment_expires_at,
        'transaction_id', legacy.transaction_id,
        'paid_amount_fen', legacy.paid_amount_fen,
        'paid_at', legacy.paid_at,
        'closed_at', legacy.closed_at,
        'failure_code', legacy.failure_code,
        'failure_message', legacy.failure_message,
        'entitlement_event_id', legacy.entitlement_event_id,
        'created_by', legacy.created_by,
        'created_at', legacy.created_at,
        'updated_at', legacy.updated_at,
        'tenant_name', tenant.name,
        'tenant_slug', tenant.slug,
        'entitlement_starts_at', entitlement.starts_at,
        'entitlement_expires_at', entitlement.expires_at,
        'entitlement_status', entitlement.status,
        'entitlement_source', entitlement.source_type,
        'entitlement_source_id', entitlement.source_id
      ),
      'entitlement', CASE WHEN entitlement.id IS NULL THEN NULL ELSE
        jsonb_build_object(
          'starts_at', entitlement.starts_at,
          'expires_at', entitlement.expires_at,
          'status', entitlement.status,
          'source', entitlement.source_type,
          'order_no', CASE
            WHEN entitlement.source_type = 'purchase'
             AND entitlement.source_id = legacy.id
            THEN legacy.order_no
            ELSE source_order.order_no
          END
        )
      END,
      'entitlement_event', CASE WHEN entitlement_event.id IS NULL THEN NULL ELSE
        jsonb_build_object(
          'id', entitlement_event.id,
          'event_type', entitlement_event.event_type,
          'source_type', entitlement_event.source_type,
          'source_id', entitlement_event.source_id,
          'reason', entitlement_event.reason,
          'created_at', entitlement_event.created_at
        )
      END,
      'audit', CASE WHEN audit.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', audit.id,
        'action', audit.action,
        'status', audit.status,
        'summary', audit.summary,
        'created_at', audit.created_at
      ) END,
      'audit_summary', jsonb_build_object(
        'source', 'legacy_order',
        'payment_status', CASE legacy.status
          WHEN 'paid' THEN 'succeeded'
          ELSE legacy.status
        END,
        'fulfillment_status', CASE legacy.status
          WHEN 'paid' THEN 'granted'
          ELSE 'pending'
        END,
        'refund_status', 'none',
        'failure_code', legacy.failure_code,
        'failure_message', legacy.failure_message,
        'updated_at', legacy.updated_at
      )
    )
    INTO v_result
    FROM public.tenant_addon_orders AS legacy
    JOIN public.tenants AS tenant ON tenant.id = legacy.tenant_id
    LEFT JOIN public.tenant_entitlements AS entitlement
      ON entitlement.tenant_id = legacy.tenant_id
     AND entitlement.entitlement_code = legacy.entitlement_code
    LEFT JOIN LATERAL (
      SELECT source.order_no
      FROM (
        SELECT direct.order_no
        FROM public.tenant_addon_orders AS direct
        WHERE direct.id = entitlement.source_id
          AND direct.tenant_id = entitlement.tenant_id
        UNION ALL
        SELECT virtual.order_no
        FROM public.tenant_virtual_addon_orders AS virtual
        WHERE virtual.id = entitlement.source_id
          AND virtual.tenant_id = entitlement.tenant_id
      ) AS source
      LIMIT 1
    ) AS source_order ON entitlement.source_type = 'purchase'
    LEFT JOIN public.tenant_entitlement_events AS entitlement_event
      ON entitlement_event.id = legacy.entitlement_event_id
     AND entitlement_event.tenant_id = legacy.tenant_id
     AND entitlement_event.entitlement_code = legacy.entitlement_code
     AND entitlement_event.source_type = 'purchase'
     AND entitlement_event.source_id = legacy.id
    LEFT JOIN LATERAL (
      SELECT audit_log.id, audit_log.action, audit_log.status,
        audit_log.summary, audit_log.created_at
      FROM public.platform_audit_logs AS audit_log
      WHERE audit_log.resource_type = 'tenant_addon_order'
        AND audit_log.resource_id = legacy.id
        AND audit_log.action = 'branding_addon_purchase.confirm'
      ORDER BY audit_log.created_at DESC, audit_log.id DESC
      LIMIT 1
    ) AS audit ON TRUE
    WHERE legacy.id = p_order_id
      AND (p_tenant_id IS NULL OR legacy.tenant_id = p_tenant_id);

    RETURN v_result;
  END IF;

  SELECT jsonb_build_object(
    'payment_channel', 'wechat_virtual',
    'order', jsonb_build_object(
      'payment_channel', 'wechat_virtual',
      'payment_platform', virtual.requested_platform,
      'payment_status', virtual.payment_status,
      'fulfillment_status', virtual.fulfillment_status,
      'refund_status', virtual.refund_status,
      'id', virtual.id,
      'tenant_id', virtual.tenant_id,
      'order_no', virtual.order_no,
      'out_trade_no', virtual.out_trade_no,
      'product_code', virtual.product_code,
      'entitlement_code', virtual.entitlement_code,
      'product_name', virtual.product_name,
      'amount_fen', virtual.amount_fen,
      'term_years', virtual.term_years,
      'purchase_notes', virtual.purchase_notes,
      'refund_policy', virtual.refund_policy,
      'environment', virtual.environment,
      'requested_platform', virtual.requested_platform,
      'settlement_channel', virtual.settlement_channel,
      'provider_order_no', virtual.provider_order_no,
      'transaction_id', virtual.transaction_id,
      'payment_expires_at', virtual.payment_expires_at,
      'paid_amount_fen', virtual.paid_amount_fen,
      'paid_at', virtual.paid_at,
      'closed_at', NULL,
      'failure_code', virtual.failure_code,
      'failure_message', virtual.failure_message,
      'entitlement_event_id', virtual.entitlement_event_id,
      'created_by', virtual.created_by,
      'created_at', virtual.created_at,
      'updated_at', virtual.updated_at,
      'tenant_name', tenant.name,
      'tenant_slug', tenant.slug,
      'entitlement_starts_at', entitlement.starts_at,
      'entitlement_expires_at', entitlement.expires_at,
      'entitlement_status', entitlement.status,
      'entitlement_source', entitlement.source_type,
      'entitlement_source_id', entitlement.source_id
    ),
    'entitlement', CASE WHEN entitlement.id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'starts_at', entitlement.starts_at,
        'expires_at', entitlement.expires_at,
        'status', entitlement.status,
        'source', entitlement.source_type,
        'order_no', CASE
          WHEN entitlement.source_type = 'purchase'
           AND entitlement.source_id = virtual.id
          THEN virtual.order_no
          ELSE source_order.order_no
        END
      )
    END,
    'entitlement_event', CASE WHEN entitlement_event.id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', entitlement_event.id,
        'event_type', entitlement_event.event_type,
        'source_type', entitlement_event.source_type,
        'source_id', entitlement_event.source_id,
        'reason', entitlement_event.reason,
        'created_at', entitlement_event.created_at
      )
    END,
    'audit', NULL,
    'audit_summary', jsonb_build_object(
      'source', 'virtual_order',
      'payment_status', virtual.payment_status,
      'fulfillment_status', virtual.fulfillment_status,
      'refund_status', virtual.refund_status,
      'failure_code', virtual.failure_code,
      'failure_message', virtual.failure_message,
      'updated_at', virtual.updated_at
    )
  )
  INTO v_result
  FROM public.tenant_virtual_addon_orders AS virtual
  JOIN public.tenants AS tenant ON tenant.id = virtual.tenant_id
  LEFT JOIN public.tenant_entitlements AS entitlement
    ON entitlement.tenant_id = virtual.tenant_id
   AND entitlement.entitlement_code = virtual.entitlement_code
  LEFT JOIN LATERAL (
    SELECT source.order_no
    FROM (
      SELECT direct.order_no
      FROM public.tenant_addon_orders AS direct
      WHERE direct.id = entitlement.source_id
        AND direct.tenant_id = entitlement.tenant_id
      UNION ALL
      SELECT other_virtual.order_no
      FROM public.tenant_virtual_addon_orders AS other_virtual
      WHERE other_virtual.id = entitlement.source_id
        AND other_virtual.tenant_id = entitlement.tenant_id
    ) AS source
    LIMIT 1
  ) AS source_order ON entitlement.source_type = 'purchase'
  LEFT JOIN public.tenant_entitlement_events AS entitlement_event
    ON entitlement_event.id = virtual.entitlement_event_id
   AND entitlement_event.tenant_id = virtual.tenant_id
   AND entitlement_event.entitlement_code = virtual.entitlement_code
   AND entitlement_event.source_type = 'purchase'
   AND entitlement_event.source_id = virtual.id
  WHERE virtual.id = p_order_id
    AND (p_tenant_id IS NULL OR virtual.tenant_id = p_tenant_id);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_get_entitlement_order_detail(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.branding_get_entitlement_order_detail(uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.branding_list_entitlement_orders(
  uuid, integer, integer, text, text, text, text, text, timestamptz, timestamptz
) IS 'Returns one bounded, tenant-aware page across legacy and virtual branding entitlement orders without application N+1 queries.';
COMMENT ON FUNCTION public.branding_get_entitlement_order_detail(uuid, uuid)
IS 'Returns one tenant-scoped safe detail and channel-specific audit summary for a legacy or virtual branding entitlement order.';

COMMIT;
