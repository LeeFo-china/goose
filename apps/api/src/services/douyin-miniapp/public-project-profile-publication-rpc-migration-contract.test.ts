import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const initialMigrationPath = new URL(
  "../../../../../supabase/migrations/20260821091000_create_douyin_project_profile_publication_rpc.sql",
  import.meta.url,
);
const finalMigrationPath = new URL(
  "../../../../../supabase/migrations/20260821091100_fix_douyin_project_profile_publication_rpc_aliases.sql",
  import.meta.url,
);
const FUNCTION_SIGNATURE =
  "public.upsert_douyin_project_public_profile( uuid, uuid, text, text, text[], text[], text, text )";
const FUNCTION_ARGUMENTS =
  "p_tenant_id uuid, p_project_id uuid, p_public_title text, p_public_description text, p_public_image_urls text[], p_style_tags text[], p_budget_band text, p_publication_status text";

function readMigration(path: URL): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

function outsideFunctionBody(sql: string): string {
  return sql.replace(/AS \$function\$[\s\S]*?\$function\$/i, "AS <function body>");
}

function extractFunctionDefinition(sql: string): string {
  const match = sql.match(
    /CREATE(?: OR REPLACE)? FUNCTION public\.upsert_douyin_project_public_profile\([\s\S]*?\$function\$;/,
  );
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

function canonicalFunctionDefinition(sql: string): string {
  return extractFunctionDefinition(sql)
    .replace(/--.*$/gm, "")
    .replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION")
    .replace(/\bv_image_reference\b/g, "image_reference")
    .replace(/\bv_selected_reference\b/g, "selected_reference")
    .replace(/\s+/g, " ")
    .trim();
}

function assertFinalPublicationContract(raw: string): void {
  const sql = normalize(raw);
  const outside = normalize(outsideFunctionBody(raw));

  expect(sql).toContain(
    `CREATE OR REPLACE FUNCTION public.upsert_douyin_project_public_profile( ${FUNCTION_ARGUMENTS} ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public`,
  );
  expect(sql).toContain(
    `REVOKE ALL ON FUNCTION ${FUNCTION_SIGNATURE} FROM PUBLIC, anon, authenticated, service_role;`,
  );
  expect(sql).toContain(
    `GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE} TO service_role;`,
  );
  expect(sql).not.toMatch(
    /GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/,
  );

  expect(sql).toMatch(
    /RETURN pg_catalog\.jsonb_build_object\( 'data', pg_catalog\.to_jsonb\(v_saved_profile\) \);/,
  );
  expect(sql).toMatch(
    /pg_catalog\.jsonb_build_object\( 'error', pg_catalog\.jsonb_build_object\( 'status_code',/,
  );
  for (const errorCode of [
    "DOUYIN_PROJECT_PUBLICATION_INVALID",
    "DOUYIN_PROJECT_NOT_FOUND",
    "DOUYIN_PROJECT_IMAGE_REFERENCE_SCOPE_MISMATCH",
    "DOUYIN_PROJECT_IMAGE_NOT_ATTACHED",
    "DOUYIN_PROJECT_PUBLICATION_IMAGES_REQUIRED",
  ]) {
    expect(sql).toContain(`'code', '${errorCode}'`);
  }
  expect(sql).toContain("'status_code', 400");
  expect(sql).toContain("'status_code', 404");

  expect(sql).toContain(
    "v_public_title text := pg_catalog.btrim(p_public_title)",
  );
  expect(sql).toContain(
    "v_public_description text := pg_catalog.btrim(p_public_description)",
  );
  expect(sql).toContain(
    "pg_catalog.btrim(image_reference.value) ORDER BY image_reference.ordinality",
  );
  expect(sql).toContain(
    "pg_catalog.btrim(style_tag.value) ORDER BY style_tag.ordinality",
  );
  expect(sql).toContain(
    "pg_catalog.char_length(v_public_title) BETWEEN 2 AND 100",
  );
  expect(sql).toContain(
    "pg_catalog.char_length(v_public_description) BETWEEN 20 AND 2000",
  );
  expect(sql).toContain("pg_catalog.cardinality(v_style_tags) > 8");
  expect(sql).toContain(
    "pg_catalog.char_length(style_tag.value) BETWEEN 1 AND 40",
  );
  expect(sql).toContain(
    "pg_catalog.char_length(v_budget_band) BETWEEN 1 AND 80",
  );
  expect(sql).toContain(
    "public.douyin_public_image_urls_are_valid(v_image_references)",
  );
  expect(sql).toContain(
    "p_publication_status IN ('draft', 'published', 'hidden')",
  );
  expect(sql).toContain(
    "p_publication_status = 'published' AND pg_catalog.cardinality(v_image_references) < 3",
  );
  expect(sql).toContain(
    "pg_catalog.strpos(image_reference.value, '?') > 0",
  );
  expect(sql).toContain(
    "pg_catalog.strpos(image_reference.value, '#') > 0",
  );
  expect(sql).toContain(
    "pg_catalog.strpos(v_image_reference.value, '?') > 0",
  );
  expect(sql).toContain(
    "pg_catalog.strpos(v_image_reference.value, '#') > 0",
  );

  expect(sql).toContain(
    "'tenants/' || p_tenant_id::text || '/project-log/projects/' || p_project_id::text || '/'",
  );
  expect(sql).toContain("v_image_reference.value !~ '^https://'");
  expect(sql).toContain(
    "v_image_reference.value NOT LIKE v_scope_prefix || '%'",
  );

  const projectLock = sql.indexOf("FROM public.projects AS project");
  const projectForUpdate = sql.indexOf("FOR UPDATE", projectLock);
  const logRead = sql.indexOf("FROM public.project_logs AS project_log");
  const logOrder = sql.indexOf(
    "ORDER BY project_log.created_at DESC, project_log.id DESC",
    logRead,
  );
  const logLimit = sql.indexOf("LIMIT 100", logOrder);
  const logForShare = sql.indexOf("FOR SHARE", logLimit);
  const upsert = sql.indexOf(
    "INSERT INTO public.douyin_project_public_profiles",
    logForShare,
  );

  expect(projectLock).toBeGreaterThan(-1);
  expect(projectForUpdate).toBeGreaterThan(projectLock);
  expect(logRead).toBeGreaterThan(projectForUpdate);
  expect(logOrder).toBeGreaterThan(logRead);
  expect(logLimit).toBeGreaterThan(logOrder);
  expect(logForShare).toBeGreaterThan(logLimit);
  expect(upsert).toBeGreaterThan(logForShare);
  expect(sql).toContain("project.id = p_project_id");
  expect(sql).toContain("project.tenant_id = p_tenant_id");
  expect(sql).toContain(
    "pg_catalog.jsonb_typeof(v_project_log.images) = 'array'",
  );
  expect(sql).toContain(
    "pg_catalog.jsonb_typeof(raw_image.value) = 'string'",
  );
  expect(sql).toContain("pg_catalog.btrim(raw_image.value #>> '{}')");
  expect(sql).toContain("LIMIT 30");
  expect(sql).toContain(
    "pg_catalog.cardinality(v_candidate_references) < 300",
  );
  expect(sql).toContain("ARRAY[v_image_reference.value]");

  expect(sql).toMatch(
    /pg_catalog\.array_position\( v_candidate_references, v_image_reference\.value \) IS NULL/,
  );
  expect(sql).toMatch(
    /pg_catalog\.array_position\( v_candidate_references, v_selected_reference\.value \) IS NULL/,
  );
  expect(sql).toContain("ON CONFLICT (tenant_id, project_id) DO UPDATE");
  expect(sql).toContain("RETURNING profile.* INTO v_saved_profile");
  expect(sql.match(/INSERT INTO public\.douyin_project_public_profiles/g))
    .toHaveLength(1);

  const lowerRaw = raw.toLowerCase();
  expect(raw).toContain("-- Forward rollback procedure:");
  expect(lowerRaw).toContain("disable new public-project publication writes");
  expect(lowerRaw).toContain("keep the compatibility route");
  expect(lowerRaw).toContain("confirm no published client depends on this rpc");
  expect(lowerRaw).toContain("forward migration to revoke execute and drop the function");
  expect(outside).not.toMatch(/\b(?:insert|update|delete|merge|truncate)\b/);
  expect(outside).not.toMatch(/\b(?:create|alter|drop) table\b/);
  expect(outside).not.toContain(
    "SELECT public.upsert_douyin_project_public_profile(",
  );
  expect(outside).not.toContain("DISABLE ROW LEVEL SECURITY");

  expect(sql).toContain("v_image_reference record");
  expect(sql).toContain("v_selected_reference record");
  expect(sql).not.toMatch(/\bimage_reference record\b/);
  expect(sql).not.toMatch(/\bselected_reference record\b/);
}

describe("Douyin project profile publication RPC migration", () => {
  test("keeps the applied alias repair semantically identical to the original", () => {
    const initial = readMigration(initialMigrationPath);
    const final = readMigration(finalMigrationPath);

    expect(existsSync(initialMigrationPath)).toBe(true);
    expect(existsSync(finalMigrationPath)).toBe(true);
    expect(normalize(initial)).toContain(
      "CREATE FUNCTION public.upsert_douyin_project_public_profile(",
    );
    expect(normalize(final)).toContain(
      "CREATE OR REPLACE FUNCTION public.upsert_douyin_project_public_profile(",
    );
    expect(canonicalFunctionDefinition(final)).toBe(
      canonicalFunctionDefinition(initial),
    );
    expect(initial).toContain("write-time atomicity");
    expect(initial.replace(/\s+/g, " ")).toContain(
      "Later project-log deletion can detach a saved reference",
    );
  });

  test("guards the complete final effective publication command", () => {
    assertFinalPublicationContract(readMigration(finalMigrationPath));
  });

  test("rejects deletion of representative final command guarantees", () => {
    const raw = readMigration(finalMigrationPath);
    const criticalFragments = [
      "SECURITY DEFINER",
      "'code', 'DOUYIN_PROJECT_IMAGE_NOT_ATTACHED'",
      "pg_catalog.strpos(image_reference.value, '#') > 0",
      "v_image_reference.value NOT LIKE v_scope_prefix || '%'",
      "FOR UPDATE",
      "FOR SHARE",
      "LIMIT 30",
      "pg_catalog.cardinality(v_candidate_references) < 300",
      "v_selected_reference.value",
      "ON CONFLICT (tenant_id, project_id) DO UPDATE",
      "-- Forward rollback procedure:",
      "TO service_role;",
    ];

    for (const fragment of criticalFragments) {
      const mutated = raw.replace(fragment, "");
      expect(mutated).not.toBe(raw);
      expect(() => assertFinalPublicationContract(mutated)).toThrow();
    }
  });
});
