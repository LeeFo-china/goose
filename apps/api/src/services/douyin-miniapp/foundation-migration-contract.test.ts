import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const migration = new URL("../../../../../supabase/migrations/20260719100000_create_douyin_miniapp_foundation.sql", import.meta.url);
const rpcNames = [
  "claim_douyin_component_token_refresh",
  "complete_douyin_component_token_refresh",
  "fail_douyin_component_token_refresh",
  "claim_douyin_authorizer_token_refresh",
  "complete_douyin_authorizer_token_refresh",
  "fail_douyin_authorizer_token_refresh",
] as const;
const claimRpcs = [rpcNames[0], rpcNames[3]] as const;
const completeRpcs = [rpcNames[1], rpcNames[4]] as const;
const failRpcs = [rpcNames[2], rpcNames[5]] as const;
const targetTables = ["douyin_third_party_components", "douyin_miniapp_installations"] as const;
const rpcContracts = {
  claim_douyin_component_token_refresh: ["p_component_appid text", "text"],
  complete_douyin_component_token_refresh: [
    "p_component_appid text, p_claim_token uuid, p_access_token_ciphertext text, " +
      "p_access_token_iv text, p_access_token_tag text, p_access_token_key_version text, " +
      "p_access_token_expires_at timestamptz",
    "text, uuid, text, text, text, text, timestamptz",
  ],
  fail_douyin_component_token_refresh: [
    "p_component_appid text, p_claim_token uuid, p_last_refresh_error_code text",
    "text, uuid, text",
  ],
  claim_douyin_authorizer_token_refresh: ["p_installation_id uuid", "uuid"],
  complete_douyin_authorizer_token_refresh: [
    "p_installation_id uuid, p_claim_token uuid, p_access_token_ciphertext text, " +
      "p_access_token_iv text, p_access_token_tag text, p_access_token_key_version text, " +
      "p_access_token_expires_at timestamptz, p_refresh_token_ciphertext text, " +
      "p_refresh_token_iv text, p_refresh_token_tag text, p_refresh_token_key_version text, " +
      "p_refresh_token_expires_at timestamptz",
    "uuid, uuid, text, text, text, text, timestamptz, text, text, text, text, timestamptz",
  ],
  fail_douyin_authorizer_token_refresh: [
    "p_installation_id uuid, p_claim_token uuid, p_last_refresh_error_code text",
    "uuid, uuid, text",
  ],
} as const;
function readMigration(): string { return readFileSync(migration, "utf8"); }
function quotedEnd(sql: string, start: number, quote: "'" | '"'): number {
  const eString = quote === "'" && /(?:^|[^A-Za-z0-9_])[eE]$/.test(sql.slice(0, start));
  let index = start + 1;
  while (index < sql.length) {
    if (eString && sql[index] === "\\") {
      index += 2;
    } else if (sql[index] === quote && sql[index + 1] === quote) {
      index += 2;
    } else if (sql[index] === quote) {
      return index + 1;
    } else index += 1;
  }
  return sql.length;
}
function dollarRegion(sql: string, start: number): [string, number, number] | null {
  const tag = sql.slice(start).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
  if (!tag) return null;
  const bodyStart = start + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  return bodyEnd < 0 ? null : [tag, bodyStart, bodyEnd];
}
// AS/DO dollar bodies are code; nested dollar regions are literals.
function stripSqlComments(sql: string, stripDollarCode = true): string {
  let result = "";
  let index = 0;
  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];
    if (current === "'" || current === '"') {
      const end = quotedEnd(sql, index, current);
      result += sql.slice(index, end);
      index = end;
    } else if (current === "$" && dollarRegion(sql, index)) {
      const [tag, bodyStart, bodyEnd] = dollarRegion(sql, index)!;
      const body = sql.slice(bodyStart, bodyEnd);
      const isCode = stripDollarCode && /\b(?:AS|DO)\s*$/i.test(result);
      result += tag + (isCode ? stripSqlComments(body, false) : body) + tag;
      index = bodyEnd + tag.length;
    } else if (current === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
    } else if (current === "/" && next === "*") {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith("/*", index)) { depth += 1; index += 2; }
        else if (sql.startsWith("*/", index)) { depth -= 1; index += 2; }
        else { if (sql[index] === "\n") result += "\n"; index += 1; }
      }
    } else { result += current; index += 1; }
  }
  return result;
}
function maskSqlLiterals(sql: string, scanDollarCode = true): string {
  let result = "";
  let index = 0;
  while (index < sql.length) {
    const current = sql[index];
    if (current === "'" || current === '"') {
      const end = quotedEnd(sql, index, current);
      result += " ".repeat(end - index);
      index = end;
    } else if (current === "$" && dollarRegion(sql, index)) {
      const [tag, bodyStart, bodyEnd] = dollarRegion(sql, index)!;
      const body = sql.slice(bodyStart, bodyEnd);
      const isCode = scanDollarCode && /\b(?:AS|DO)\s*$/i.test(result);
      result += isCode
        ? tag + maskSqlLiterals(body, false) + tag
        : " ".repeat(bodyEnd + tag.length - index);
      index = bodyEnd + tag.length;
    } else { result += current; index += 1; }
  }
  return result;
}
function normalize(sql: string): string { return sql.replace(/\s+/g, " ").trim(); }
function normalizeAcl(sql: string): string { return normalize(sql).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"); }
function structuralSql(): string { return stripSqlComments(readMigration()); }
function extractRpc(sql: string, name: (typeof rpcNames)[number]): string {
  const match = maskSqlLiterals(sql).match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  return match?.index === undefined ? "" : sql.slice(match.index, match.index + match[0].length);
}
function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === "(") depth += 1;
    if (code[index] === ")" && --depth === 0) return index;
  }
  return -1;
}
function tableBody(sql: string, table: string): string {
  const clean = stripSqlComments(sql);
  const code = maskSqlLiterals(clean, false);
  const start = code.search(new RegExp(`\\bCREATE TABLE public\\.${table}\\b`));
  const open = start < 0 ? -1 : code.indexOf("(", start);
  const close = open < 0 ? -1 : closingParen(code, open);
  return close < 0 ? "" : clean.slice(open + 1, close);
}
function extractTableConstraint(sql: string, table: string, name: string): string {
  const body = tableBody(sql, table);
  const code = maskSqlLiterals(body, false);
  const matches = [...code.matchAll(new RegExp(`\\bCONSTRAINT\\s+${name}\\b`, "g"))];
  expect(matches).toHaveLength(1);
  const start = matches[0]?.index ?? -1;
  const check = start < 0 ? -1 : code.indexOf("CHECK", start);
  const open = check < 0 ? -1 : code.indexOf("(", check);
  const close = open < 0 ? -1 : closingParen(code, open);
  return close < 0 ? "" : body.slice(start, close + 1);
}
function topLevelStatements(sql: string, startPattern: RegExp): string[] {
  const clean = stripSqlComments(sql);
  const code = maskSqlLiterals(clean, false);
  return [...code.matchAll(startPattern)].map((match) => {
    const start = match.index;
    const end = code.indexOf(";", start);
    return end < 0 ? "" : clean.slice(start, end + 1);
  }).filter(Boolean);
}
function extractTargetIndexes(sql: string): string[] {
  return topLevelStatements(sql, /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi)
    .map((statement) => maskSqlLiterals(statement, false))
    .filter((statement) => /\bON\s+(?:ONLY\s+)?public\.(?:douyin_third_party_components|douyin_miniapp_installations)\s*(?:USING\s+[A-Za-z_][A-Za-z0-9_]*\s*)?\(/i.test(statement))
    .map(normalize);
}
function extractRolePermissionInserts(sql: string): string[] { return topLevelStatements(sql, /\bINSERT\s+INTO\s+public\.role_permissions\b/gi); }
function codeOnlyRpc(sql: string): string { return maskSqlLiterals(stripSqlComments(sql)); }
function codeOnlyStructure(sql: string): string { return maskSqlLiterals(stripSqlComments(sql), false); }
function stringLiterals(sql: string): string[] {
  const literals: string[] = [];
  for (let index = 0; index < sql.length;) {
    if (sql[index] !== "'") { index += 1; continue; }
    const end = quotedEnd(sql, index, "'");
    literals.push(sql.slice(index, end)); index = end;
  }
  return literals;
}
function literalAfterCode(sql: string, anchor: string): string {
  const code = codeOnlyRpc(sql), start = code.indexOf(anchor);
  const literalStart = sql.indexOf("'", start + anchor.length);
  if (start < 0 || literalStart < 0 || !/^\s*$/.test(sql.slice(start + anchor.length, literalStart))) return "";
  return sql.slice(literalStart, quotedEnd(sql, literalStart, "'")); }
function expectContains(source: string, values: readonly string[]): void { for (const value of values) expect(source).toContain(value); }
function expectEnvelope(source: string, fields: readonly string[]): void {
  for (const field of fields) { expect(source).toContain(`${field} IS NULL`); expect(source).toContain(`${field} IS NOT NULL`); }
  const nullBranch = fields.map((field) => `${field} IS NULL`).join(" AND "), presentBranch = fields.flatMap((field) => field.endsWith("_at") ? [`${field} IS NOT NULL`] : [`${field} IS NOT NULL`, `btrim(${field}) <>`]).join(" AND ");
  const expression = normalize(source.slice(source.search(/\bCHECK\b/i))).toUpperCase(); expect(expression).toBe(`CHECK ( ( ${nullBranch} ) OR ( ${presentBranch} ) )`.toUpperCase()); expect(source).not.toMatch(/\bOR\s+TRUE\b/i);
}
describe("douyin miniapp foundation migration", () => {
  test("strips SQL and PL/pgSQL comments but preserves every literal form", () => {
    const eString = `E'it\\'s -- escaped /* kept */'`;
    expect(eString).toBe("E'it\\'s -- escaped /* kept */'");
    const stripped = stripSqlComments(`
      /* TOP /* NESTED */ HIDDEN */
      CREATE FUNCTION public.fixture() RETURNS void AS $$ BEGIN
        -- token_refresh_claim_expires_at > v_now
        /* UPDATE public.douyin_miniapp_installations */
        PERFORM 'it''s -- single /* kept */';
        PERFORM "-- double /* kept */";
        PERFORM $msg$-- dollar /* kept */$msg$;
        PERFORM ${eString};
      END; $$ LANGUAGE plpgsql;
    `);
    expectContains(stripped, [
      "'it''s -- single /* kept */'",
      '"-- double /* kept */"',
      "$msg$-- dollar /* kept */$msg$",
      eString,
    ]);
    const codeOnly = maskSqlLiterals(stripped);
    expect(codeOnly).not.toContain("escaped");
    expect(codeOnly).not.toContain("dollar");
    for (const hidden of [
      "TOP",
      "NESTED",
      "token_refresh_claim_expires_at > v_now",
      "UPDATE public.douyin_miniapp_installations",
    ]) expect(stripped).not.toContain(hidden);
  });
  test("removes predicate-shaped literals from executable RPC code", () => {
    const predicate = "token_refresh_claim_expires_at > v_now";
    const rpc = extractRpc(structuralSql(), rpcNames[1]);
    const mutated = rpc
      .replace(`component.${predicate}`, "true")
      .replace("BEGIN", `BEGIN\n  PERFORM '${predicate}';`);
    expect(mutated).toContain(`PERFORM '${predicate}'`);
    expect(codeOnlyRpc(mutated)).not.toContain(predicate);
    expect(codeOnlyStructure(`SELECT 'CREATE TABLE public.fake (id uuid)';`))
      .not.toContain("CREATE TABLE public.fake");
  });
  test("creates both state tables and fixed runtime defaults", () => {
    const sql = structuralSql();
    expectContains(codeOnlyStructure(sql), [
      "CREATE TABLE public.douyin_third_party_components",
      "CREATE TABLE public.douyin_miniapp_installations",
      "UNIQUE (authorizer_appid)",
      "runtime_config jsonb NOT NULL",
      "authorization_status text NOT NULL",
      "token_refresh_claim_token uuid",
    ]);
    const literal = literalAfterCode(sql, "runtime_config jsonb NOT NULL DEFAULT");
    const config = JSON.parse(literal.slice(1, -1));
    expect(config).toMatchObject({ brand: { logo_url: null, qualifications: [] },
      features: { douyin_phone: false, phone_capture_mode: "sms" }, home_banners: [],
      trust_metrics: [], privacy_policy_version: "2026-07-19" });
  });
  test("enforces complete component envelopes and active ticket-backed leases", () => {
    const sql = structuralSql();
    const ticketFields = [
      "component_ticket_ciphertext", "component_ticket_iv", "component_ticket_tag",
      "component_ticket_key_version", "component_ticket_received_at",
    ];
    const accessFields = [
      "access_token_ciphertext", "access_token_iv", "access_token_tag",
      "access_token_key_version", "access_token_expires_at",
    ];
    const ticket = normalize(codeOnlyStructure(extractTableConstraint(sql, targetTables[0], "douyin_components_ticket_envelope_check")));
    expectEnvelope(ticket, ticketFields);
    const weakened = [ticket.replace("component_ticket_ciphertext IS NULL AND component_ticket_iv IS NULL", "component_ticket_ciphertext IS NULL OR component_ticket_iv IS NULL"), ticket.replace("component_ticket_received_at IS NULL ) OR (", "component_ticket_received_at IS NULL OR TRUE ) OR ("),
      ticket.replace(/ \) \)$/, " ) OR (TRUE) )"), ticket.replace(/ \) \)$/, " ) OR (component_ticket_ciphertext IS NULL) )")];
    expect(weakened).not.toContain(ticket);
    const rejected = weakened.map((candidate) => { try { expectEnvelope(candidate, ticketFields); return false; } catch { return true; } });
    expect(rejected).toEqual([true, true, true, true]);
    expectEnvelope(normalize(codeOnlyStructure(extractTableConstraint(sql, targetTables[0], "douyin_components_access_token_envelope_check"))), accessFields);
    const leaseRaw = extractTableConstraint(sql, targetTables[0], "douyin_components_refresh_lease_check");
    const lease = normalize(codeOnlyStructure(leaseRaw));
    expectContains(lease, [
      "token_refresh_claim_token IS NULL AND token_refresh_claim_expires_at IS NULL",
      "token_refresh_claim_token IS NOT NULL AND token_refresh_claim_expires_at IS NOT NULL",
      "status =", "token_refresh_last_error IS NULL",
      ...ticketFields.map((field) => `${field} IS NOT NULL`),
    ]);
    expect(stringLiterals(leaseRaw)).toEqual(["'active'"]);
  });
  test("enforces merchant refresh envelopes and fail-closed installation leases", () => {
    const sql = structuralSql();
    const accessFields = [
      "access_token_ciphertext", "access_token_iv", "access_token_tag",
      "access_token_key_version", "access_token_expires_at",
    ];
    const refreshFields = [
      "refresh_token_ciphertext", "refresh_token_iv", "refresh_token_tag",
      "refresh_token_key_version", "refresh_token_expires_at",
    ];
    expectEnvelope(normalize(codeOnlyStructure(extractTableConstraint(sql, targetTables[1], "douyin_installations_access_token_envelope_check"))), accessFields);
    expectEnvelope(normalize(codeOnlyStructure(extractTableConstraint(sql, targetTables[1], "douyin_installations_refresh_token_envelope_check"))), refreshFields);
    const leaseRaw = extractTableConstraint(sql, targetTables[1], "douyin_installations_refresh_lease_check");
    const lease = normalize(codeOnlyStructure(leaseRaw));
    expectContains(lease, [
      "token_refresh_claim_token IS NULL AND token_refresh_claim_expires_at IS NULL",
      "token_refresh_claim_token IS NOT NULL AND token_refresh_claim_expires_at IS NOT NULL",
      "installation_kind =", "authorization_status IN ( , )",
      "token_refresh_last_error IS NULL",
      ...refreshFields.map((field) => `${field} IS NOT NULL`),
    ]);
    expect(stringLiterals(leaseRaw)).toEqual(["'merchant'", "'authorized_unbound'", "'active'"]);
    const active = normalize(extractTableConstraint(sql, targetTables[1], "douyin_installations_active_merchant_check"));
    const template = normalize(extractTableConstraint(sql, targetTables[1], "douyin_installations_template_development_check"));
    expectContains(codeOnlyStructure(active), ["installation_kind <>", "authorization_status <>", "tenant_id IS NOT NULL", "deployment_key IS NOT NULL", ...refreshFields.map((field) => `${field} IS NOT NULL`)]);
    expectContains(codeOnlyStructure(template), [
      "installation_kind <>", "deployment_key IS NULL", "token_refresh_claim_token IS NULL",
      "token_refresh_claim_expires_at IS NULL", "token_refresh_last_error IS NULL",
      ...[...accessFields, ...refreshFields].map((field) => `${field} IS NULL`),
    ]);
    expect(stringLiterals(active)).toEqual(["'merchant'", "'active'"]);
    expect(stringLiterals(template)).toEqual(["'template_development'"]);
  });
  test("enforces lifecycle, template ID, runtime object, and stable error codes", () => {
    const sql = structuralSql();
    const checks = [
      [targetTables[0], "douyin_components_status_check", "status IN ('active', 'disabled')", ["'active'", "'disabled'"]],
      [targetTables[1], "douyin_installations_kind_check", "installation_kind IN ('merchant', 'template_development')", ["'merchant'", "'template_development'"]],
      [targetTables[1], "douyin_installations_authorization_status_check", "authorization_status IN ('authorized_unbound', 'active', 'disabled', 'revoked')", ["'authorized_unbound'", "'active'", "'disabled'", "'revoked'"]],
      [targetTables[1], "douyin_installations_template_id_check", "template_id ~ '^[1-9][0-9]{0,18}$'", ["'^[1-9][0-9]{0,18}$'"]],
      [targetTables[1], "douyin_installations_runtime_config_object_check", "jsonb_typeof(runtime_config) = 'object'", ["'object'"]],
    ] as const;
    for (const [table, name, clause, literals] of checks) {
      const constraint = extractTableConstraint(sql, table, name);
      expect(normalize(codeOnlyStructure(constraint))).toContain(normalize(codeOnlyStructure(clause)));
      expect(stringLiterals(constraint)).toEqual([...literals]);
    }
    for (const [table, name] of [
      [targetTables[0], "douyin_components_refresh_error_code_check"],
      [targetTables[1], "douyin_installations_refresh_error_code_check"],
    ] as const) {
      const constraint = extractTableConstraint(sql, table, name);
      expect(normalize(codeOnlyStructure(constraint))).toContain("token_refresh_last_error ~");
      expect(stringLiterals(constraint)).toEqual(["'^DOUYIN_[A-Z0-9_]{1,95}$'"]);
      expect(codeOnlyStructure(constraint)).not.toContain("btrim");
    }
    const code = /^DOUYIN_[A-Z0-9_]{1,95}$/;
    expect(code.test("DOUYIN_TOKEN_REFRESH_FAILED")).toBe(true);
    expect(code.test("vendor response token=secret")).toBe(false);
    expect(code.test("DOUYIN_refresh_failed")).toBe(false);
    expect(code.test(`DOUYIN_${"A".repeat(96)}`)).toBe(false);
  });
  test("defines exactly the three planned explicit indexes", () => {
    const sql = structuralSql();
    const expected = [
      "CREATE UNIQUE INDEX douyin_miniapp_installations_deployment_key_key ON public.douyin_miniapp_installations(deployment_key) WHERE deployment_key IS NOT NULL;",
      "CREATE INDEX douyin_miniapp_installations_tenant_status_idx ON public.douyin_miniapp_installations(tenant_id, authorization_status);",
      "CREATE INDEX douyin_miniapp_installations_status_updated_idx ON public.douyin_miniapp_installations(authorization_status, updated_at DESC);",
    ];
    expect(normalize(codeOnlyStructure(sql))).not.toMatch(/\bUNIQUE\s*\(\s*deployment_key\s*\)/i);
    expect(extractTargetIndexes(sql)).toEqual(expected);
    const mutated = `${sql} CREATE INDEX extra ON public.douyin_third_party_components(status);`;
    expect(extractTargetIndexes(mutated)).toHaveLength(4);
    expect(extractTargetIndexes(mutated)).not.toEqual(expected);
    for (const extra of [
      "CREATE INDEX using_extra ON public.douyin_third_party_components USING btree (status);",
      "CREATE INDEX only_extra ON ONLY public.douyin_miniapp_installations(created_at);",
    ]) {
      const indexes = extractTargetIndexes(`${sql} ${extra}`);
      expect(indexes).toHaveLength(4);
      expect(indexes).not.toEqual(expected);
    }
  });
  test("extracts a named constraint only from its balanced table body", () => {
    const fixture = `
      CREATE TABLE public.other_table (
        value text CONSTRAINT shared_check CHECK (value = 'wrong) literal')
      );
      CREATE TABLE public.target_table (
        value text CONSTRAINT shared_check CHECK ((value = 'right') AND (length(value) > 0))
      );
    `;
    const constraint = extractTableConstraint(fixture, "target_table", "shared_check");
    expect(normalize(constraint)).toContain("value = 'right'");
    expect(normalize(constraint)).not.toContain("wrong) literal");
  });
  test("uses one database clock value for every refresh boundary", () => {
    const sql = structuralSql();
    for (const name of rpcNames) {
      const rpc = codeOnlyRpc(extractRpc(sql, name));
      const signature = rpc.slice(0, rpc.indexOf("RETURNS"));
      expect(normalize(signature)).toBe(`CREATE OR REPLACE FUNCTION public.${name}( ${rpcContracts[name][0]} )`);
      expect(rpc).not.toContain("p_now");
      expect(rpc).toContain("v_now timestamptz := clock_timestamp();");
      expect(rpc.match(/clock_timestamp\(\)/g)).toHaveLength(1);
    }
    for (const name of claimRpcs) {
      const raw = extractRpc(sql, name);
      expect(literalAfterCode(raw, "access_token_expires_at <= v_now + interval")).toBe("'5 minutes'");
      expect(literalAfterCode(raw, "token_refresh_claim_expires_at = v_now + interval")).toBe("'30 seconds'");
      expectContains(codeOnlyRpc(raw), ["v_now + interval", "token_refresh_claim_expires_at <= v_now"]);
    }
    for (const name of completeRpcs) expectContains(codeOnlyRpc(extractRpc(sql, name)), [
      "p_access_token_expires_at <= v_now", "token_refresh_claim_expires_at > v_now",
    ]);
    for (const name of failRpcs) {
      const raw = extractRpc(sql, name);
      const code = codeOnlyRpc(raw);
      expectContains(code, ["p_last_refresh_error_code text", "p_last_refresh_error_code !~", "token_refresh_last_error = p_last_refresh_error_code", "token_refresh_claim_expires_at > v_now"]);
      expect(literalAfterCode(raw, "p_last_refresh_error_code !~")).toBe("'^DOUYIN_[A-Z0-9_]{1,95}$'");
      expect(code).not.toContain("left(");
    }
  });
  test("claims atomically and completes only the matching unexpired lease", () => {
    const sql = structuralSql();
    const claimTables = [targetTables[0], targetTables[1]] as const;
    claimRpcs.forEach((name, index) => {
      const rpc = codeOnlyRpc(extractRpc(sql, name));
      expectContains(rpc, [
        "SECURITY DEFINER", "SET search_path = pg_catalog, public", "RETURN QUERY",
        `UPDATE public.${claimTables[index]}`, "token_refresh_claim_token IS NULL",
      ]);
      expect(rpc.match(new RegExp(`UPDATE public\\.${claimTables[index]}`, "g"))).toHaveLength(1);
      expect(rpc).not.toMatch(/\bSELECT\b/);
      expect(rpc).not.toContain("ciphertext");
    });
    for (const name of [...completeRpcs, ...failRpcs]) expectContains(codeOnlyRpc(extractRpc(sql, name)), [
      "token_refresh_claim_token = p_claim_token", "token_refresh_claim_token = NULL",
      "token_refresh_claim_expires_at = NULL", "RETURN v_updated = 1",
    ]);
    for (const name of completeRpcs) {
      expect(codeOnlyRpc(extractRpc(sql, name))).toContain("token_refresh_last_error = NULL");
    }
  });
  test("rotates the authorizer refresh envelope all-or-none in one update", () => {
    const rpc = normalize(codeOnlyRpc(extractRpc(structuralSql(), rpcNames[4])));
    expect(rpc.match(/UPDATE public\.douyin_miniapp_installations/g)).toHaveLength(1);
    expect(rpc).toContain(
      "v_refresh_rotated := p_refresh_token_ciphertext IS NOT NULL OR p_refresh_token_iv IS NOT NULL OR p_refresh_token_tag IS NOT NULL OR p_refresh_token_key_version IS NOT NULL OR p_refresh_token_expires_at IS NOT NULL;",
    );
    expect(rpc).toContain("IF v_refresh_rotated AND (");
    for (const field of ["ciphertext", "iv", "tag", "key_version", "expires_at"]) {
      const parameter = `p_refresh_token_${field}`;
      expect(rpc).toContain(`${parameter} IS NULL`);
      expect(rpc).toContain(
        `refresh_token_${field} = CASE WHEN v_refresh_rotated THEN ${parameter} ELSE installation.refresh_token_${field} END`,
      );
    }
    expect(rpc).toContain("p_refresh_token_expires_at <= v_now");
  });
  test("keeps tables and refresh RPCs service-role-only", () => {
    const sql = structuralSql();
    const code = codeOnlyStructure(sql);
    for (const table of targetTables) {
      expectContains(code, [
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`,
        `REVOKE ALL ON TABLE public.${table} FROM service_role;`,
      ]);
      const grants = code.match(new RegExp(`GRANT[^;]+ON TABLE public\\.${table}[^;]+;`, "g")) ?? [];
      expect(grants.map(normalize)).toEqual([
        `GRANT SELECT, INSERT, UPDATE ON TABLE public.${table} TO service_role;`,
      ]);
      expect(code).not.toMatch(new RegExp(`CREATE POLICY[^;]+ON public\\.${table}`, "i"));
    }
    const aclSql = normalizeAcl(code);
    for (const name of rpcNames) {
      const identity = rpcContracts[name][1];
      const rpc = codeOnlyRpc(extractRpc(sql, name));
      expectContains(rpc, ["SECURITY DEFINER", "SET search_path = pg_catalog, public"]);
      expect(aclSql).toContain(
        `REVOKE ALL ON FUNCTION public.${name}(${identity}) FROM PUBLIC, anon, authenticated;`,
      );
      const grants = code.match(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+?TO [^;]+;`, "gs"),
      ) ?? [];
      expect(grants.map(normalizeAcl)).toEqual([
        `GRANT EXECUTE ON FUNCTION public.${name}(${identity}) TO service_role;`,
      ]);
    }
  });
  test("grants one isolated platform permission to active administrators", () => {
    const sql = structuralSql();
    const grants = extractRolePermissionInserts(sql);
    expect(grants).toHaveLength(1);
    const grant = grants[0] ?? "";
    expect(grant).not.toBe("");
    const grantCode = normalize(codeOnlyStructure(grant));
    expectContains(grantCode, [
      "SELECT roles.id, permissions.id,", "permissions.code =", "roles.code IN ( , )",
      "roles.tenant_id IS NULL", "roles.status =", "permissions.status =",
    ]);
    expect(stringLiterals(grant)).toEqual(["'all'", "'platform.douyin_miniapp.manage'", "'platform_admin'", "'system_admin'", "'active'", "'active'"]);
    expect(grantCode).not.toContain("roles.tenant_id IS NOT NULL");
    const permissionInserts = topLevelStatements(sql, /\bINSERT\s+INTO\s+public\.permissions\b/gi);
    expect(permissionInserts).toHaveLength(1);
    expect(stringLiterals(permissionInserts[0] ?? "")).toEqual([
      "'platform.douyin_miniapp.manage'", "'管理抖音小程序'", "'platform'", "'douyin_miniapp'",
      "'manage'", "'管理抖音装修营销小程序授权、配置与发布'", "'active'",
    ]);
    const mutated = `${sql} INSERT INTO public.role_permissions (role_id, permission_id, access_scope) VALUES (gen_random_uuid(), gen_random_uuid(), 'all');`;
    const mutatedGrants = extractRolePermissionInserts(mutated);
    expect(mutatedGrants).toHaveLength(2);
    expect(mutatedGrants).not.toEqual(grants);
  });
  test("documents destructive rollback order and reauthorization risk", () => {
    expectContains(readMigration(), [
      "disable callbacks and session issuance first",
      "drop refresh RPCs before tables",
      "remove role_permissions before the permission row",
      "token loss requires merchant re-authorization",
    ]);
  });
});
