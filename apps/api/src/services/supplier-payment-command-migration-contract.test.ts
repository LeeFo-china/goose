import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260731110000_create_supplier_payment_requests.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

function fn(name: string) {
  const start = migration.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = migration.indexOf("\n$$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 4);
}

function contracts(source: string, patterns: readonly RegExp[]) {
  for (const pattern of patterns) expect(source).toMatch(pattern);
}

function ordered(source: string, patterns: readonly RegExp[]) {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor));
    expect(match, `missing ordered contract ${pattern}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

const commands = [
  "save_supplier_payment_request_draft",
  "submit_supplier_payment_request",
  "review_supplier_payment_request",
  "cancel_supplier_payment_request",
  "close_supplier_payment_request",
  "confirm_supplier_payment",
] as const;
const commandRevoke = migration.slice(
  migration.indexOf(
    "REVOKE ALL ON FUNCTION\n  public.save_supplier_payment_request_draft",
  ),
  migration.indexOf(
    "FROM PUBLIC, anon, authenticated;",
    migration.indexOf(
      "REVOKE ALL ON FUNCTION\n  public.save_supplier_payment_request_draft",
    ),
  ),
);
const commandGrant = migration.slice(
  migration.indexOf(
    "GRANT EXECUTE ON FUNCTION\n  public.save_supplier_payment_request_draft",
  ),
  migration.indexOf(
    "TO service_role;",
    migration.indexOf(
      "GRANT EXECUTE ON FUNCTION\n  public.save_supplier_payment_request_draft",
    ),
  ),
);

describe("supplier payment atomic command migration contract", () => {
  test("creates six private commands with exact replay fingerprints", () => {
    for (const name of commands) {
      const command = fn(name);
      contracts(command, [
        /RETURNS jsonb/,
        /SECURITY DEFINER/,
        /SET search_path = pg_catalog, public/,
        /assert_supplier_purchase_order_actor/,
        /v_request := jsonb_build_object/,
        /actor_employee_id/,
        /pg_advisory_xact_lock/,
        /supplier_command_events/,
        /v_event\.from_state -> '_request' IS DISTINCT FROM v_request/,
        /SUPPLIER_IDEMPOTENCY_CONFLICT/,
        /'idempotent', true/,
        /record_supplier_payment_command_result/,
      ]);
      expect(commandRevoke).toContain(`public.${name}(`);
      expect(commandGrant).toContain(`public.${name}(`);
    }
    contracts(fn("record_supplier_payment_command_result"), [
      /INSERT INTO public\.supplier_command_events/,
      /jsonb_build_object\('_request', p_request\)/,
      /p_result - 'idempotent'/,
    ]);
  });

  test("saves only coherent draft allocations and creates at version zero", () => {
    const save = fn("save_supplier_payment_request_draft");
    contracts(save, [
      /p_expected_version <> 0/,
      /v_payment_request\.status <> 'draft'/,
      /v_payment_request\.version <> p_expected_version/,
      /jsonb_array_length\(p_allocations\) BETWEEN 1 AND 100/,
      /COUNT\(DISTINCT input\.payable_event_id\)/,
      /v_allocation_count <> v_resolved_count/,
      /FROM public\.supplier_payable_events/,
      /payable\.tenant_id = p_tenant_id/,
      /payable\.project_id = p_project_id/,
      /payable\.tenant_supplier_id = p_tenant_supplier_id/,
      /payable\.currency = 'CNY'/,
      /INSERT INTO public\.supplier_payment_request_allocations/,
      /DELETE FROM public\.supplier_payment_request_allocations/,
      /status = 'draft'/,
      /SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH/,
      /SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT/,
    ]);
    expect(save).not.toMatch(/reserved_unpaid_amount/);
  });

  test("submits with the fixed lock order and recomputes active reservations", () => {
    const submit = fn("submit_supplier_payment_request");
    ordered(submit, [
      /FROM public\.supplier_payment_requests[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_payable_events[\s\S]*?ORDER BY payable\.id[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_payment_request_allocations AS active_allocation[\s\S]*?ORDER BY\s*active_allocation\.payment_request_id,\s*active_allocation\.payable_event_id[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_payment_request_allocations AS current_allocation[\s\S]*?ORDER BY current_allocation\.payable_event_id[\s\S]*?FOR UPDATE/,
      /SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE/,
      /status = 'pending_approval'/,
    ]);
    contracts(submit, [
      /active_request\.status IN \(\s*'pending_approval',\s*'approved',\s*'partially_paid'\s*\)/,
      /active_allocation\.payment_request_id <> p_payment_request_id/,
      /active_allocation\.requested_amount -\s*active_allocation\.paid_amount/,
      /SUM\(current_allocation\.requested_amount\)/,
      /requested_amount = v_requested_amount/,
    ]);
  });

  test("reviews pending requests and forbids submitter self review", () => {
    const review = fn("review_supplier_payment_request");
    contracts(review, [
      /p_action NOT IN \('approve', 'reject'\)/,
      /v_payment_request\.status <> 'pending_approval'/,
      /v_payment_request\.submitted_by_employee_id = p_actor_employee_id/,
      /SUPPLIER_PAYMENT_REQUEST_SELF_REVIEW_FORBIDDEN/,
      /p_action = 'reject'[\s\S]*btrim\(p_remark\) = ''/,
      /p_action = 'approve'[\s\S]*status = 'approved'/,
      /ELSE[\s\S]*status = 'rejected'/,
    ]);
    expect(review).not.toMatch(/workflow_(?:instances|tasks|events)/);
  });

  test("cancels unpaid eligible requests and closes only partial payments", () => {
    const cancel = fn("cancel_supplier_payment_request");
    contracts(cancel, [
      /status NOT IN \(\s*'draft', 'pending_approval', 'approved'\s*\)/,
      /paid_amount <> 0/,
      /status = 'cancelled'/,
      /cancel_reason = btrim\(p_reason\)/,
      /SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT/,
    ]);
    const close = fn("close_supplier_payment_request");
    contracts(close, [
      /status <> 'partially_paid'/,
      /status = 'closed'/,
      /close_reason = btrim\(p_reason\)/,
      /SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT/,
    ]);
  });

  test("checks invoice capability before any payment side effect", () => {
    const confirm = fn("confirm_supplier_payment");
    const invoiceGate = confirm.indexOf(
      "SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED",
    );
    expect(invoiceGate).toBeGreaterThan(0);
    for (const sideEffect of [
      "INSERT INTO public.supplier_payments",
      "INSERT INTO public.supplier_payment_allocations",
      "UPDATE public.supplier_payment_request_allocations",
      "INSERT INTO public.finance_ledger_entries",
    ]) {
      expect(confirm.indexOf(sideEffect)).toBeGreaterThan(invoiceGate);
    }
    contracts(confirm.slice(0, invoiceGate), [
      /supplier_payable_events/,
      /invoice_required_before_payment/,
    ]);
    contracts(confirm, [
      /'status', 'invoice_required'/,
      /'error_code',\s*'SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED'/,
    ]);
  });

  test("confirms payment under locks and writes one complete cash fact", () => {
    const confirm = fn("confirm_supplier_payment");
    ordered(confirm, [
      /FROM public\.supplier_payment_requests[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_payable_events[\s\S]*?ORDER BY payable\.id[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_payment_request_allocations AS active_allocation[\s\S]*?ORDER BY\s*active_allocation\.payment_request_id,\s*active_allocation\.payable_event_id[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_payment_request_allocations AS current_allocation[\s\S]*?ORDER BY current_allocation\.payable_event_id[\s\S]*?FOR UPDATE/,
      /SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED/,
      /INSERT INTO public\.supplier_payments/,
      /INSERT INTO public\.supplier_payment_allocations/,
      /UPDATE public\.supplier_payment_request_allocations/,
      /UPDATE public\.supplier_payment_requests/,
      /INSERT INTO public\.finance_ledger_entries/,
      /record_supplier_payment_command_result/,
    ]);
    contracts(confirm, [
      /status NOT IN \('approved', 'partially_paid'\)/,
      /jsonb_array_length\(p_evidence_images\) BETWEEN 1 AND 9/,
      /'status', 'evidence_required'[\s\S]*'SUPPLIER_PAYMENT_EVIDENCE_REQUIRED'/,
      /COUNT\(DISTINCT input\.payment_request_allocation_id\)/,
      /COUNT\(DISTINCT input\.payable_event_id\)/,
      /v_input_count <> v_resolved_count/,
      /SUM\(input\.amount\)[\s\S]*v_payment_amount/,
      /allocation\.requested_amount - allocation\.paid_amount/,
      /payable\.amount - COALESCE\([\s\S]*supplier_payment_allocations/,
      /SUPPLIER_PAYMENT_ALLOCATION_INVALID/,
      /SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE/,
      /SET paid_amount = paid_amount \+ v_payment_amount/,
      /status = CASE[\s\S]*'paid'[\s\S]*'partially_paid'/,
      /VALUES \([\s\S]*'out',[\s\S]*'supplier_payment',[\s\S]*'supplier_payment'/,
      /ON CONFLICT \(tenant_id, source_type, source_id, entry_type\) DO NOTHING/,
      /GET DIAGNOSTICS v_ledger_rows = ROW_COUNT/,
      /v_ledger_rows <> 1/,
      /'payment_request',[\s\S]*'payment',[\s\S]*'version'/,
      /'idempotent', false/,
    ]);
  });

  test("returns original success or error envelopes on exact replay", () => {
    for (const name of commands) {
      const command = fn(name);
      expect(command).toMatch(
        /IF FOUND THEN[\s\S]*v_event\.from_state -> '_request' IS DISTINCT FROM v_request[\s\S]*RETURN v_event\.to_state \|\| jsonb_build_object\(\s*'idempotent', true\s*\)/,
      );
    }
    expect(migration).toMatch(
      /CREATE FUNCTION public\.record_supplier_payment_command_result\([\s\S]*p_result jsonb[\s\S]*to_state[\s\S]*p_result - 'idempotent'/,
    );
  });

  test("uses stable version-conflict envelopes in every versioned command", () => {
    for (const name of commands) {
      const command = fn(name);
      expect(command).toMatch(
        /'status', 'version_conflict'[\s\S]*'error_code',\s*'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT'/,
      );
    }
  });
});
