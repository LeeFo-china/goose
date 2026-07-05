CREATE INDEX IF NOT EXISTS tenant_partner_bindings_partner_bound_idx
  ON public.tenant_partner_bindings(partner_id, bound_at DESC);

CREATE INDEX IF NOT EXISTS partner_commission_ledger_partner_created_idx
  ON public.partner_commission_ledger(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_settlement_batches_partner_created_idx
  ON public.partner_settlement_batches(partner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_partner_dashboard_monthly_summary(
  p_partner_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
RETURNS TABLE(
  tenant_count bigint,
  revenue_event_count bigint,
  revenue_amount_fen bigint,
  paid_amount_fen bigint,
  commission_amount_fen bigint,
  available_commission_amount_fen bigint,
  settled_commission_amount_fen bigint,
  settlement_batch_count bigint,
  settlement_total_amount_fen bigint,
  paid_settlement_amount_fen bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tenant_stats AS (
    SELECT count(*)::bigint AS tenant_count
    FROM public.tenant_partner_bindings
    WHERE partner_id = p_partner_id
      AND bound_at >= p_start_at
      AND bound_at < p_end_at
  ),
  revenue_stats AS (
    SELECT
      count(*)::bigint AS revenue_event_count,
      coalesce(sum(revenue_amount_fen), 0)::bigint AS revenue_amount_fen,
      coalesce(sum(paid_amount_fen), 0)::bigint AS paid_amount_fen
    FROM public.platform_revenue_events
    WHERE partner_id = p_partner_id
      AND created_at >= p_start_at
      AND created_at < p_end_at
  ),
  ledger_stats AS (
    SELECT
      coalesce(sum(commission_amount_fen), 0)::bigint AS commission_amount_fen,
      coalesce(sum(commission_amount_fen) filter (where status = 'available'), 0)::bigint AS available_commission_amount_fen,
      coalesce(sum(commission_amount_fen) filter (where status = 'settled'), 0)::bigint AS settled_commission_amount_fen
    FROM public.partner_commission_ledger
    WHERE partner_id = p_partner_id
      AND created_at >= p_start_at
      AND created_at < p_end_at
  ),
  settlement_stats AS (
    SELECT
      count(*)::bigint AS settlement_batch_count,
      coalesce(sum(total_amount_fen), 0)::bigint AS settlement_total_amount_fen,
      coalesce(sum(total_amount_fen) filter (where status = 'paid'), 0)::bigint AS paid_settlement_amount_fen
    FROM public.partner_settlement_batches
    WHERE partner_id = p_partner_id
      AND created_at >= p_start_at
      AND created_at < p_end_at
  )
  SELECT
    tenant_stats.tenant_count,
    revenue_stats.revenue_event_count,
    revenue_stats.revenue_amount_fen,
    revenue_stats.paid_amount_fen,
    ledger_stats.commission_amount_fen,
    ledger_stats.available_commission_amount_fen,
    ledger_stats.settled_commission_amount_fen,
    settlement_stats.settlement_batch_count,
    settlement_stats.settlement_total_amount_fen,
    settlement_stats.paid_settlement_amount_fen
  FROM tenant_stats
  CROSS JOIN revenue_stats
  CROSS JOIN ledger_stats
  CROSS JOIN settlement_stats;
$$;

REVOKE ALL ON FUNCTION public.get_partner_dashboard_monthly_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_partner_dashboard_monthly_summary(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_partner_dashboard_monthly_summary(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_dashboard_monthly_summary(uuid, timestamptz, timestamptz) TO service_role;
