import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723143000_create_supplier_foundation_commands.sql",
    import.meta.url,
  ),
  "utf8",
);
const relationshipMigration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723141000_create_tenant_supplier_relationships.sql",
    import.meta.url,
  ),
  "utf8",
);

function extractFunction(name: string) {
  const start = migration.search(
    new RegExp(`CREATE FUNCTION public\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = migration.indexOf("\n$$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 4);
}

function expectContracts(sql: string, contracts: readonly RegExp[]) {
  for (const contract of contracts) expect(sql).toMatch(contract);
}

describe("tenant supplier paginated RPC contracts", () => {
  test("available directory returns exact total from the same materialized candidates", () => {
    const sql = extractFunction("list_available_suppliers_for_tenant");

    expectContracts(sql, [
      /eligible_suppliers AS MATERIALIZED\s*\([\s\S]*onboarding_status = 'approved'[\s\S]*operational_status = 'active'[\s\S]*NOT EXISTS[\s\S]*tenant_suppliers/,
      /SELECT count\(\*\)[\s\S]*FROM eligible_suppliers/,
      /FROM eligible_suppliers[\s\S]*ORDER BY name ASC, id ASC[\s\S]*LIMIT v_page_size[\s\S]*OFFSET \(v_page - 1\) \* v_page_size/,
      /jsonb_build_object\([\s\S]*'items', v_items[\s\S]*'total', v_total[\s\S]*'page', v_page[\s\S]*'page_size', v_page_size/,
    ]);
    expect((sql.match(/onboarding_status = 'approved'/g) ?? [])).toHaveLength(1);
    expect((sql.match(/operational_status = 'active'/g) ?? [])).toHaveLength(1);
  });

  test("relationship list is tenant-isolated, exact-counted, and eligibility-filtered in one RPC", () => {
    const sql = extractFunction("list_tenant_suppliers_for_tenant");

    expectContracts(sql, [
      /p_tenant_id uuid[\s\S]*p_keyword text[\s\S]*p_relationship_status text[\s\S]*p_eligible boolean[\s\S]*p_checked_at timestamptz[\s\S]*p_page integer DEFAULT 1[\s\S]*p_page_size integer DEFAULT 20/,
      /IF p_checked_at IS NULL THEN[\s\S]*SUPPLIER_ORDER_NOT_ELIGIBLE/,
      /LEAST\(GREATEST\(COALESCE\(p_page_size, 20\), 1\), 100\)/,
      /eligibility AS MATERIALIZED\s*\([\s\S]*get_tenant_supplier_order_eligibility_set\([\s\S]*p_checked_at[\s\S]*eligible_relationships AS MATERIALIZED\s*\([\s\S]*relationship\.tenant_id = p_tenant_id/,
      /p_relationship_status IS NULL[\s\S]*relationship\.relationship_status = p_relationship_status/,
      /p_eligible IS NULL[\s\S]*eligible/,
      /SELECT count\(\*\)[\s\S]*FROM eligible_relationships/,
      /FROM eligible_relationships[\s\S]*ORDER BY updated_at DESC, id DESC[\s\S]*LIMIT v_page_size[\s\S]*OFFSET \(v_page - 1\) \* v_page_size/,
      /jsonb_build_object\([\s\S]*'items', v_items[\s\S]*'total', v_total/,
    ]);
    expect((sql.match(/relationship\.tenant_id = p_tenant_id/g) ?? []))
      .toHaveLength(1);
  });

  test("both query RPCs stay private to service_role", () => {
    for (const name of [
      "list_available_suppliers_for_tenant",
      "list_tenant_suppliers_for_tenant",
    ]) {
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) FROM PUBLIC, anon, authenticated;`,
      ));
      expect(migration).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role;`,
      ));
    }
  });
});

describe("atomic supplier contract creation", () => {
  test("locks tenant relationship and enabled module before insertion", () => {
    const sql = extractFunction("create_supplier_contract");

    expectContracts(sql, [
      /p_contract_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_tenant_supplier_id uuid/,
      /p_expected_version integer[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /SELECT relationship\.\* INTO v_relationship[\s\S]*relationship\.id = p_tenant_supplier_id[\s\S]*relationship\.tenant_id = p_tenant_id[\s\S]*FOR UPDATE/,
      /SELECT setting\.\* INTO v_setting[\s\S]*setting\.tenant_id = p_tenant_id[\s\S]*FOR UPDATE[\s\S]*SUPPLIER_MODULE_DISABLED/,
      /INSERT INTO public\.supplier_contracts[\s\S]*RETURNING \* INTO v_contract/,
    ]);
  });

  test("uses complete fingerprint and atomically replays the command ledger", () => {
    const sql = extractFunction("create_supplier_contract");
    const fingerprintFields = [
      "tenant_id",
      "tenant_supplier_id",
      "contract_no",
      "name",
      "valid_from",
      "valid_until",
      "settlement_term_days",
      "invoice_required_before_payment",
      "document_file_id",
      "expected_version",
      "actor_employee_id",
    ];

    for (const field of fingerprintFields) {
      expect(sql).toContain(`'${field}', p_${field}`);
    }
    expect(sql).not.toContain("'contract_id', p_contract_id");
    expect(sql).not.toContain("v_event.resource_id <> p_contract_id");
    expectContracts(sql, [
      /pg_advisory_xact_lock[\s\S]*FROM public\.supplier_command_events[\s\S]*FOR UPDATE/,
      /v_event\.from_state -> '_request' IS DISTINCT FROM v_request[\s\S]*SUPPLIER_IDEMPOTENCY_CONFLICT/,
      /'idempotent', true[\s\S]*'contract', v_event\.to_state/,
      /INSERT INTO public\.supplier_command_events[\s\S]*'create_supplier_contract'[\s\S]*jsonb_build_object\('_request', v_request\)[\s\S]*to_jsonb\(v_contract\)/,
      /'idempotent', false[\s\S]*'contract', to_jsonb\(v_contract\)/,
    ]);
    expect(sql.indexOf("INSERT INTO public.supplier_contracts"))
      .toBeLessThan(sql.indexOf("INSERT INTO public.supplier_command_events"));
  });

  test("contract create is service-role only and included in rollback guidance", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_supplier_contract\([^;]+\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_supplier_contract\([^;]+\) TO service_role;/,
    );
    expect(migration.slice(0, 700)).toContain("create_supplier_contract");
  });
});

describe("tenant supplier review hardening contracts", () => {
  test("relationship commands persist and replay the same supplier-enriched envelope", () => {
    for (const name of [
      "create_tenant_supplier",
      "mutate_tenant_supplier",
    ]) {
      const sql = extractFunction(name);
      expectContracts(sql, [
        /v_snapshot jsonb/,
        /v_snapshot := to_jsonb\(v_relationship\)[\s\S]*jsonb_build_object\([\s\S]*'supplier'/,
        /INSERT INTO public\.supplier_command_events[\s\S]*v_snapshot/,
        /'tenant_supplier', v_snapshot/,
        /'idempotent', true[\s\S]*'tenant_supplier', v_event\.to_state/,
      ]);
    }
  });

  test("contract mutation fingerprints and locks the URL parent relationship", () => {
    const sql = extractFunction("mutate_supplier_contract");
    expectContracts(sql, [
      /p_tenant_id uuid,[\s\S]*p_tenant_supplier_id uuid,[\s\S]*p_contract_id uuid/,
      /'tenant_supplier_id', p_tenant_supplier_id/,
      /contract\.id = p_contract_id[\s\S]*contract\.tenant_id = p_tenant_id[\s\S]*contract\.tenant_supplier_id = p_tenant_supplier_id[\s\S]*FOR UPDATE/,
      /v_relationship\.id IS DISTINCT FROM p_tenant_supplier_id/,
    ]);
  });

  test("eligibility is one set-based source reused by detail and list RPCs", () => {
    const setFunction = extractFunction("get_tenant_supplier_order_eligibility_set");
    const detail = extractFunction("get_tenant_supplier_order_eligibility");
    const list = extractFunction("list_tenant_suppliers_for_tenant");
    expectContracts(setFunction, [
      /RETURNS TABLE\s*\(/,
      /qualification_status AS MATERIALIZED/,
      /GROUP BY[\s\S]*tenant_supplier_id/,
      /contract_status AS MATERIALIZED/,
      /ARRAY_REMOVE\(ARRAY\[[\s\S]*'module_disabled'[\s\S]*'supplier_not_approved'[\s\S]*'supplier_suspended'[\s\S]*'supplier_blacklisted'[\s\S]*'relationship_not_active'[\s\S]*'required_qualification_missing'[\s\S]*'required_qualification_expired'[\s\S]*'active_contract_required'/,
    ]);
    expect(detail).toContain("get_tenant_supplier_order_eligibility_set");
    expect(list).toContain("get_tenant_supplier_order_eligibility_set");
    expect(list).not.toMatch(
      /LATERAL|get_tenant_supplier_order_eligibility\(/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_tenant_supplier_order_eligibility_set\([^;]+\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_tenant_supplier_order_eligibility_set/,
    );
  });

  test("computes contract health once with stable truth and precedence", () => {
    const setFunction = extractFunction("get_tenant_supplier_order_eligibility_set");
    const list = extractFunction("list_tenant_suppliers_for_tenant");

    expectContracts(setFunction, [
      /RETURNS TABLE\s*\([\s\S]*contract_health text/,
      /contract_status AS MATERIALIZED\s*\([\s\S]*bool_or\([\s\S]*contract\.lifecycle_status = 'active'[\s\S]*contract\.valid_from <= p_checked_at::date[\s\S]*contract\.valid_until > p_checked_at::date \+ 30[\s\S]*\) AS has_valid_contract/,
      /bool_or\([\s\S]*contract\.lifecycle_status = 'active'[\s\S]*contract\.valid_from <= p_checked_at::date[\s\S]*contract\.valid_until >= p_checked_at::date[\s\S]*contract\.valid_until <= p_checked_at::date \+ 30[\s\S]*\) AS has_expiring_contract/,
      /bool_or\([\s\S]*contract\.lifecycle_status = 'active'[\s\S]*contract\.valid_until < p_checked_at::date[\s\S]*\) AS has_expired_contract/,
      /CASE[\s\S]*has_valid_contract[\s\S]*THEN 'valid'[\s\S]*has_expiring_contract[\s\S]*THEN 'expiring'[\s\S]*has_expired_contract[\s\S]*THEN 'expired'[\s\S]*ELSE 'missing'[\s\S]*END AS contract_health/,
    ]);
    expect((setFunction.match(/public\.supplier_contracts/g) ?? []))
      .toHaveLength(1);
    expectContracts(list, [
      /'contract_health', eligibility\.contract_health/,
      /JOIN eligibility[\s\S]*p_eligible IS NULL[\s\S]*eligibility\.eligible = p_eligible/,
      /SELECT count\(\*\)[\s\S]*FROM eligible_relationships/,
    ]);
    expect(list).not.toMatch(/supplier_contracts|LATERAL/);
  });

  test("validates tenant owner employees under a share lock", () => {
    expectContracts(relationshipMigration, [
      /CREATE FUNCTION public\.validate_tenant_supplier_owner_employee\(\)[\s\S]*RETURNS trigger[\s\S]*SET search_path = pg_catalog, public/,
      /IF NEW\.tenant_owner_employee_id IS NULL THEN[\s\S]*RETURN NEW/,
      /FROM public\.employees AS employee[\s\S]*employee\.id = NEW\.tenant_owner_employee_id[\s\S]*employee\.tenant_id = NEW\.tenant_id[\s\S]*FOR SHARE/,
      /MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT'/,
      /CREATE TRIGGER tr_tenant_suppliers_validate_owner_employee[\s\S]*BEFORE INSERT OR UPDATE OF tenant_owner_employee_id, tenant_id/,
      /REVOKE ALL ON FUNCTION public\.validate_tenant_supplier_owner_employee\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    ]);
  });

  test("accepts only active tenant-owned supplier contract documents", () => {
    expectContracts(relationshipMigration, [
      /CREATE FUNCTION public\.validate_supplier_contract_document\(\)[\s\S]*RETURNS trigger[\s\S]*SET search_path = pg_catalog, public/,
      /file\.id = NEW\.document_file_id[\s\S]*file\.tenant_id = NEW\.tenant_id[\s\S]*file\.owner_type = 'tenant'[\s\S]*file\.owner_id = NEW\.tenant_id[\s\S]*file\.scene = 'supplier_contract_document'[\s\S]*file\.status = 'active'[\s\S]*file\.deleted_at IS NULL[\s\S]*FOR SHARE/,
      /MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT'/,
      /CREATE TRIGGER tr_supplier_contracts_validate_document[\s\S]*BEFORE INSERT OR UPDATE OF document_file_id, tenant_id/,
      /REVOKE ALL ON FUNCTION public\.validate_supplier_contract_document\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    ]);
  });
});
