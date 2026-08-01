import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../../../../supabase/migrations/20260801103000_integrate_branding_virtual_payment_refund_notifications.sql",
  import.meta.url,
), "utf8");
const refundMigration = readFileSync(new URL(
  "../../../../supabase/migrations/20260731135000_create_branding_virtual_payment_refunds.sql",
  import.meta.url,
), "utf8");

describe("virtual refund notification migrations", () => {
  test("uses the official inquiry event and service-role-only RPCs", () => {
    expect(migration).toContain("xpay_subscribe_ios_refund_query_notify");
    expect(migration).not.toContain("'xpay_refund_inquiry'");
    expect(migration.match(/SET search_path = pg_catalog, public/g)?.length).toBe(3);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  test("records a notification-first Apple channel only from a full refund fact", () => {
    expect(migration).toContain(
      "branding_record_apple_virtual_order_type_from_refund_fact",
    );
    for (const fact of [
      "p_official_status NOT IN (7, 8)",
      "p_provider_order_type IS DISTINCT FROM 8",
      "p_refund_fee_fen <> p_order_fee_fen OR p_left_fee_fen <> 0",
      "p_refund_fee_fen <> 0 OR p_left_fee_fen <> p_order_fee_fen",
      "v_order.provider_order_no IS DISTINCT FROM p_provider_order_no",
      "v_order.paid_amount_fen IS DISTINCT FROM v_order.amount_fen",
      "v_order.provider_order_type = 0",
      "SET provider_order_type = 7",
    ]) expect(migration).toContain(fact);
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.branding_record_apple_virtual_order_type_from_refund_fact",
    );
  });

  test("keeps success terminal and rejects crossed provider facts", () => {
    expect(migration).toContain("v_refund.status = 'succeeded'");
    expect(migration).toContain("does not increment version");
    expect(migration).toContain("conflicting.id <> v_refund.id");
    expect(migration).toContain("v_order.provider_order_no IS DISTINCT FROM p_provider_order_id");
    expect(migration).toContain("p_successful <> (p_refund_succeeded_at IS NOT NULL)");
    expect(migration).toContain("provider_refund_no = p_local_refund_no");
    expect(refundMigration).toContain("provider_refund_no = refund_no");
    expect(migration).toContain("provider_refund_succeeded_at = coalesce");
    expect(migration).toContain("succeeded_at = p_refund_succeeded_at");
    expect(migration).toContain(
      "v_refund.provider_refund_started_at <> p_refund_started_at",
    );
    expect(migration).not.toContain(
      "apple_receipt_hash,\n      encode(public.digest(p_provider_refund_id",
    );
  });

  test("follows legal order transitions for Apple creation and callback facts", () => {
    expect(refundMigration).toMatch(/SET refund_status = 'reviewing'[\s\S]+SET refund_status = 'external_required'/);
    expect(migration).toMatch(/SET refund_status = 'reviewing'[\s\S]+SET refund_status = 'external_required'/);
    expect(migration).toContain("SET refund_status = 'submitted'");
  });

  test("only recommends blocking an iOS refund from complete local facts", () => {
    for (const fact of [
      "v_order.provider_order_type = 7",
      "v_order.payment_status = 'succeeded'",
      "v_order.paid_amount_fen = v_order.amount_fen",
      "v_order.fulfillment_status = 'granted'",
      "v_order.entitlement_event_id IS NOT NULL",
      "v_order.provider_product_id = p_provider_product_id",
      "p_quantity = 1",
    ]) expect(migration).toContain(fact);
    expect(migration).toContain("approved.request_source = 'platform_admin'");
    expect(migration).toContain("approved.status = 'external_required'");
    expect(migration).toContain("IF v_platform_approved THEN");
    expect(migration).toContain("平台已完成售后申请核验");
  });
});
