import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260830111000_extend_supplier_workflow_rollout_command.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

const oldSignature = [
  "public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, ",
  "boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)",
].join("");
const newSignature = [
  "public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, ",
  "boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)",
].join("");

function quotedEnd(source: string, start: number, quote: "'" | '"'): number {
  const isEscapeString = quote === "'" &&
    /(?:^|[^A-Za-z0-9_])[eE]$/.test(source.slice(0, start));
  let index = start + 1;

  while (index < source.length) {
    if (isEscapeString && source[index] === "\\") {
      index += 2;
    } else if (source[index] === quote && source[index + 1] === quote) {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  return source.length;
}

function dollarRegion(
  source: string,
  start: number,
): readonly [tag: string, bodyStart: number, bodyEnd: number] | null {
  const tag = source.slice(start).match(
    /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/,
  )?.[0];
  if (!tag) return null;

  const bodyStart = start + tag.length;
  const bodyEnd = source.indexOf(tag, bodyStart);
  return bodyEnd < 0 ? null : [tag, bodyStart, bodyEnd];
}

function stripSqlComments(source: string, stripDollarCode = true): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "'" || current === '"') {
      const end = quotedEnd(source, index, current);
      result += source.slice(index, end);
      index = end;
    } else if (current === "$" && dollarRegion(source, index)) {
      const [tag, bodyStart, bodyEnd] = dollarRegion(source, index)!;
      const body = source.slice(bodyStart, bodyEnd);
      const isCode = stripDollarCode && /\b(?:AS|DO)\s*$/i.test(result);
      result += tag + (isCode ? stripSqlComments(body, false) : body) + tag;
      index = bodyEnd + tag.length;
    } else if (current === "-" && next === "-") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
    } else if (current === "/" && next === "*") {
      let depth = 1;
      result += " ";
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          if (source[index] === "\n") result += "\n";
          index += 1;
        }
      }
    } else {
      result += current;
      index += 1;
    }
  }

  return result;
}

function splitTopLevelSqlStatements(source: string): string[] {
  const executable = stripSqlComments(source);
  const statements: string[] = [];
  let statementStart = 0;
  let index = 0;

  while (index < executable.length) {
    const current = executable[index];
    if (current === "'" || current === '"') {
      index = quotedEnd(executable, index, current);
    } else if (current === "$" && dollarRegion(executable, index)) {
      const [tag, , bodyEnd] = dollarRegion(executable, index)!;
      index = bodyEnd + tag.length;
    } else if (current === ";") {
      const statement = executable.slice(statementStart, index + 1).trim();
      if (statement) statements.push(statement);
      statementStart = index + 1;
      index += 1;
    } else {
      index += 1;
    }
  }

  const trailingStatement = executable.slice(statementStart).trim();
  if (trailingStatement) statements.push(trailingStatement);
  return statements;
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function executableSql(source: string) {
  return stripSqlComments(source);
}

function rolloutFunction(source = sql) {
  const prefix =
    "CREATE FUNCTION public.set_tenant_supplier_rollout_settings(";
  const matches = splitTopLevelSqlStatements(source).filter((statement) =>
    compact(statement).startsWith(prefix)
  );
  return matches.length === 1 ? matches[0] ?? "" : "";
}

function legacyRolloutFunction(source = sql) {
  const prefix =
    "CREATE OR REPLACE FUNCTION public.set_tenant_supplier_rollout_settings(";
  const matches = splitTopLevelSqlStatements(source).filter((statement) =>
    compact(statement).startsWith(prefix)
  );
  return matches.length === 1 ? matches[0] ?? "" : "";
}

const normalizedStatements = splitTopLevelSqlStatements(sql).map(compact);

describe("tenant supplier rollout command migration contract", () => {
  test("commented command replacement and ACL cannot satisfy the contract", () => {
    const fixture = `
      -- DROP FUNCTION ${oldSignature};
      /*
      REVOKE ALL ON FUNCTION ${oldSignature}
        FROM PUBLIC, anon, authenticated, service_role;
      CREATE FUNCTION public.set_tenant_supplier_rollout_settings()
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        RETURN '{}'::jsonb;
      END;
      $$;
      REVOKE ALL ON FUNCTION ${newSignature}
        FROM PUBLIC, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION ${newSignature} TO service_role;
      */
      SELECT 'CREATE FUNCTION -- kept inside a quoted string';
    `;
    const executable = compact(executableSql(fixture));

    expect(executable).not.toContain(`DROP FUNCTION ${oldSignature};`);
    expect(executable).not.toContain("REVOKE ALL ON FUNCTION");
    expect(executable).not.toContain("GRANT EXECUTE ON FUNCTION");
    expect(rolloutFunction(fixture)).toBe("");
  });

  test("extracts one executable function across quoted and dollar bodies", () => {
    const fixture = `
      -- CREATE FUNCTION public.set_tenant_supplier_rollout_settings();
      CREATE/* executable token separator */FUNCTION
      public.set_tenant_supplier_rollout_settings()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $rollout_body$
      BEGIN
        -- DROP FUNCTION ${oldSignature};
        RETURN '/* kept */; -- kept inside a quoted string';
      END;
      $rollout_body$;
      SELECT '$rollout_body$; CREATE FUNCTION kept in a quoted string';
    `;
    const fn = compact(rolloutFunction(fixture));

    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("RETURN '/* kept */; -- kept inside a quoted string';");
    expect(fn).not.toContain(`DROP FUNCTION ${oldSignature};`);
  });

  test("commented function security and body fragments stay absent", () => {
    const fixture = `
      CREATE FUNCTION public.set_tenant_supplier_rollout_settings()
      RETURNS jsonb
      LANGUAGE plpgsql
      -- SECURITY DEFINER
      AS $$
      BEGIN
        -- WHEN p_purchase_batch_workflow_enabled THEN 6
        RETURN '{}'::jsonb;
      END;
      $$;
    `;
    const fn = compact(rolloutFunction(fixture));

    expect(fn).not.toContain("SECURITY DEFINER");
    expect(fn).not.toContain(
      "WHEN p_purchase_batch_workflow_enabled THEN 6",
    );
  });

  test("is transactional, bounded, and documents forward rollback", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/disable the rollout API[\s\S]*keep tenant data/i);
    expect(normalizedStatements[0]).toBe("BEGIN;");
    expect(normalizedStatements[1]).toBe("SET LOCAL lock_timeout = '5s';");
    expect(normalizedStatements[2]).toBe(
      "SET LOCAL statement_timeout = '5min';",
    );
    expect(normalizedStatements.at(-1)).toBe("COMMIT;");
  });

  test("keeps the old overload as a flag-preserving compatibility delegate", () => {
    const normalized = compact(executableSql(sql));
    const fn = compact(rolloutFunction());
    expect(normalized).toContain(
      `REVOKE ALL ON FUNCTION ${oldSignature} FROM PUBLIC, anon, authenticated, service_role;`,
    );
    const legacy = compact(legacyRolloutFunction());
    expect(normalized).not.toContain(`DROP FUNCTION ${oldSignature};`);
    expect(legacy).toContain("SECURITY DEFINER");
    expect(legacy).toContain("SET search_path = pg_catalog, public");
    expect(legacy).toContain("purchase_batch_workflow_enabled");
    expect(legacy).toContain(
      "RETURN public.set_tenant_supplier_rollout_settings(",
    );
    for (const parameter of [
      "p_tenant_id uuid",
      "p_module_enabled boolean",
      "p_require_active_contract_for_new_order boolean",
      "p_ownership_reads_enabled boolean",
      "p_private_supplier_writes_enabled boolean",
      "p_private_catalog_writes_enabled boolean",
      "p_procurement_snapshot_v1_enabled boolean",
      "p_purchase_batch_workflow_enabled boolean",
      "p_expected_version integer",
      "p_actor_user_id uuid",
      "p_actor_employee_id uuid",
      "p_idempotency_key text",
      "p_reason text DEFAULT NULL",
    ]) {
      expect(fn).toContain(parameter);
    }
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog, public");
  });

  test("replays pre-migration legacy fingerprints before delegating new events", () => {
    const legacy = compact(legacyRolloutFunction());
    const replayLookup = legacy.indexOf(
      "FROM public.supplier_command_events AS event",
    );
    const workflowFlagLookup = legacy.indexOf(
      "SELECT setting.purchase_batch_workflow_enabled",
    );

    expect(replayLookup).toBeGreaterThan(-1);
    expect(workflowFlagLookup).toBeGreaterThan(replayLookup);
    expect(legacy).toContain("v_event.from_state -> '_request'");
    expect(legacy).toContain("'setting', v_event.to_state");
    expect(legacy).toContain("'previous_setting', v_event.from_state - '_request'");
    expect(legacy).toContain(
      "NOT COALESCE( v_event.from_state -> '_request' ? 'purchase_batch_workflow_enabled', false )",
    );
    const legacyRequest = legacy.slice(
      legacy.indexOf("v_request := jsonb_build_object("),
      legacy.indexOf("PERFORM pg_catalog.pg_advisory_xact_lock("),
    );
    expect(legacyRequest).toContain(
      "'procurement_snapshot_v1_enabled', p_procurement_snapshot_v1_enabled",
    );
    expect(legacyRequest).not.toContain("purchase_batch_workflow_enabled");
  });

  test("locks the tenant and settings row before optimistic update", () => {
    const fn = rolloutFunction();
    expect(fn).toMatch(
      /FROM public\.tenants AS tenant[\s\S]*FOR UPDATE;[\s\S]*FROM public\.tenant_supplier_settings AS setting[\s\S]*FOR UPDATE;/,
    );
    expect(fn).toMatch(/v_setting\.version <> p_expected_version/);
    expect(fn).toContain("SUPPLIER_VERSION_CONFLICT");
  });

  test("enforces the complete level-six chain in both directions", () => {
    const fn = compact(rolloutFunction());
    expect(fn).toContain("WHEN p_purchase_batch_workflow_enabled THEN 6");
    expect(fn).toContain(
      "WHEN v_setting.purchase_batch_workflow_enabled THEN 6",
    );
    expect(fn).toContain("abs(v_target_level - v_current_level) > 1");
    expect(fn).toContain("SUPPLIER_ROLLOUT_ORDER_INVALID");
    expect(fn).toMatch(
      /p_purchase_batch_workflow_enabled AND NOT \( p_ownership_reads_enabled AND p_private_supplier_writes_enabled AND p_private_catalog_writes_enabled AND p_procurement_snapshot_v1_enabled \)/,
    );
    expect(fn).toMatch(
      /NOT p_module_enabled AND \([\s\S]*p_purchase_batch_workflow_enabled[\s\S]*\)/,
    );
  });

  test("fingerprints, persists, audits, and replays the new flag", () => {
    const fn = compact(rolloutFunction());
    expect(fn).toContain(
      "'purchase_batch_workflow_enabled', p_purchase_batch_workflow_enabled",
    );
    expect(fn).toContain(
      "v_event.from_state -> '_request' IS DISTINCT FROM v_request",
    );
    expect(fn).toContain(
      "purchase_batch_workflow_enabled = p_purchase_batch_workflow_enabled",
    );
    expect(fn).toMatch(
      /INSERT INTO public\.tenant_supplier_settings \([\s\S]*purchase_batch_workflow_enabled[\s\S]*\) VALUES \([\s\S]*p_purchase_batch_workflow_enabled/,
    );
    expect(fn).toContain("public.supplier_command_events");
    expect(fn).toContain("'setting', v_event.to_state");
    expect(fn).toContain("'setting', to_jsonb(v_setting)");
  });

  test("exposes both overloads only to service_role", () => {
    const normalized = compact(executableSql(sql));
    expect(normalized).toContain(
      `REVOKE ALL ON FUNCTION ${newSignature} FROM PUBLIC, anon, authenticated, service_role;`,
    );
    expect(normalized).toContain(
      `GRANT EXECUTE ON FUNCTION ${newSignature} TO service_role;`,
    );
    expect(normalized).toContain(
      `GRANT EXECUTE ON FUNCTION ${oldSignature} TO service_role;`,
    );
    expect(normalized.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(2);
    expect(normalized).not.toContain(
      `GRANT EXECUTE ON FUNCTION ${newSignature} TO PUBLIC`,
    );
    expect(normalized).not.toContain(
      `GRANT EXECUTE ON FUNCTION ${newSignature} TO anon`,
    );
    expect(normalized).not.toContain(
      `GRANT EXECUTE ON FUNCTION ${newSignature} TO authenticated`,
    );
  });

  test("allows only the exact additive compatibility sequence", () => {
    expect(normalizedStatements).toHaveLength(12);
    expect(normalizedStatements.slice(0, 4)).toEqual([
      "BEGIN;",
      "SET LOCAL lock_timeout = '5s';",
      "SET LOCAL statement_timeout = '5min';",
      `REVOKE ALL ON FUNCTION ${oldSignature} FROM PUBLIC, anon, authenticated, service_role;`,
    ]);
    expect(normalizedStatements[4]).toStartWith(
      "CREATE FUNCTION public.set_tenant_supplier_rollout_settings(",
    );
    expect(normalizedStatements.slice(5, 7)).toEqual([
      `REVOKE ALL ON FUNCTION ${newSignature} FROM PUBLIC, anon, authenticated, service_role;`,
      `GRANT EXECUTE ON FUNCTION ${newSignature} TO service_role;`,
    ]);
    expect(normalizedStatements[7]).toStartWith(
      "CREATE OR REPLACE FUNCTION public.set_tenant_supplier_rollout_settings(",
    );
    expect(normalizedStatements.slice(8)).toEqual([
      `REVOKE ALL ON FUNCTION ${oldSignature} FROM PUBLIC, anon, authenticated, service_role;`,
      `GRANT EXECUTE ON FUNCTION ${oldSignature} TO service_role;`,
      "COMMENT ON FUNCTION public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text) IS 'Temporary DB-first compatibility overload; preserves purchase_batch_workflow_enabled while delegating to the level-six command. Retire only in a reviewed forward migration after old API revisions are gone.';",
      "COMMIT;",
    ]);
  });
});
