import { describe, expect, test } from 'bun:test';

import type { Database } from '../../types/database';

const migration = new URL(
  '../../../../../supabase/migrations/20260821100000_create_douyin_budget_estimates.sql',
  import.meta.url,
);
const repairMigration = new URL(
  '../../../../../supabase/migrations/20260821101000_fix_douyin_budget_estimate_ownership.sql',
  import.meta.url,
);
const generatedTypes = new URL('../../types/database.ts', import.meta.url);

const expectedGeneratedTables = [
  'douyin_budget_pricing_versions',
  'douyin_budget_pricing_items',
  'douyin_budget_estimates',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

function executableSql(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function normalized(source: string): string {
  return source.replace(/\s+/g, ' ').trim().toLowerCase();
}

function tableDefinition(source: string, tableName: string): string {
  const sql = executableSql(source);
  const marker = `CREATE TABLE public.${tableName}`;
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const open = sql.indexOf('(', start + marker.length);
  expect(open).toBeGreaterThanOrEqual(0);

  let depth = 0;
  let inString = false;
  for (let index = open; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'") {
      if (inString && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth === 0) return normalized(sql.slice(open + 1, index));
  }

  throw new Error(`Unterminated CREATE TABLE for ${tableName}`);
}

function functionBody(source: string, functionName: string): string {
  const sql = executableSql(source);
  const pattern = new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([^]*?AS \\$([a-z_]*)\\$([^]*?)\\$\\1\\$`,
    'i',
  );
  const match = sql.match(pattern);
  expect(match).not.toBeNull();
  return normalized(match?.[2] ?? '');
}

function topLevelStatements(source: string): string[] {
  const sql = executableSql(source);
  const statements: string[] = [];
  let start = 0;
  let inString = false;
  let dollarTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (sql[index] === "'") {
      if (inString && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    const dollarMatch = sql.slice(index).match(/^\$[a-z_]*\$/i);
    if (dollarMatch?.[0]) {
      dollarTag = dollarMatch[0];
      index += dollarTag.length - 1;
      continue;
    }
    if (sql[index] === ';') {
      const statement = normalized(sql.slice(start, index));
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  return statements;
}

async function readMigration(): Promise<string> {
  return Bun.file(migration).text();
}

function expectMutationsRejected(
  source: string,
  mutations: readonly string[],
  contract: (candidate: string) => void,
): void {
  for (const mutated of mutations) {
    expect(mutated).not.toBe(source);
    expect(() => contract(mutated)).toThrow();
  }
}

function expectTopLevelSafety(
  source: string,
  allowedDrop?: RegExp,
  allowedDo?: string,
): void {
  const allowedStatements = [
    /^(begin|commit)$/,
    /^set local (lock_timeout|statement_timeout) = '(5s|30s)'$/,
    /^create table public\.douyin_budget_(pricing_versions|pricing_items|estimates)\b/,
    /^create (unique )?index douyin_budget_[a-z0-9_]+ on public\.douyin_budget_(pricing_versions|pricing_items|estimates)\b/,
    /^create( or replace)? function public\.(protect_douyin_budget_pricing_version|protect_douyin_budget_pricing_item|validate_douyin_budget_estimate_ownership|protect_douyin_budget_estimate)\(\) returns trigger\b/,
    /^revoke all on function public\.(protect_douyin_budget_pricing_version|protect_douyin_budget_pricing_item|validate_douyin_budget_estimate_ownership|protect_douyin_budget_estimate)\(\) from public, anon, authenticated, service_role$/,
    /^create trigger (douyin_budget_pricing_versions_protect|douyin_budget_pricing_items_protect|douyin_budget_estimates_validate_ownership|douyin_budget_estimates_protect|tr_douyin_budget_pricing_versions_updated_at|tr_douyin_budget_pricing_items_updated_at|tr_douyin_budget_estimates_updated_at)\b/,
    /^alter table public\.douyin_budget_(pricing_versions|pricing_items|estimates) (enable|force) row level security$/,
    /^revoke all on table public\.douyin_budget_(pricing_versions|pricing_items|estimates) from public, anon, authenticated, service_role$/,
    /^grant select, insert, update, delete on table public\.douyin_budget_(pricing_versions|pricing_items) to service_role$/,
    /^grant select, insert, update on table public\.douyin_budget_estimates to service_role$/,
    /^alter table public\.douyin_miniapp_installations add constraint douyin_miniapp_installations_id_tenant_key unique \(id, tenant_id\)$/,
    /^alter table public\.douyin_budget_estimates add constraint douyin_budget_estimates_installation_owner_fkey foreign key \(douyin_miniapp_installation_id, tenant_id\) references public\.douyin_miniapp_installations\(id, tenant_id\) on delete restrict not valid$/,
    /^alter table public\.douyin_budget_estimates validate constraint douyin_budget_estimates_installation_owner_fkey$/,
  ];

  for (const statement of topLevelStatements(source)) {
    expect(statement).not.toMatch(/^(insert|update|delete|merge|copy|call|truncate)\b/);
    expect(statement).not.toMatch(/^with\b[^]*\b(insert|update|delete|merge)\b/);
    expect(statement).not.toMatch(/^select\b/);
    if (statement.startsWith('do ')) {
      expect(statement).toBe(allowedDo ?? '');
      continue;
    }
    if (/^(drop\b|alter table\b[^]*\bdrop\b)/.test(statement)) {
      expect(allowedDrop?.test(statement) ?? false).toBe(true);
      continue;
    }
    expect(allowedStatements.some((pattern) => pattern.test(statement))).toBe(true);
  }
}

function expectOriginalMutationContract(source: string): void {
  const sql = normalized(executableSql(source));
  expectTopLevelSafety(source);
  expect(sql).toMatch(/create unique index douyin_budget_one_active_version on public\.douyin_budget_pricing_versions\(tenant_id\) where status = 'active'/);

  const indexes = [
    /create index douyin_budget_pricing_versions_tenant_list_idx on public\.douyin_budget_pricing_versions\( tenant_id, created_at desc, id desc \)/,
    /create index douyin_budget_pricing_versions_tenant_effective_idx on public\.douyin_budget_pricing_versions\( tenant_id, status, effective_from desc, effective_to, id \)/,
    /create index douyin_budget_estimates_tenant_created_idx on public\.douyin_budget_estimates\(tenant_id, created_at desc, id desc\)/,
    /create index douyin_budget_estimates_tenant_subject_created_idx on public\.douyin_budget_estimates\( tenant_id, subject_hash, created_at desc \)/,
    /create index douyin_budget_estimates_tenant_ip_created_idx on public\.douyin_budget_estimates\( tenant_id, request_ip_hash, created_at desc \)/,
    /create unique index douyin_budget_estimates_identity_owner_key on public\.douyin_budget_estimates\(id, tenant_id\)/,
  ];
  for (const index of indexes) expect(sql).toMatch(index);

  const triggerAttachments = [
    /create trigger douyin_budget_pricing_versions_protect before update or delete on public\.douyin_budget_pricing_versions for each row execute function public\.protect_douyin_budget_pricing_version\(\)/,
    /create trigger douyin_budget_pricing_items_protect before insert or update or delete on public\.douyin_budget_pricing_items for each row execute function public\.protect_douyin_budget_pricing_item\(\)/,
    /create trigger douyin_budget_estimates_validate_ownership before insert on public\.douyin_budget_estimates for each row execute function public\.validate_douyin_budget_estimate_ownership\(\)/,
    /create trigger douyin_budget_estimates_protect before update or delete on public\.douyin_budget_estimates for each row execute function public\.protect_douyin_budget_estimate\(\)/,
  ];
  for (const trigger of triggerAttachments) expect(sql).toMatch(trigger);

  const estimateGuard = functionBody(source, 'protect_douyin_budget_estimate');
  for (const column of [
    'id', 'tenant_id', 'douyin_miniapp_installation_id', 'subject_hash',
    'request_ip_hash', 'pricing_version_id', 'estimate_no', 'request_payload',
    'result_payload', 'expires_at', 'created_at',
  ]) {
    expect(estimateGuard).toMatch(
      new RegExp(`new\\.${column} is distinct from old\\.${column}`),
    );
  }
  expect(estimateGuard).toMatch(/old\.ai_status = 'pending' and old\.ai_claimed_at is null/);
  expect(estimateGuard).toMatch(/old\.ai_status = 'pending' and old\.ai_claimed_at is not null/);
  expect(estimateGuard).toMatch(/old\.ai_claimed_at > clock_timestamp\(\) - interval '60 seconds'/);
  expect(estimateGuard).toMatch(/new\.ai_attempt_count <> old\.ai_attempt_count \+ 1/);
  expect(estimateGuard).toMatch(/new\.ai_status in \('succeeded', 'failed'\)/);
  expect(estimateGuard).toMatch(/old\.ai_status = 'failed'/);
  expect(estimateGuard).toMatch(/old\.ai_attempt_count >= 3/);
  expect(estimateGuard).toMatch(/if old\.ai_status = 'pending' and old\.ai_claimed_at is null then if new\.ai_status <> 'pending' or new\.ai_claimed_at is null or new\.ai_attempt_count <> old\.ai_attempt_count \+ 1 or new\.ai_analysis is not null or new\.ai_provider is not null or new\.ai_model is not null or new\.ai_last_error_code is not null then raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_ai_transition_invalid'; end if; elsif old\.ai_status = 'pending' and old\.ai_claimed_at is not null then/);
  expect(estimateGuard).toMatch(/if new\.ai_status = 'pending' then if old\.ai_claimed_at > clock_timestamp\(\) - interval '60 seconds' or new\.ai_claimed_at is null or new\.ai_claimed_at <= old\.ai_claimed_at or new\.ai_attempt_count <> old\.ai_attempt_count \+ 1 or new\.ai_analysis is not null or new\.ai_provider is not null or new\.ai_model is not null or new\.ai_last_error_code is not null then raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_ai_transition_invalid'; end if; elsif new\.ai_status in \('succeeded', 'failed'\) then/);
  expect(estimateGuard).toMatch(/elsif new\.ai_status in \('succeeded', 'failed'\) then if new\.ai_claimed_at is not null or new\.ai_attempt_count <> old\.ai_attempt_count then raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_ai_transition_invalid'; end if; else raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_ai_transition_invalid'; end if;/);
  expect(estimateGuard).toMatch(/elsif old\.ai_status = 'failed' then if new\.ai_status <> 'pending' or old\.ai_attempt_count >= 3 or new\.ai_claimed_at is null or new\.ai_attempt_count <> old\.ai_attempt_count \+ 1 or new\.ai_analysis is not null or new\.ai_provider is not null or new\.ai_model is not null or new\.ai_last_error_code is not null then raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_ai_transition_invalid'; end if; else raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_ai_transition_invalid'; end if; return new;/);

  const ownershipGuard = functionBody(
    source,
    'validate_douyin_budget_estimate_ownership',
  );
  expect(ownershipGuard).toMatch(/installation\.installation_kind = 'merchant'/);
  expect(ownershipGuard).toMatch(/installation\.authorization_status = 'active'/);
  expect(ownershipGuard).toMatch(/pricing_version\.status = 'active'/);
  expect(ownershipGuard).toMatch(/pricing_version\.effective_from <= new\.created_at/);
  expect(ownershipGuard).toMatch(/pricing_version\.effective_to > new\.created_at/);

  const statements = topLevelStatements(source);
  const expectedTableAcl = [
    'revoke all on table public.douyin_budget_pricing_versions from public, anon, authenticated, service_role',
    'revoke all on table public.douyin_budget_pricing_items from public, anon, authenticated, service_role',
    'revoke all on table public.douyin_budget_estimates from public, anon, authenticated, service_role',
    'grant select, insert, update, delete on table public.douyin_budget_pricing_versions to service_role',
    'grant select, insert, update, delete on table public.douyin_budget_pricing_items to service_role',
    'grant select, insert, update on table public.douyin_budget_estimates to service_role',
  ];
  expect(
    statements.filter((statement) =>
      /^(grant|revoke)\b[^]*\bon table public\.douyin_budget_/.test(statement),
    ),
  ).toEqual(expectedTableAcl);
  for (const table of expectedGeneratedTables) {
    expect(statements).toContain(
      `alter table public.${table} enable row level security`,
    );
    expect(statements).toContain(
      `alter table public.${table} force row level security`,
    );
  }
  for (const functionName of [
    'protect_douyin_budget_pricing_version', 'protect_douyin_budget_pricing_item',
    'validate_douyin_budget_estimate_ownership', 'protect_douyin_budget_estimate',
  ]) {
    expect(statements).toContain(
      `revoke all on function public.${functionName}() from public, anon, authenticated, service_role`,
    );
  }
}

function expectRepairContract(source: string): void {
  const sql = normalized(executableSql(source));
  const expectedPreflight = "do $block$ begin if exists ( select 1 from public.douyin_budget_estimates as estimate left join public.douyin_miniapp_installations as installation on installation.id = estimate.douyin_miniapp_installation_id and installation.tenant_id = estimate.tenant_id where installation.id is null ) then raise exception using errcode = 'p0001', message = 'douyin_budget_estimate_installation_ownership_invalid'; end if; end; $block$";
  expect(source.startsWith('-- Forward rollback procedure:')).toBe(true);
  expectTopLevelSafety(
    source,
    /^alter table public\.douyin_budget_estimates drop constraint douyin_budget_estimates_douyin_miniapp_installation_id_fkey$/,
    expectedPreflight,
  );
  expect(topLevelStatements(source).slice(0, 3)).toEqual([
    'begin',
    "set local lock_timeout = '5s'",
    "set local statement_timeout = '30s'",
  ]);
  expect(sql).toMatch(/if exists \( select 1 from public\.douyin_budget_estimates as estimate left join public\.douyin_miniapp_installations as installation on installation\.id = estimate\.douyin_miniapp_installation_id and installation\.tenant_id = estimate\.tenant_id where installation\.id is null \) then raise exception/);
  expect(sql).toMatch(/alter table public\.douyin_miniapp_installations add constraint douyin_miniapp_installations_id_tenant_key unique \(id, tenant_id\)/);
  expect(sql).toMatch(/add constraint douyin_budget_estimates_installation_owner_fkey foreign key \(douyin_miniapp_installation_id, tenant_id\) references public\.douyin_miniapp_installations\(id, tenant_id\) on delete restrict not valid/);
  const validateAt = sql.indexOf(
    'validate constraint douyin_budget_estimates_installation_owner_fkey',
  );
  const dropAt = sql.indexOf(
    'drop constraint douyin_budget_estimates_douyin_miniapp_installation_id_fkey',
  );
  expect(validateAt).toBeGreaterThanOrEqual(0);
  expect(dropAt).toBeGreaterThan(validateAt);

  const versionGuard = functionBody(
    source,
    'protect_douyin_budget_pricing_version',
  );
  expect(versionGuard).toMatch(/if tg_op = 'delete'.*if old\.status <> 'draft'.*delete from public\.douyin_budget_pricing_items where pricing_version_id = old\.id.*return old/);
  expect(versionGuard).toMatch(/if old\.status = 'archived' then raise exception using errcode = 'p0001', message = 'douyin_budget_pricing_version_immutable'; end if/);
  expect(versionGuard).toMatch(/if old\.status = 'active' and \( new\.status <> 'archived'/);
  for (const column of [
    'id', 'tenant_id', 'version_no', 'effective_from', 'effective_to',
    'currency', 'disclaimer', 'created_by_employee_id', 'created_at',
  ]) {
    expect(versionGuard).toMatch(
      new RegExp(`new\\.${column} is distinct from old\\.${column}`),
    );
  }
  expect(topLevelStatements(source)).toContain(
    'revoke all on function public.protect_douyin_budget_pricing_version() from public, anon, authenticated, service_role',
  );
  expect(sql).not.toMatch(/\b(grant|revoke)\b[^;]*on table public\./);
  expect(topLevelStatements(source).at(-1)).toBe('commit');
}

function expectGeneratedOwnershipContract(source: string): void {
  const types = normalized(source);
  const relationship = /foreignkeyname: "douyin_budget_estimates_installation_owner_fkey" columns: \["douyin_miniapp_installation_id", "tenant_id"\] isonetoone: false referencedrelation: "douyin_miniapp_installations" referencedcolumns: \["id", "tenant_id"\]/;
  expect(types).toMatch(relationship);
  expect(types).not.toMatch(/foreignkeyname: "douyin_budget_estimates_douyin_miniapp_installation_id_fkey"/);
}

describe('douyin budget migration', () => {
  test('uses a bounded forward-only migration without business-data DML', async () => {
    const source = await readMigration();
    expect(source.startsWith('-- Forward rollback procedure:')).toBe(true);
    const statements = topLevelStatements(source);
    expect(statements.slice(0, 4)).toEqual([
      'begin',
      "set local lock_timeout = '5s'",
      "set local statement_timeout = '30s'",
      expect.stringMatching(/^create table public\.douyin_budget_pricing_versions/),
    ]);
    expect(statements.at(-1)).toBe('commit');
    expect(
      statements.filter((statement) =>
        /^(insert|update|delete|truncate|drop)\b/.test(statement),
      ),
    ).toEqual([]);
  });

  test('creates tenant-owned versioned pricing with real catalog foreign keys', async () => {
    const source = await readMigration();
    const versions = tableDefinition(source, 'douyin_budget_pricing_versions');
    expect(versions).toMatch(/tenant_id uuid not null references public\.tenants\(id\) on delete restrict/);
    expect(versions).toMatch(/version_no bigint not null/);
    expect(versions).toMatch(/unique \(tenant_id, version_no\)/);
    expect(versions).toMatch(/unique \(id, tenant_id\)/);
    expect(versions).toMatch(/foreign key \(created_by_employee_id, tenant_id\) references public\.employees\(id, tenant_id\) on delete restrict/);
    expect(versions).toMatch(/status in \('draft', 'active', 'archived'\)/);
    expect(versions).toMatch(/currency = 'cny'/);
    expect(versions).toMatch(/effective_to is null or effective_to > effective_from/);
  });

  test('bounds visit-safe pricing items to 100 ordered entries per version', async () => {
    const items = tableDefinition(
      await readMigration(),
      'douyin_budget_pricing_items',
    );
    expect(items).toMatch(/pricing_version_id uuid not null references public\.douyin_budget_pricing_versions\(id\) on delete cascade/);
    expect(items).toMatch(/unique \(pricing_version_id, item_code\)/);
    expect(items).toMatch(/unique \(pricing_version_id, sort_order\)/);
    expect(items).toMatch(/sort_order between 0 and 99/);
    expect(items).toMatch(/unit in \('sqm', 'fixed'\)/);
    expect(items).toMatch(/status in \('active', 'inactive'\)/);
    expect(items).toMatch(/category_code in \(\s*'base', 'water_electricity', 'materials', 'custom', 'other'\s*\)/);
    expect(items).toMatch(/item_code in \(\s*[^)]*'base\.economy\.rough'[^)]*'custom_cabinet'[^)]*\)/);
    expect(items).toMatch(/minimum_amount bigint not null/);
    expect(items).toMatch(/minimum_amount >= 0/);
    expect(items).toMatch(/maximum_amount >= minimum_amount/);
    expect(items).toMatch(/jsonb_typeof\(condition_payload\) = 'object'/);
  });

  test('creates immutable tenant-owned estimate snapshots with bounded AI state', async () => {
    const estimates = tableDefinition(
      await readMigration(),
      'douyin_budget_estimates',
    );
    expect(estimates).toMatch(/estimate_no text not null unique/);
    expect(estimates).toMatch(/estimate_no ~ '\^dyys-\[0-9\]\{8\}-\[0-9\]\{6\}\$'/);
    expect(estimates).toMatch(/subject_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(estimates).toMatch(/request_ip_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(estimates).toMatch(/foreign key \(pricing_version_id, tenant_id\) references public\.douyin_budget_pricing_versions\(id, tenant_id\) on delete restrict/);
    expect(estimates).toMatch(/douyin_miniapp_installation_id uuid not null references public\.douyin_miniapp_installations\(id\) on delete restrict/);
    for (const column of ['request_payload', 'result_payload']) {
      expect(estimates).toMatch(new RegExp(`jsonb_typeof\\(${column}\\) = 'object'`));
    }
    expect(estimates).toMatch(/ai_analysis is null or jsonb_typeof\(ai_analysis\) = 'object'/);
    expect(estimates).toMatch(/ai_status in \('pending', 'succeeded', 'failed', 'skipped'\)/);
    expect(estimates).toMatch(/ai_attempt_count between 0 and 3/);
    expect(estimates).toMatch(/expires_at > created_at/);
  });

  test('locks activated pricing, active items and immutable snapshot fields', async () => {
    const source = await readMigration();
    const versionGuard = functionBody(source, 'protect_douyin_budget_pricing_version');
    expect(versionGuard).toMatch(/tg_op = 'delete'.*old\.status <> 'draft'/);
    expect(versionGuard).toMatch(/old\.status = 'active'.*new\.status <> 'archived'/);
    expect(versionGuard).toMatch(/old\.status = 'archived'/);

    const itemGuard = functionBody(source, 'protect_douyin_budget_pricing_item');
    expect(itemGuard).toMatch(/coalesce\(\s*new\.pricing_version_id, old\.pricing_version_id\s*\)/);
    expect(itemGuard).toMatch(/select pricing_version\.status into v_pricing_status/);
    expect(itemGuard).toMatch(/v_pricing_status <> 'draft'/);

    const estimateGuard = functionBody(source, 'protect_douyin_budget_estimate');
    expect(estimateGuard).toMatch(/tg_op = 'delete'/);
    for (const column of [
      'tenant_id',
      'douyin_miniapp_installation_id',
      'pricing_version_id',
      'request_payload',
      'result_payload',
    ]) {
      expect(estimateGuard).toMatch(
        new RegExp(`new\\.${column} is distinct from old\\.${column}`),
      );
    }
  });

  test('validates installation ownership and creates the required query indexes', async () => {
    const sql = normalized(executableSql(await readMigration()));
    expect(sql).toMatch(/create trigger douyin_budget_estimates_validate_ownership before insert on public\.douyin_budget_estimates/);
    expect(sql).toMatch(/where installation\.id = new\.douyin_miniapp_installation_id and installation\.tenant_id = new\.tenant_id/);
    for (const index of [
      'douyin_budget_pricing_versions_tenant_list_idx',
      'douyin_budget_pricing_versions_tenant_effective_idx',
      'douyin_budget_estimates_tenant_created_idx',
      'douyin_budget_estimates_tenant_subject_created_idx',
      'douyin_budget_estimates_tenant_ip_created_idx',
      'douyin_budget_estimates_identity_owner_key',
    ]) {
      expect(sql).toMatch(new RegExp(`create (?:unique )?index ${index} on public\\.`));
    }
  });

  test('enables policy-free RLS and exposes tables only to service_role', async () => {
    const sql = normalized(executableSql(await readMigration()));
    for (const table of expectedGeneratedTables) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
      expect(sql).toMatch(new RegExp(`grant [a-z, ]+ on table public\\.${table} to service_role`));
    }
    expect(sql).not.toMatch(/create policy\b/);
  });

  test('rejects mutations of indexes, trigger wiring, immutability, AI states and ACL', async () => {
    const source = await readMigration();
    expectOriginalMutationContract(source);
    const replacements = [
      ['CREATE UNIQUE INDEX douyin_budget_one_active_version', 'CREATE INDEX douyin_budget_one_active_version'],
      ['CREATE TRIGGER douyin_budget_estimates_protect', 'CREATE TRIGGER douyin_budget_estimates_protect_removed'],
      ['    OR NEW.request_payload IS DISTINCT FROM OLD.request_payload\n', ''],
      ["  ELSIF OLD.ai_status = 'failed' THEN", "  ELSIF OLD.ai_status = 'failed_removed' THEN"],
      ['  tenant_id,\n  subject_hash,\n  created_at DESC', '  tenant_id,\n  created_at DESC,\n  subject_hash'],
      ["    AND installation.authorization_status = 'active'\n", ''],
      ['    AND pricing_version.effective_from <= NEW.created_at\n', ''],
      ['GRANT SELECT, INSERT, UPDATE\nON TABLE public.douyin_budget_estimates', 'GRANT SELECT, INSERT, UPDATE, DELETE\nON TABLE public.douyin_budget_estimates'],
    ] as const;
    const mutations = replacements.map(([before, after]) => source.replace(before, after));
    mutations.push(`${source}\nGRANT SELECT ON TABLE public.douyin_budget_estimates TO authenticated;`);
    mutations.push(source.replace(/CREATE UNIQUE INDEX douyin_budget_one_active_version[^;]+;/, (statement) => `/* ${statement} */`));
    expectMutationsRejected(source, mutations, expectOriginalMutationContract);
  });

  test('rejects executable migration-time writes and function invocations', async () => {
    const source = await readMigration();
    const forbiddenStatements = [
      'MERGE INTO public.tenants USING public.tenants ON false WHEN NOT MATCHED THEN DO NOTHING;',
      'COPY public.tenants TO STDOUT;',
      'CALL public.some_procedure();',
      'WITH removed AS (DELETE FROM public.tenants RETURNING id) SELECT id FROM removed;',
      'SELECT public.some_function();',
    ];
    for (const statement of forbiddenStatements) {
      expect(() =>
        expectOriginalMutationContract(`${source}\n${statement}`),
      ).toThrow();
    }
  });

  test('rejects final-chain AI, guard, ACL, RLS and DO-block mutations', async () => {
    const original = await readMigration();
    const repair = await Bun.file(repairMigration).text();
    const originalReplacements = [
      ['      OR NEW.ai_claimed_at IS NULL\n      OR NEW.ai_attempt_count <> OLD.ai_attempt_count + 1\n      OR NEW.ai_analysis', '      OR NEW.ai_claimed_at IS NULL\n      OR NEW.ai_analysis'],
      ['        OR NEW.ai_claimed_at <= OLD.ai_claimed_at\n        OR NEW.ai_attempt_count <> OLD.ai_attempt_count + 1\n        OR NEW.ai_analysis', '        OR NEW.ai_claimed_at <= OLD.ai_claimed_at\n        OR NEW.ai_analysis'],
      ["        OR NEW.ai_attempt_count <> OLD.ai_attempt_count\n      THEN", '      THEN'],
      ["  ELSE\n    RAISE EXCEPTION USING\n      ERRCODE = 'P0001',\n      MESSAGE = 'DOUYIN_BUDGET_ESTIMATE_AI_TRANSITION_INVALID';\n  END IF;\n\n  RETURN NEW;", '  END IF;\n\n  RETURN NEW;'],
      ['GRANT SELECT, INSERT, UPDATE, DELETE\nON TABLE public.douyin_budget_pricing_versions', 'GRANT SELECT\nON TABLE public.douyin_budget_pricing_versions'],
      ['GRANT SELECT, INSERT, UPDATE, DELETE\nON TABLE public.douyin_budget_pricing_items', 'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE\nON TABLE public.douyin_budget_pricing_items'],
      ['REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_item()', 'REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_item_removed()'],
      ['ALTER TABLE public.douyin_budget_estimates FORCE ROW LEVEL SECURITY;', ''],
    ] as const;
    const originalMutations = originalReplacements.map(([before, after]) => original.replace(before, after));
    originalMutations.push(`${original}\nDO $unsafe$ BEGIN PERFORM public.some_function(); DELETE FROM public.tenants; END; $unsafe$;`);
    expectMutationsRejected(original, originalMutations, expectOriginalMutationContract);

    const repairReplacements = [
      ["  IF OLD.status = 'archived' THEN", "  IF OLD.status = 'archived_removed' THEN"],
      ["  IF OLD.status = 'active' AND (", "  IF OLD.status = 'active_removed' AND ("],
      ['REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_version()', 'REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_version_removed()'],
    ] as const;
    const repairMutations = repairReplacements.map(([before, after]) => repair.replace(before, after));
    repairMutations.push(`${repair}\nDO $unsafe$ BEGIN PERFORM public.some_function(); DELETE FROM public.tenants; END; $unsafe$;`);
    expectMutationsRejected(repair, repairMutations, expectRepairContract);
  });

  test('repairs persistent installation ownership and populated-draft cascade', async () => {
    expectRepairContract(await Bun.file(repairMigration).text());
  });

  test('generates the repaired composite installation relationship', async () => {
    expectGeneratedOwnershipContract(await Bun.file(generatedTypes).text());
  });
});
