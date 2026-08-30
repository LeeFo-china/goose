import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260830112000_seed_supplier_purchase_batch_workflow.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

function quotedEnd(source: string, start: number, quote: "'" | '"'): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote && source[index + 1] === quote) index += 2;
    else if (source[index] === quote) return index + 1;
    else index += 1;
  }
  return source.length;
}

function dollarRegion(
  source: string,
  start: number,
): readonly [tag: string, bodyStart: number, bodyEnd: number] | null {
  const tag = source.slice(start).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
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
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
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
  let start = 0;
  let index = 0;
  while (index < executable.length) {
    const current = executable[index];
    if (current === "'" || current === '"') {
      index = quotedEnd(executable, index, current);
    } else if (current === "$" && dollarRegion(executable, index)) {
      const [tag, , bodyEnd] = dollarRegion(executable, index)!;
      index = bodyEnd + tag.length;
    } else if (current === ";") {
      const statement = executable.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
      index += 1;
    } else index += 1;
  }
  return statements;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function functionDefinition(name: string): string {
  const statement = splitTopLevelSqlStatements(sql).find((candidate) =>
    new RegExp(`^CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\b`, "i")
      .test(candidate)
  );
  return statement ? stripSqlComments(statement) : "";
}

const executableSql = stripSqlComments(sql);
const statements = splitTopLevelSqlStatements(sql).map(compact);
const privateInitializerMarker =
  "gooes:20260830112000:tenant-initializer-private:v1";
const publicInitializerMarker =
  "gooes:20260830112000:tenant-initializer-wrapper:v1";

function hasCollisionSafeInitializerGuard(source: string): boolean {
  const preserveInitializer = splitTopLevelSqlStatements(source).find(
    (statement) => statement.trimStart().startsWith(
      "DO $preserve_tenant_initializer$",
    ),
  ) ?? "";
  const executable = compact(stripSqlComments(preserveInitializer));
  return [
    privateInitializerMarker,
    publicInitializerMarker,
    "pg_catalog.obj_description(v_private_oid, 'pg_proc')",
    "pg_catalog.obj_description(v_public_oid, 'pg_proc')",
    "procedure.prosrc",
    "procedure.prosecdef",
    "procedure.proconfig",
    "procedure.proowner",
    "pg_catalog.pg_get_function_arguments(v_private_oid)",
    "pg_catalog.pg_get_function_arguments(v_public_oid)",
    "pg_catalog.pg_get_function_result(v_private_oid)",
    "pg_catalog.pg_get_function_result(v_public_oid)",
    "'service_role', v_public_oid, 'EXECUTE'",
    "'service_role', v_private_oid, 'EXECUTE'",
    "MESSAGE = 'SUPPLIER_PURCHASE_BATCH_INITIALIZER_COLLISION'",
    "public.__gooes_initialize_default_decoration_tenant_20260830(",
    "public.__gooes_ensure_supplier_purchase_batch_workflow_template(",
  ].every((fragment) => executable.includes(fragment));
}

function mutateInitializerGuard(
  source: string,
  mutate: (guard: string) => string,
): string {
  const start = source.indexOf("DO $preserve_tenant_initializer$");
  const endTag = "$preserve_tenant_initializer$;";
  const end = source.indexOf(endTag, start) + endTag.length;
  if (start < 0 || end < endTag.length) return source;
  return source.slice(0, start) + mutate(source.slice(start, end)) +
    source.slice(end);
}

function hasEffectiveVersionStateMachine(source: string): boolean {
  const helper = compact(functionDefinitionFrom(
    source,
    "__gooes_ensure_supplier_purchase_batch_workflow_template",
  ));
  const archived = helper.indexOf(
    "IF v_definition.status = 'archived' THEN RETURN v_definition.active_version_id; END IF;",
  );
  const active = helper.indexOf(
    "version.id = v_definition.active_version_id",
  );
  const published = helper.indexOf("INTO v_existing_published_id");
  const create = helper.indexOf("INSERT INTO public.workflow_versions");
  return archived >= 0 && active > archived && published > active &&
    create > published &&
    /IF v_active_published_id IS NOT NULL AND v_definition.status = 'active' THEN RETURN v_active_published_id; END IF;/.test(
      helper,
    ) &&
    /IF v_existing_published_id IS NOT NULL THEN UPDATE public\.workflow_definitions AS definition SET active_version_id = v_existing_published_id, status = 'active'[\s\S]*RETURN v_existing_published_id; END IF;/.test(
      helper,
    );
}

function functionDefinitionFrom(source: string, name: string): string {
  const statement = splitTopLevelSqlStatements(source).find((candidate) =>
    new RegExp(`^CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\b`, "i")
      .test(candidate)
  );
  return statement ? stripSqlComments(statement) : "";
}

describe("supplier purchase batch workflow template migration", () => {
  test("parses executable statements without trusting comments or quoted SQL", () => {
    const fixture = `
      -- UPDATE public.workflow_versions SET snapshot = '{}';
      SELECT 'COMMIT; -- kept';
      DO $fixture$
      BEGIN
        -- DELETE FROM public.workflow_nodes;
        PERFORM '/* kept */;';
      END;
      $fixture$;
      /* GRANT EXECUTE ON FUNCTION public.fake() TO authenticated; */
    `;

    expect(splitTopLevelSqlStatements(fixture).map(compact)).toEqual([
      "SELECT 'COMMIT; -- kept';",
      "DO $fixture$ BEGIN PERFORM '/* kept */;'; END; $fixture$;",
    ]);
  });

  test("is transactional, bounded, and documents forward-fix rollback", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(statements[0]).toBe("BEGIN;");
    expect(statements[1]).toBe("SET LOCAL lock_timeout = '5s';");
    expect(statements[2]).toBe("SET LOCAL statement_timeout = '5min';");
    expect(statements.at(-1)).toBe("COMMIT;");
    expect(sql).toMatch(/Rollback: forward-fix[\s\S]*preserve[\s\S]*published/i);
  });

  test("seeds only supplier-enabled existing tenants without enabling workflow", () => {
    const seedBlock = statements.find((statement) => statement.startsWith("DO $seed_existing_tenants$")) ?? "";
    expect(seedBlock).toMatch(
      /FROM public\.tenant_supplier_settings AS supplier_setting[\s\S]*WHERE supplier_setting\.module_enabled/,
    );
    expect(seedBlock).not.toMatch(/tenant\.status|supplier_setting\.tenant_id\s*=/);
    expect(seedBlock).toMatch(
      /public\.__gooes_ensure_supplier_purchase_batch_workflow_template\(\s*setting\.tenant_id\s*\)/,
    );
    expect(executableSql).not.toMatch(
      /UPDATE\s+public\.tenant_supplier_settings[\s\S]*purchase_batch_workflow_enabled/i,
    );
  });

  test("preserves published custom versions and only fills a missing publication", () => {
    const helper = compact(functionDefinition(
      "__gooes_ensure_supplier_purchase_batch_workflow_template",
    ));
    expect(helper).toContain("FOR UPDATE");
    expect(helper).toMatch(
      /FROM public\.workflow_versions AS version[\s\S]*version\.status = 'published'/,
    );
    expect(helper).toMatch(
      /IF v_active_published_id IS NOT NULL AND v_definition.status = 'active' THEN RETURN v_active_published_id; END IF;/,
    );
    expect(helper).toMatch(
      /FROM public\.workflow_versions AS version[\s\S]*version\.status = 'published'/,
    );
    expect(helper).toContain("COALESCE(MAX(version.version_number), 0) + 1");
    expect(helper).toContain("ON CONFLICT (tenant_id, workflow_key) DO NOTHING");
    expect(helper).not.toMatch(/UPDATE public\.workflow_versions/i);
    expect(helper).not.toMatch(/UPDATE public\.workflow_(?:nodes|edges)/i);
    expect(helper).not.toMatch(/DELETE FROM public\.workflow_(?:versions|nodes|edges)/i);
    expect(helper).toMatch(
      /IF v_created THEN[\s\S]*INSERT INTO public\.workflow_nodes[\s\S]*INSERT INTO public\.workflow_edges[\s\S]*END IF;/,
    );
    expect(helper).not.toMatch(
      /UPDATE public\.workflow_definitions[\s\S]*SET[\s\S]*\b(?:name|description|category)\s*=/i,
    );
    expect(helper).toMatch(
      /SET active_version_id = v_version_id, status = 'active'[\s\S]*definition\.tenant_id = p_tenant_id;/,
    );
  });

  test("implements archived, valid-active, repair, and create version states", () => {
    expect(hasEffectiveVersionStateMachine(sql)).toBe(true);
    for (const mutated of [
      sql.replace(
        "v_definition.status = 'archived'",
        "v_definition.status = 'draft'",
      ),
      sql.replace(
        "version.id = v_definition.active_version_id",
        "version.id IS NOT NULL",
      ),
      sql.replace(
        "active_version_id = v_existing_published_id",
        "active_version_id = NULL",
      ),
      sql.replace(
        "RETURN v_active_published_id;",
        "RETURN NULL;",
      ),
      sql.replace(
        "v_definition.status = 'active'",
        "v_definition.status = 'draft'",
      ),
    ]) expect(hasEffectiveVersionStateMachine(mutated)).toBe(false);
  });

  test("stores the exact graph, permissions, decisions, and trusted budget conditions", () => {
    const helper = compact(functionDefinition(
      "__gooes_ensure_supplier_purchase_batch_workflow_template",
    ));
    for (const value of [
      "supplier_purchase_batch_approval",
      "supplier_purchase_batch",
      "采购批次审批",
      "purchase_review",
      "finance_review",
      "approved_end",
      "rejected_end",
      "supplier.purchase-requisition.approve",
      "finance.budget.manage",
    ]) expect(helper).toContain(value);
    expect(helper).toContain("'field', 'budget_status'");
    expect(helper).toContain("'operator', 'neq'");
    expect(helper).toContain("'operator', 'eq'");
    expect(helper).toContain("'value', 'over_budget'");
    expect(helper).toContain("'field', 'decision'");
    expect(helper).toContain(
      "'actions', pg_catalog.jsonb_build_array('approve', 'reject')",
    );
    expect(helper.match(/'source_node_key'/g)).toHaveLength(6);
    for (const [source, target] of [
      ["start", "purchase_review"],
      ["purchase_review", "rejected_end"],
      ["purchase_review", "approved_end"],
      ["purchase_review", "finance_review"],
      ["finance_review", "approved_end"],
      ["finance_review", "rejected_end"],
    ]) {
      expect(helper).toMatch(new RegExp(
        `'source_node_key', '${source}'[\\s\\S]*?` +
          `'target_node_key', '${target}'`,
      ));
    }
    expect(helper).not.toMatch(/amount|client_output|temporary/i);
    expect(helper).not.toMatch(/workflow_definition_bindings/i);
  });

  test("keeps the common tenant initializer and every helper service-role-only", () => {
    const initializer = compact(functionDefinition("initialize_default_decoration_tenant"));
    const initializerDefinitions = statements.filter((statement) =>
      /^CREATE(?: OR REPLACE)? FUNCTION public\.initialize_default_decoration_tenant\b/i
        .test(statement)
    );
    expect(initializerDefinitions).toHaveLength(1);
    expect(initializer).toContain("SECURITY DEFINER");
    expect(initializer).toContain("SET search_path = pg_catalog, public, auth");
    expect(initializer).toMatch(
      /v_initialization := public\.__gooes_initialize_default_decoration_tenant_20260830\([\s\S]*?\); PERFORM public\.__gooes_ensure_supplier_purchase_batch_workflow_template\(\s*p_tenant_id\s*\); RETURN v_initialization;/,
    );
    expect(initializer).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(compact(executableSql)).toMatch(
      /REVOKE ALL ON FUNCTION public\.initialize_default_decoration_tenant\(\s*uuid,\s*text,\s*text,\s*uuid\s*\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(compact(executableSql)).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.initialize_default_decoration_tenant\(\s*uuid,\s*text,\s*text,\s*uuid\s*\) TO service_role;/,
    );
    expect(compact(executableSql)).toContain(
      "REVOKE ALL ON FUNCTION public.__gooes_ensure_supplier_purchase_batch_workflow_template(uuid) FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(compact(executableSql)).toMatch(
      /ALTER FUNCTION public\.initialize_default_decoration_tenant\(\s*uuid,\s*text,\s*text,\s*uuid\s*\) RENAME TO __gooes_initialize_default_decoration_tenant_20260830;/,
    );
    expect(compact(executableSql)).toMatch(
      /v_private_oid oid := pg_catalog\.to_regprocedure\([\s\S]*IF v_private_oid IS NULL THEN[\s\S]*ALTER FUNCTION/,
    );
    expect(compact(executableSql)).toMatch(
      /REVOKE ALL ON FUNCTION public\.__gooes_initialize_default_decoration_tenant_20260830\(\s*uuid,\s*text,\s*text,\s*uuid\s*\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(executableSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.__gooes_[^(]+\([^)]*\) TO (?:PUBLIC|anon|authenticated|service_role)/i,
    );
  });

  test("fails closed for initializer name collisions and stale wrappers", () => {
    expect(hasCollisionSafeInitializerGuard(sql)).toBe(true);
    expect(hasCollisionSafeInitializerGuard(
      mutateInitializerGuard(sql, (guard) =>
        guard.replaceAll(privateInitializerMarker, "unrelated-private-function")
      ),
    )).toBe(false);
    expect(hasCollisionSafeInitializerGuard(
      mutateInitializerGuard(
        sql,
        (guard) => guard.replace(
          "public.__gooes_ensure_supplier_purchase_batch_workflow_template(",
          "public.unrelated_workflow_seed(",
        ),
      ),
    )).toBe(false);
  });

  test("restores the wrapper to the captured original initializer owner", () => {
    const executable = compact(executableSql);
    expect(executable).toMatch(
      /SELECT role\.rolname[\s\S]*procedure\.oid = pg_catalog\.to_regprocedure\( 'public\.__gooes_initialize_default_decoration_tenant_20260830\(uuid,text,text,uuid\)' \)/,
    );
    expect(executable).toMatch(
      /ALTER FUNCTION public\.initialize_default_decoration_tenant\(uuid, text, text, uuid\) OWNER TO %I/,
    );
    expect(executable.indexOf("OWNER TO %I")).toBeLessThan(
      executable.indexOf(
        "GRANT EXECUTE ON FUNCTION public.initialize_default_decoration_tenant",
      ),
    );
  });
});
