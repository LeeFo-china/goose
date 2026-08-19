import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
const migrationUrl = new URL(
  "20260819121000_create_supplier_price_v2_commands.sql",
  migrationsDirectory,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string): string {
  return sql.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

describe("supplier price v2 command migration", () => {
  test("preserves both applied price migrations byte-for-byte", () => {
    const hashes = new Map([
      [
        "20260819100000_harden_supplier_price_tenant_contracts.sql",
        "77f5c5d7d7a063734575c002cae23156f6bafd960190dd090fb25806c2350583",
      ],
      [
        "20260819112000_close_supplier_price_runtime_boundaries.sql",
        "8d3912b46bca1e6c7f3084776478ed9914526a530eba84b16159a4fd5956871a",
      ],
    ]);

    for (const [name, expected] of hashes) {
      const contents = readFileSync(new URL(name, migrationsDirectory), "utf8");
      expect(createHash("sha256").update(contents).digest("hex")).toBe(expected);
    }
  });

  test("is a bounded forward transaction with an exact rollback procedure", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toMatch(/\bIF NOT EXISTS\b/i);
    expect(compact(sql.slice(0, sql.indexOf("BEGIN;")))).toMatch(
      /revoke EXECUTE.*two v2 commands.*restore.*operation_source.*proxy_reason.*never reopen the legacy six writers/i,
    );
  });

  test("adds a real tenant audit source with a null reason", () => {
    const normalized = compact(sql);
    const constraints = new Map([
      ["supplier_price_lists", "supplier_price_lists_operation_source_check"],
      ["supplier_price_list_items", "supplier_price_items_operation_source_check"],
    ]);
    for (const [table, constraint] of constraints) {
      expect(normalized).toContain(
        `${constraint} CHECK (operation_source IN ('tenant_proxy', 'tenant'))`,
      );
      expect(normalized).toContain(
        `ALTER TABLE public.${table} ALTER COLUMN proxy_reason DROP NOT NULL`,
      );
      expect(normalized).toContain(
        `operation_source = 'tenant' AND proxy_reason IS NULL`,
      );
      expect(normalized).toContain(
        `operation_source = 'tenant_proxy' AND proxy_reason = btrim(proxy_reason) AND proxy_reason <> ''`,
      );
    }
  });

  test("binds an active employee to the exact active tenant relationship", () => {
    const context = compact(extractFunction("assert_supplier_price_v2_context"));
    expect(context).toContain("SECURITY DEFINER");
    expect(context).toContain("SET search_path = pg_catalog, public");
    expect(context).toContain("employee.user_id = p_actor_user_id");
    expect(context).toContain("employee.tenant_id = p_tenant_id");
    expect(context).toContain("employee.status = 'active'");
    expect(context).toContain("relationship.id = p_tenant_supplier_id");
    expect(context).toContain("relationship.tenant_id = p_tenant_id");
    expect(context).toContain("relationship.supplier_id = p_supplier_id");
    expect(context).toContain("relationship.relationship_status = 'active'");
    expect(context).toContain("SUPPLIER_PROXY_ACTOR_INVALID");
    expect(context).toContain("SUPPLIER_ORDER_NOT_ELIGIBLE");
  });

  test("revalidates context and tenant resource visibility before replay", () => {
    for (const name of [
      "command_supplier_price_list_v2",
      "command_supplier_price_item_v2",
    ]) {
      const command = compact(extractFunction(name));
      const contextAt = command.indexOf("assert_supplier_price_v2_context");
      const resourceAt = command.indexOf("FROM public.supplier_price_lists AS price_list");
      const replayAt = command.indexOf("FROM public.supplier_command_events AS event");
      expect(contextAt, name).toBeGreaterThanOrEqual(0);
      expect(resourceAt, name).toBeGreaterThan(contextAt);
      expect(replayAt, name).toBeGreaterThan(resourceAt);
      expect(command).toContain("price_list.tenant_id = p_tenant_id");
      expect(command).toContain(
        "price_list.tenant_supplier_id = p_tenant_supplier_id",
      );
      expect(command).toContain("price_list.supplier_id = p_supplier_id");
      expect(command).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    }
  });

  test("checks new-version targets without locking them before the source", () => {
    const list = compact(extractFunction("command_supplier_price_list_v2"));
    const targetStart = list.indexOf(
      "IF p_action = 'new_version' THEN SELECT price_list.* INTO v_replay_resource",
    );
    const otherActionsStart = list.indexOf(
      "ELSE SELECT price_list.* INTO v_replay_resource",
      targetStart,
    );
    const visibilityEnd = list.indexOf("END IF; v_request :=", otherActionsStart);
    const eventReplay = list.indexOf(
      "FROM public.supplier_command_events AS event",
      visibilityEnd,
    );
    const targetConflict = list.indexOf(
      "IF p_action = 'new_version' AND v_replay_resource.id IS NOT NULL THEN",
      eventReplay,
    );
    const sourceLock = list.indexOf(
      "ELSIF p_action = 'new_version' THEN SELECT price_list.* INTO v_price_list",
      targetConflict,
    );

    expect(targetStart).toBeGreaterThanOrEqual(0);
    expect(otherActionsStart).toBeGreaterThan(targetStart);
    expect(visibilityEnd).toBeGreaterThan(otherActionsStart);
    expect(list.slice(targetStart, otherActionsStart)).not.toContain("FOR UPDATE");
    expect(list.slice(otherActionsStart, visibilityEnd)).toContain("FOR UPDATE");
    expect(eventReplay).toBeGreaterThan(visibilityEnd);
    expect(targetConflict).toBeGreaterThan(eventReplay);
    expect(sourceLock).toBeGreaterThan(targetConflict);
    expect(list.slice(targetConflict, sourceLock)).toContain(
      "'status', 'state_conflict'",
    );
    expect(list.slice(targetConflict, sourceLock)).toContain(
      "'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'",
    );
    expect(list.slice(sourceLock, list.indexOf("IF NOT FOUND THEN", sourceLock)))
      .toContain("FOR UPDATE");
  });

  test("uses one supplier command namespace and tenant non-proxy audit", () => {
    for (const name of [
      "command_supplier_price_list_v2",
      "command_supplier_price_item_v2",
    ]) {
      const command = compact(extractFunction(name));
      expect(command).toContain(
        "'supplier-command:' || p_actor_user_id::text || ':' || btrim(p_idempotency_key)",
      );
      expect(command).toContain("INSERT INTO public.supplier_command_events");
      expect(command).toContain("operation_source");
      expect(command).toContain("'tenant'");
      expect(command).toContain("proxy_reason");
      expect(command).toContain("NULL");
      expect(command).toContain("WHEN unique_violation THEN");
    }
  });

  test("serializes publish before the first resource row lock", () => {
    const command = compact(extractFunction("command_supplier_price_list_v2"));
    const idempotencyLock = command.indexOf(
      "'supplier-command:' || p_actor_user_id::text || ':' || btrim(p_idempotency_key)",
    );
    const publishLock = command.indexOf(
      "'supplier-price-publish:' || p_tenant_id::text || ':' || p_supplier_id::text",
    );
    const resourceLock = command.indexOf(
      "SELECT price_list.* INTO v_replay_resource",
    );
    expect(idempotencyLock).toBeGreaterThanOrEqual(0);
    expect(publishLock).toBeGreaterThan(idempotencyLock);
    expect(resourceLock).toBeGreaterThan(publishLock);
    expect(command).toContain(
      "IF p_action = 'publish' THEN PERFORM pg_catalog.pg_advisory_xact_lock",
    );
    expect(command.slice(publishLock, resourceLock)).toContain(
      "6720240729160000",
    );
    expect(command.match(/supplier-price-publish:/g)).toHaveLength(1);
  });

  test("accepts only platform or same-tenant SKU ownership", () => {
    const item = compact(extractFunction("command_supplier_price_item_v2"));
    expect(item).toContain("sku.ownership_scope = 'platform'");
    expect(item).toContain("sku.owner_tenant_id IS NULL");
    expect(item).toContain("product.ownership_scope = 'platform'");
    expect(item).toContain("product.owner_tenant_id IS NULL");
    expect(item).toContain("sku.ownership_scope = 'tenant'");
    expect(item).toContain("sku.owner_tenant_id = p_tenant_id");
    expect(item).toContain("product.ownership_scope = 'tenant'");
    expect(item).toContain("product.owner_tenant_id = p_tenant_id");
    expect(item).toContain("sku.supplier_id = p_supplier_id");
    expect(item).toContain("SUPPLIER_SKU_NOT_FOUND");
  });

  test("rechecks copied SKU visibility before creating a new version", () => {
    const list = compact(extractFunction("command_supplier_price_list_v2"));
    const start = list.indexOf("ELSIF p_action = 'new_version'");
    const insert = list.indexOf(
      "INSERT INTO public.supplier_price_lists",
      start,
    );
    const newVersion = list.slice(start, insert);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(start);
    expect(newVersion).toContain(
      "FROM public.supplier_price_list_items AS item",
    );
    expect(newVersion).toContain("JOIN public.supplier_skus AS sku");
    expect(newVersion).toContain("JOIN public.supplier_products AS product");
    expect(newVersion).toContain("sku.status = 'active'");
    expect(newVersion).toContain("product.status = 'active'");
    expect(newVersion).toContain("sku.owner_tenant_id = p_tenant_id");
    expect(newVersion).toContain("product.owner_tenant_id = p_tenant_id");
    expect(newVersion).toContain("reason', 'invalid_product_or_sku'");
  });

  test("locks products before SKUs in every price item mutation path", () => {
    const list = compact(extractFunction("command_supplier_price_list_v2"));
    const item = compact(extractFunction("command_supplier_price_item_v2"));
    const newVersionPath = list.slice(
        list.indexOf("ELSIF p_action = 'new_version'"),
        list.indexOf("ELSIF p_action = 'update'"),
      );
    const publishPath = list.slice(
        list.indexOf("ELSIF p_action = 'publish'"),
        list.indexOf("ELSE IF v_price_list.lifecycle_status <> 'published'"),
      );
    const itemPath = item.slice(
        item.indexOf("IF p_action = 'upsert'"),
        item.indexOf("ELSE IF p_payload <> '{}'::jsonb"),
      );
    const paths = [newVersionPath, publishPath, itemPath];

    expect(compact(sql).match(/FOR SHARE OF sku, product/g) ?? []).toHaveLength(0);
    for (const path of paths) {
      const productLock = path.indexOf(
        "ORDER BY product.id FOR SHARE OF product",
      );
      const skuLock = path.indexOf("ORDER BY sku.id FOR SHARE OF sku");
      expect(productLock).toBeGreaterThanOrEqual(0);
      expect(skuLock).toBeGreaterThan(productLock);
    }
    expect(list.match(/FOR SHARE OF product/g) ?? []).toHaveLength(2);
    expect(list.match(/FOR SHARE OF sku/g) ?? []).toHaveLength(2);
    expect(item.match(/FOR SHARE OF product/g) ?? []).toHaveLength(1);
    expect(item.match(/FOR SHARE OF sku/g) ?? []).toHaveLength(1);

    const itemProductLock = itemPath.indexOf(
      "ORDER BY product.id FOR SHARE OF product",
    );
    const itemSkuLock = itemPath.indexOf(
      "ORDER BY sku.id FOR SHARE OF sku",
    );
    expect(itemPath.slice(itemProductLock, itemSkuLock)).toContain(
      "IF NOT FOUND THEN RETURN jsonb_build_object( 'status', 'not_found', 'error_code', 'SUPPLIER_SKU_NOT_FOUND' ); END IF",
    );
  });

  test("keeps published versions immutable and requires a new draft version", () => {
    const list = compact(extractFunction("command_supplier_price_list_v2"));
    const item = compact(extractFunction("command_supplier_price_item_v2"));
    expect(list).toContain("p_action = 'update'");
    expect(list).toContain("v_price_list.lifecycle_status <> 'draft'");
    expect(list).toContain("p_action = 'new_version'");
    expect(list).toContain(
      "v_price_list.lifecycle_status NOT IN ('published', 'retired')",
    );
    expect(list).toContain("supersedes_price_list_id");
    expect(item).toContain("v_price_list.lifecycle_status <> 'draft'");
    expect(list).toContain("SUPPLIER_PRICE_LIST_VERSION_CONFLICT");
    expect(item).toContain("SUPPLIER_PRICE_LIST_VERSION_CONFLICT");
  });

  test("retires published lists without rewriting immutable provenance", () => {
    const list = compact(extractFunction("command_supplier_price_list_v2"));
    const start = list.indexOf(
      "ELSE IF v_price_list.lifecycle_status <> 'published'",
    );
    const end = list.indexOf("v_response := jsonb_build_object", start);
    const retire = list.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(retire).toContain("lifecycle_status = 'retired'");
    expect(retire).toContain("row_version = price_list.row_version + 1");
    expect(retire).toContain("acting_employee_id = p_actor_employee_id");
    expect(retire).toContain("updated_by_employee_id = p_actor_employee_id");
    expect(retire).toContain("updated_at = pg_catalog.now()");
    expect(retire).not.toContain("acting_tenant_id = p_tenant_id");
    expect(retire).not.toContain("operation_source = 'tenant'");
    expect(retire).not.toContain("proxy_reason = NULL");
  });

  test("exposes only v2 writers to service_role and closes the legacy six", () => {
    const normalized = compact(sql);
    for (const name of [
      "command_supplier_price_list_v2",
      "command_supplier_price_item_v2",
    ]) {
      expect(normalized).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
      ));
      expect(normalized).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`,
      ));
    }
    for (const legacy of [
      "create_supplier_price_list",
      "publish_supplier_price_list",
      "create_supplier_price_list_version",
      "retire_supplier_price_list",
      "upsert_supplier_price_list_item",
      "delete_supplier_price_list_item",
    ]) {
      expect(normalized).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${legacy}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
      ));
      expect(normalized).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${legacy}\\(`,
      ));
    }
  });
});
