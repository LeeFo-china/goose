import {
  MATERIAL_NOTE_EXPLAIN_MANIFEST,
  type MaterialNoteExplainQueryName,
} from "./douyin-material-note-explain-evidence";

const EXPLAIN =
  "explain (analyze, buffers, settings, verbose, format json)";

export const MATERIAL_NOTE_EXPLAIN_QUERIES = Object.freeze({
  public_list: [
    EXPLAIN,
    "-- public_list",
    "select note.id, note.published_at, version.title,",
    "  exists (",
    "    select 1 from public.douyin_material_note_claims as claim",
    "    where claim.tenant_id = note.tenant_id",
    "      and claim.note_id = note.id",
    "      and claim.douyin_miniapp_installation_id = $2::uuid",
    "      and claim.subject_hash = $3::text",
    "      and claim.removed_at is null",
    "  ) as claimed",
    "from public.douyin_material_notes as note",
    "join public.douyin_material_note_versions as version",
    "  on version.id = note.published_version_id",
    "  and version.note_id = note.id",
    "  and version.tenant_id = note.tenant_id",
    "where note.tenant_id = $1::uuid and note.status = 'published'",
    "order by note.published_at desc, note.id desc",
    "limit 20",
  ].join("\n"),
  tenant_keyword_list: [
    EXPLAIN,
    "-- tenant_keyword_list",
    "select note.id, note.updated_at",
    "from public.douyin_material_notes as note",
    "where note.tenant_id = $1::uuid",
    "  and exists (",
    "    select 1 from public.douyin_material_note_versions as version",
    "    where version.tenant_id = note.tenant_id",
    "      and version.note_id = note.id",
    "      and (version.title ilike $2 escape '\\\\'",
    "        or version.summary ilike $2 escape '\\\\'",
    "        or version.category ilike $2 escape '\\\\')",
    "  )",
    "order by note.updated_at desc, note.id desc",
    "limit 20",
  ].join("\n"),
  owned_active_list: [
    EXPLAIN,
    "-- owned_active_list",
    "select claim.id, claim.claimed_at, note.status, version.title",
    "from public.douyin_material_note_claims as claim",
    "join public.douyin_material_notes as note",
    "  on note.id = claim.note_id and note.tenant_id = claim.tenant_id",
    "join public.douyin_material_note_versions as version",
    "  on version.id = claim.claimed_version_id",
    "  and version.note_id = claim.note_id",
    "  and version.tenant_id = claim.tenant_id",
    "where claim.tenant_id = $1::uuid",
    "  and claim.douyin_miniapp_installation_id = $2::uuid",
    "  and claim.subject_hash = $3::text",
    "  and claim.removed_at is null",
    "order by claim.claimed_at desc, claim.id desc",
    "limit 20",
  ].join("\n"),
} as const);

export const TRANSACTION_GUARD_QUERY = [
  "select pg_backend_pid() as \"backendPid\",",
  "  current_setting('transaction_read_only') as \"readOnly\",",
  "  current_setting('transaction_isolation') as isolation",
].join("\n");

export const ROLE_QUERY = [
  "select roles.rolsuper, roles.rolbypassrls as \"rolbypassrl\"",
  "from pg_roles as roles",
  "where roles.rolname = current_user",
].join("\n");

export const PLANNER_SETTINGS_QUERY = [
  "select name, current_setting(name) as \"current\",",
  "  setting as \"rawValue\", boot_val as \"bootValue\", category, source",
  "from pg_settings",
  "where category like 'Query Tuning /%'",
  "  or name in ('plan_cache_mode', 'search_path')",
  "order by name",
].join("\n");

export const FIXTURE_PREFLIGHT_QUERY = [
  "select note.id as \"noteId\", note.tenant_id as \"tenantId\",",
  "  installation.id as \"installationId\"",
  "from public.douyin_material_notes as note",
  "join public.douyin_material_note_versions as version",
  "  on version.id = note.published_version_id",
  "  and version.note_id = note.id",
  "  and version.tenant_id = note.tenant_id",
  "join public.douyin_miniapp_installations as installation",
  "  on installation.tenant_id = note.tenant_id",
  "where note.status = 'published'",
  "  and version.category = $1::text",
  "  and installation.installation_kind = 'merchant'",
  "  and installation.authorization_status = 'active'",
  "order by note.id asc, installation.id asc",
  "limit 2",
].join("\n");

export const CLAIM_PREFLIGHT_QUERY = [
  "select claim.subject_hash as \"subjectHash\"",
  "from public.douyin_material_note_claims as claim",
  "where claim.tenant_id = $1::uuid",
  "  and claim.douyin_miniapp_installation_id = $2::uuid",
  "  and claim.note_id = $3::uuid",
  "  and claim.removed_at is null",
  "order by claim.claimed_at desc, claim.id desc",
  "limit 1",
].join("\n");

export const CARDINALITY_QUERIES = {
  public_list:
    "select count(*)::integer as count from (select 1 from public.douyin_material_notes limit 1000) as bounded_rows",
  tenant_keyword_list:
    "select count(*)::integer as count from (select 1 from public.douyin_material_note_versions limit 1000) as bounded_rows",
  owned_active_list:
    "select count(*)::integer as count from (select 1 from public.douyin_material_note_claims limit 1000) as bounded_rows",
} as const satisfies Record<MaterialNoteExplainQueryName, string>;

const INDEX_NAMES = [...new Set(
  Object.values(MATERIAL_NOTE_EXPLAIN_MANIFEST)
    .flatMap((entry) => entry.indexes.map((index) => index.name)),
)];

export const INDEX_METADATA_QUERY = [
  "select index_class.relname as \"indexName\",",
  "  index_namespace.nspname as schema,",
  "  relation_class.relname as relation,",
  "  index_catalog.indisvalid, index_catalog.indisready",
  "from pg_index as index_catalog",
  "join pg_class as index_class",
  "  on index_class.oid = index_catalog.indexrelid",
  "join pg_namespace as index_namespace",
  "  on index_namespace.oid = index_class.relnamespace",
  "join pg_class as relation_class",
  "  on relation_class.oid = index_catalog.indrelid",
  "join pg_namespace as relation_namespace",
  "  on relation_namespace.oid = relation_class.relnamespace",
  "where index_class.relname in (",
  ...INDEX_NAMES.map((name) => "  '" + name + "'"),
  ") and index_namespace.nspname = 'public'",
  "order by index_class.relname",
].join("\n").replaceAll("'\n  '", "',\n  '");
