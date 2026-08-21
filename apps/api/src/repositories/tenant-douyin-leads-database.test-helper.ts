import { randomUUID } from "node:crypto";

export const TENANT_LEAD_DATABASE_SCENARIOS = [
  "function_acl_catalog",
  "latest_of_twenty_one",
  "detail_page_twenty_of_twenty_one",
  "keyword_bitmap_or_indexes",
  "assignee_scope_conflict_zero_writes",
  "preflight_conflict_zero_writes",
  "existing_customer_conversion_shape",
  "unassigned_customer_owner",
  "stale_create_preflight_rejected",
  "repeated_conversion_conflict_zero_writes",
  "latest_index_plan",
  "fixture_cleanup",
] as const;

type Scenario = (typeof TENANT_LEAD_DATABASE_SCENARIOS)[number];
type Summary = Record<Scenario, boolean>;
type DatabaseSql = InstanceType<typeof Bun.SQL>;
type JsonRecord = Record<string, unknown>;
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function parseLocalTenantLeadDatabaseUrl(input: string | undefined):
  | { ok: true; databaseUrl: string }
  | { ok: false } {
  const databaseUrl = input?.trim() || DEFAULT_DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["127.0.0.1", "localhost"].includes(url.hostname)
      || url.port !== "54322" || url.pathname !== "/postgres"
      || url.username !== "postgres" || url.password !== "postgres"
      || url.search !== "" || url.hash !== "") return { ok: false };
    return { ok: true, databaseUrl };
  } catch {
    return { ok: false };
  }
}

export async function runTenantLeadDatabaseIntegration(databaseUrl?: string) {
  const parsed = parseLocalTenantLeadDatabaseUrl(databaseUrl);
  if (!parsed.ok) throw new Error("LOCAL_DATABASE_REQUIRED");
  const admin = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const service = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const contender = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const ids = fixtureIds();
  const summary = Object.fromEntries(TENANT_LEAD_DATABASE_SCENARIOS
    .map((scenario) => [scenario, false])) as Summary;
  let failure: unknown;
  try {
    await createFixture(admin, ids);
    await service`set role service_role`;
    await service`set statement_timeout = '5s'`;
    await contender`set role service_role`;
    await contender`set statement_timeout = '5s'`;
    await runScenarios(admin, service, contender, ids, summary);
  } catch (error) {
    failure = error;
  } finally {
    await contender.close().catch(() => undefined);
    await service.close().catch(() => undefined);
    try {
      summary.fixture_cleanup = await cleanupFixture(admin, ids);
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
    await admin.close().catch(() => undefined);
  }
  if (failure) throw new Error(stableFailure(failure));
  return summary;
}

type FixtureIds = ReturnType<typeof fixtureIds>;
function fixtureIds() {
  const suffix = randomUUID().replaceAll("-", "");
  return {
    tenant: randomUUID(), employee: randomUUID(), targetEmployee: randomUUID(),
    departmentOne: randomUUID(), departmentTwo: randomUUID(),
    installation: randomUUID(), lead: randomUUID(), secondLead: randomUUID(),
    assignLead: randomUUID(), customer: randomUUID(),
    component: `lead-test-${suffix}`, authorizer: `lead-test-auth-${suffix}`,
    phone: `139${String(Date.now()).slice(-8)}`,
    secondPhone: `137${String(Date.now() + 1).slice(-8)}`,
    assignPhone: `135${String(Date.now() + 2).slice(-8)}`,
  };
}

async function createFixture(sql: DatabaseSql, ids: FixtureIds) {
  await sql`insert into public.tenants (id,name,slug,status) values
    (${ids.tenant}::uuid,'线索集成测试',${`lead-test-${ids.tenant}`} ,'active')`;
  await sql`insert into public.tenant_departments
      (id,tenant_id,template_id,code,alias_name,enabled,sort)
    select fixture.id,${ids.tenant}::uuid,template.id,fixture.code,
      fixture.alias_name,true,fixture.sort
    from (values
      (${ids.departmentOne}::uuid,'LEAD_SCOPE_ONE','线索范围一',1),
      (${ids.departmentTwo}::uuid,'LEAD_SCOPE_TWO','线索范围二',2)
    ) as fixture(id,code,alias_name,sort)
    join lateral (
      select department_template.id
      from public.department_templates as department_template
      order by department_template.code
      offset fixture.sort-1 limit 1
    ) as template on true`;
  await sql`insert into public.employees (id,name,status,tenant_id)
    values (${ids.employee}::uuid,'线索测试员工','active',${ids.tenant}::uuid)`;
  await sql`insert into public.employees
      (id,name,status,tenant_id,tenant_department_id)
    values (${ids.targetEmployee}::uuid,'线索目标员工','active',
      ${ids.tenant}::uuid,${ids.departmentOne}::uuid)`;
  await sql`insert into public.douyin_third_party_components
    (component_appid,status) values (${ids.component},'active')`;
  await sql`insert into public.douyin_miniapp_installations
    (id,tenant_id,component_appid,authorizer_appid,installation_kind,
      authorization_status)
    values (${ids.installation}::uuid,${ids.tenant}::uuid,${ids.component},
      ${ids.authorizer},'merchant','disabled')`;
  await sql`insert into public.marketing_leads
    (id,name,phone,community,form_data,source,tenant_id,
      douyin_miniapp_installation_id,version)
    values
    (${ids.lead}::uuid,'李女士',${ids.phone},'晴天花园','{}'::jsonb,
      'douyin_miniapp',${ids.tenant}::uuid,${ids.installation}::uuid,1),
    (${ids.secondLead}::uuid,'王女士',${ids.secondPhone},'云栖花园','{}'::jsonb,
      'douyin_miniapp',${ids.tenant}::uuid,${ids.installation}::uuid,1),
    (${ids.assignLead}::uuid,'待分配客户',${ids.assignPhone},'星河湾','{}'::jsonb,
      'douyin_miniapp',${ids.tenant}::uuid,${ids.installation}::uuid,1)`;
  await sql`insert into public.marketing_leads
      (name,phone,community,form_data,source,tenant_id,
        douyin_miniapp_installation_id,version,created_at)
    select case when generated.number=4998 then '索引13888客户'
        else '普通客户-'||generated.number end,
      case when generated.number=4999 then '13888000001'
        else '136'||lpad(generated.number::text,8,'0') end,
      case when generated.number=5000 then '园区13888'
        else '普通小区-'||(generated.number%100) end,
      '{}'::jsonb,'douyin_miniapp',${ids.tenant}::uuid,
      ${ids.installation}::uuid,1,
      clock_timestamp()-make_interval(secs=>generated.number)
    from generate_series(1,5000) as generated(number)`;
  await sql`insert into public.customers
    (id,tenant_id,name,phone,status,source,owner_id)
    values (${ids.customer}::uuid,${ids.tenant}::uuid,'李女士',${ids.phone},
      'potential','douyin',${ids.employee}::uuid)`;
  await sql`with generated as (select g from generate_series(1,21) as g)
    insert into public.sms_verification_codes
      (id,phone,scene,code,status,expired_at,verified_at)
    select gen_random_uuid(),${ids.phone},'douyin_lead','123456','verified',
      now()+interval '1 hour',now() from generated`;
  await sql`with sms as (
      select id,row_number() over(order by id) as n
      from public.sms_verification_codes
      where phone=${ids.phone} and scene='douyin_lead'
      order by id limit 21
    )
    insert into public.douyin_measurement_appointments (
      appointment_no,tenant_id,douyin_miniapp_installation_id,
      marketing_lead_id,sms_verification_code_id,preferred_visit_date,
      preferred_visit_period,community,status,create_idempotency_key,
      create_request_hash,source_snapshot,updated_existing,
      existing_customer_linked_at_submit,recent_pending_appointment_exists,
      created_at,updated_at
    )
    select 'DYLF-20991231-'||lpad((900000+n)::text,6,'0'),
      ${ids.tenant}::uuid,${ids.installation}::uuid,${ids.lead}::uuid,id,
      date '2099-12-31','morning','晴天花园','pending_confirmation',
      gen_random_uuid(),extensions.digest(convert_to(n::text,'UTF8'),'sha256'),
      jsonb_build_object('privacy_policy_version','2026-08-01',
        'consented_at','2026-08-21T00:00:00Z','attribution',
        jsonb_build_object('source_type','direct','entry_path',
          'pages/lead/index','scene','1001'),
        'demand',null,'budget_estimate',null),false,false,false,
      timestamptz '2026-08-21 00:00:00+00'+n*interval '1 second',
      timestamptz '2026-08-21 00:00:00+00'+n*interval '1 second'
    from sms`;
}

async function runScenarios(admin: DatabaseSql, service: DatabaseSql,
  contender: DatabaseSql, ids: FixtureIds, summary: Summary) {
  const acl = (await admin<Array<Record<string, boolean>>>`select
    has_function_privilege('service_role',
      'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid)',
      'EXECUTE') as old_assign,
    coalesce(has_function_privilege('service_role',to_regprocedure(
      'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)'),
      'EXECUTE'),false) as new_assign,
    coalesce(has_function_privilege('anon',to_regprocedure(
      'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)'),
      'EXECUTE'),false) as anon_assign,
    coalesce(has_function_privilege('authenticated',to_regprocedure(
      'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)'),
      'EXECUTE'),false) as authenticated_assign,
    has_function_privilege('service_role',
      'public.convert_douyin_lead_to_customer(uuid,uuid,uuid,integer,uuid)',
      'EXECUTE') as old_convert,
    has_function_privilege('service_role',
      'public.convert_douyin_lead_to_customer(uuid,uuid,uuid,integer,uuid,uuid,boolean)',
      'EXECUTE') as new_convert,
    has_function_privilege('service_role',
      'public.list_tenant_douyin_lead_latest_appointments(uuid,uuid[])',
      'EXECUTE') as latest,
    has_function_privilege('authenticated',
      'public.list_tenant_douyin_lead_latest_appointments(uuid,uuid[])',
      'EXECUTE') as authenticated_latest`)[0];
  summary.function_acl_catalog = acl?.old_assign === false
    && acl.new_assign === true && acl.anon_assign === false
    && acl.authenticated_assign === false && acl.old_convert === false
    && acl.new_convert === true && acl.latest === true
    && acl.authenticated_latest === false;

  const latest = await service<Array<Record<string, unknown>>>`
    select * from public.list_tenant_douyin_lead_latest_appointments(
      ${ids.tenant}::uuid,array[${ids.lead}::uuid])`;
  summary.latest_of_twenty_one = latest.length === 1
    && latest[0]?.tenant_id === ids.tenant
    && latest[0]?.marketing_lead_id === ids.lead
    && !("source_snapshot" in (latest[0] ?? {}));

  const detail = await admin<Array<Record<string, unknown>>>`select
      appointment.*,count(*) over()::integer as exact_total
    from public.douyin_measurement_appointments as appointment
    where appointment.tenant_id=${ids.tenant}::uuid
      and appointment.marketing_lead_id=${ids.lead}::uuid
    order by appointment.created_at desc,appointment.id desc limit 20`;
  const fixtureSnapshotValid = (await admin<Array<{ valid: boolean }>>`select
      bool_and(public.is_valid_douyin_measurement_attribution_snapshot(
        appointment.source_snapshot->'attribution') is true) as valid
    from public.douyin_measurement_appointments as appointment
    where appointment.tenant_id=${ids.tenant}::uuid
      and appointment.marketing_lead_id=${ids.lead}::uuid`)[0]?.valid === true;
  summary.detail_page_twenty_of_twenty_one = detail.length === 20
    && detail[0]?.exact_total === 21 && 21 > detail.length
    && "source_snapshot" in (detail[0] ?? {}) && fixtureSnapshotValid;
  if (!fixtureSnapshotValid) {
    throw new Error("DOUYIN_LEAD_FIXTURE_SOURCE_SNAPSHOT_INVALID");
  }

  await admin`select
    gin_clean_pending_list('public.marketing_leads_douyin_name_trgm_idx'::regclass),
    gin_clean_pending_list('public.marketing_leads_douyin_phone_trgm_idx'::regclass),
    gin_clean_pending_list('public.marketing_leads_douyin_community_trgm_idx'::regclass)`;
  await admin`analyze public.marketing_leads`;
  const keywordCount = (await admin<Array<{ count: number }>>`select
      count(*)::integer as count from public.marketing_leads
    where tenant_id=${ids.tenant}::uuid and source='douyin_miniapp'
      and (name ilike '%13888%' or phone ilike '%13888%'
        or community ilike '%13888%')`)[0]?.count;
  const keywordPlan = await admin<Array<Record<string, unknown>>>`
    explain (analyze,costs off,buffers,format json)
    select count(*) from public.marketing_leads
    where tenant_id=${ids.tenant}::uuid and source='douyin_miniapp'
      and (name ilike '%13888%' or phone ilike '%13888%'
        or community ilike '%13888%')`;
  const keywordPlanText = JSON.stringify(keywordPlan);
  summary.keyword_bitmap_or_indexes = keywordCount === 3
    && keywordPlanText.includes("BitmapOr")
    && keywordPlanText.includes("marketing_leads_douyin_name_trgm_idx")
    && keywordPlanText.includes("marketing_leads_douyin_phone_trgm_idx")
    && keywordPlanText.includes("marketing_leads_douyin_community_trgm_idx");

  const expectedDepartment = (await admin<Array<{ tenant_department_id: string | null }>>`
    select tenant_department_id from public.employees
    where tenant_id=${ids.tenant}::uuid and id=${ids.targetEmployee}::uuid`)[0];
  await admin`update public.employees set tenant_department_id=${ids.departmentTwo}::uuid
    where tenant_id=${ids.tenant}::uuid and id=${ids.targetEmployee}::uuid`;
  const assignmentKey = randomUUID();
  const beforeAssignment = (await admin<Array<Record<string, unknown>>>`select
      lead.assigned_employee_id,lead.version,
      (select count(*)::integer from public.douyin_lead_workflow_operations
        where tenant_id=${ids.tenant}::uuid) as operation_count
    from public.marketing_leads as lead
    where lead.tenant_id=${ids.tenant}::uuid and lead.id=${ids.assignLead}::uuid`)[0];
  const staleAssignment = commandData(await service`
    select public.assign_douyin_lead(
      ${ids.tenant}::uuid,${ids.assignLead}::uuid,${ids.employee}::uuid,
      ${ids.targetEmployee}::uuid,1,${assignmentKey}::uuid,
      ${ids.departmentOne}::uuid) as result`);
  const afterAssignment = (await admin<Array<Record<string, unknown>>>`select
      lead.assigned_employee_id,lead.version,
      (select count(*)::integer from public.douyin_lead_workflow_operations
        where tenant_id=${ids.tenant}::uuid) as operation_count
    from public.marketing_leads as lead
    where lead.tenant_id=${ids.tenant}::uuid and lead.id=${ids.assignLead}::uuid`)[0];
  await admin`update public.employees set tenant_department_id=${ids.departmentOne}::uuid
    where tenant_id=${ids.tenant}::uuid and id=${ids.targetEmployee}::uuid`;
  const correctedAssignment = commandData(await service`
    select public.assign_douyin_lead(
      ${ids.tenant}::uuid,${ids.assignLead}::uuid,${ids.employee}::uuid,
      ${ids.targetEmployee}::uuid,1,${assignmentKey}::uuid,
      ${ids.departmentOne}::uuid) as result`);
  const replayedAssignment = commandData(await service`
    select public.assign_douyin_lead(
      ${ids.tenant}::uuid,${ids.assignLead}::uuid,${ids.employee}::uuid,
      ${ids.targetEmployee}::uuid,1,${assignmentKey}::uuid,
      ${ids.departmentOne}::uuid) as result`);
  summary.assignee_scope_conflict_zero_writes = expectedDepartment
    ?.tenant_department_id === ids.departmentOne
    && staleAssignment.error?.status_code === 409
    && staleAssignment.error.code === "DOUYIN_LEAD_ASSIGNEE_SCOPE_CONFLICT"
    && beforeAssignment?.assigned_employee_id === null
    && afterAssignment?.assigned_employee_id === null
    && beforeAssignment?.version === afterAssignment?.version
    && beforeAssignment?.operation_count === afterAssignment?.operation_count
    && correctedAssignment.data?.assigned_employee_id === ids.targetEmployee
    && correctedAssignment.data?.idempotent === false
    && replayedAssignment.data?.assigned_employee_id === ids.targetEmployee
    && replayedAssignment.data?.idempotent === true;

  const beforeConversionConflict = await operationCount(admin, ids.tenant);
  const conflict = commandData(await service`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.lead}::uuid,${ids.employee}::uuid,1,
      ${randomUUID()}::uuid,${randomUUID()}::uuid,false) as result`);
  const unchanged = (await admin<Array<Record<string, unknown>>>`select
      lead.lead_status,lead.customer_id,
      (select count(*)::integer from public.douyin_lead_workflow_operations
        where tenant_id=${ids.tenant}::uuid) as operation_count,
      (select count(*)::integer from public.douyin_measurement_appointments
        where tenant_id=${ids.tenant}::uuid and customer_id is not null)
        as linked_count
    from public.marketing_leads as lead where lead.id=${ids.lead}::uuid`)[0];
  summary.preflight_conflict_zero_writes = conflict.error?.code
    === "DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT"
    && unchanged?.lead_status === "new" && unchanged.customer_id === null
    && unchanged.operation_count === beforeConversionConflict
    && unchanged.linked_count === 0;

  const converted = commandData(await service`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.lead}::uuid,${ids.employee}::uuid,1,
      ${randomUUID()}::uuid,${ids.customer}::uuid,false) as result`);
  const convertedSources = (await admin<Array<{
    count: number;
    valid: boolean;
  }>>`select
      count(*)::integer as count,
      bool_and(public.is_valid_douyin_measurement_source_metadata(
        source.metadata) is true) as valid
    from public.customer_sources as source
    where source.tenant_id=${ids.tenant}::uuid
      and source.customer_id=${ids.customer}::uuid
      and source.marketing_lead_id=${ids.lead}::uuid`)[0];
  summary.existing_customer_conversion_shape = converted.data?.customer_id
    === ids.customer && converted.data.appointments_updated === 21
    && converted.data.created_customer === false
    && convertedSources?.count === 21 && convertedSources.valid === true;

  const preflight = (await contender<Array<{ customer_id: string | null }>>`select
      customer.id as customer_id
    from public.marketing_leads as lead
    left join public.customers as customer
      on customer.tenant_id=lead.tenant_id and customer.phone=lead.phone
    where lead.tenant_id=${ids.tenant}::uuid
      and lead.id=${ids.secondLead}::uuid`)[0];
  const winnerKey = randomUUID();
  const created = commandData(await service`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.secondLead}::uuid,${ids.employee}::uuid,1,
      ${winnerKey}::uuid,null::uuid,true) as result`);
  const owner = (await admin<Array<{ owner_id: string }>>`select owner_id
    from public.customers where id=${String(created.data?.customer_id)}::uuid`)[0];
  summary.unassigned_customer_owner = created.data?.created_customer === true
    && created.data.appointments_updated === 0 && owner?.owner_id === ids.employee;

  const staleKey = randomUUID();
  const beforeStale = await operationCount(admin, ids.tenant);
  const stale = commandData(await contender`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.secondLead}::uuid,${ids.employee}::uuid,1,
      ${staleKey}::uuid,null::uuid,true) as result`);
  const afterStale = await operationCount(admin, ids.tenant);
  const corrected = commandData(await contender`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.secondLead}::uuid,${ids.employee}::uuid,1,
      ${staleKey}::uuid,${String(created.data?.customer_id)}::uuid,false) as result`);
  const afterCorrected = await operationCount(admin, ids.tenant);
  const replayed = commandData(await contender`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.secondLead}::uuid,${ids.employee}::uuid,1,
      ${staleKey}::uuid,${String(created.data?.customer_id)}::uuid,false) as result`);
  const afterReplay = await operationCount(admin, ids.tenant);
  summary.stale_create_preflight_rejected = preflight?.customer_id === null
    && stale.error?.code === "DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT"
    && stale.error.status_code === 409
    && beforeStale === afterStale
    && corrected.data?.customer_id === created.data?.customer_id
    && corrected.data?.repeated_conversion === true
    && corrected.data?.appointments_updated === 0
    && corrected.data?.idempotent === false
    && afterCorrected === beforeStale + 1
    && replayed.data?.customer_id === created.data?.customer_id
    && replayed.data?.repeated_conversion === true
    && replayed.data?.idempotent === true
    && afterReplay === afterCorrected;

  await admin`alter table public.douyin_measurement_appointments disable trigger
    douyin_measurement_appointment_guard`;
  try {
    await admin`update public.douyin_measurement_appointments set
      customer_id=${String(created.data?.customer_id)}::uuid
      where id=(select id from public.douyin_measurement_appointments
        where tenant_id=${ids.tenant}::uuid and marketing_lead_id=${ids.lead}::uuid
        order by id limit 1)`;
  } finally {
    await admin`alter table public.douyin_measurement_appointments enable trigger
      douyin_measurement_appointment_guard`;
  }
  const beforeReplay = (await admin<Array<{ count: number }>>`select count(*)::integer
    from public.douyin_lead_workflow_operations where tenant_id=${ids.tenant}::uuid`)[0]?.count;
  const replayConflict = commandData(await service`
    select public.convert_douyin_lead_to_customer(
      ${ids.tenant}::uuid,${ids.lead}::uuid,${ids.employee}::uuid,1,
      ${randomUUID()}::uuid,${ids.customer}::uuid,false) as result`);
  const afterCorruptReplay = (await admin<Array<{ count: number }>>`select count(*)::integer
    from public.douyin_lead_workflow_operations where tenant_id=${ids.tenant}::uuid`)[0]?.count;
  summary.repeated_conversion_conflict_zero_writes = replayConflict.error?.code
    === "DOUYIN_LEAD_APPOINTMENT_CUSTOMER_CONFLICT"
    && beforeReplay === afterCorruptReplay;

  await admin`set enable_seqscan=off`;
  const explain = await admin<Array<Record<string, unknown>>>`
    explain (analyze,costs off,buffers,format json)
    select appointment.id from public.douyin_measurement_appointments appointment
    where appointment.marketing_lead_id=${ids.lead}::uuid
      and appointment.tenant_id=${ids.tenant}::uuid
    order by appointment.created_at desc,appointment.id desc limit 1`;
  summary.latest_index_plan = JSON.stringify(explain)
    .includes("douyin_measurement_appointments_lead_created_idx");
}

function commandData(rows: Array<Record<string, unknown>>) {
  const result = rows[0]?.result as JsonRecord | undefined;
  return {
    data: result?.data as JsonRecord | undefined,
    error: result?.error as JsonRecord | undefined,
  };
}

async function operationCount(sql: DatabaseSql, tenantId: string) {
  return (await sql<Array<{ count: number }>>`select count(*)::integer as count
    from public.douyin_lead_workflow_operations
    where tenant_id=${tenantId}::uuid`)[0]?.count ?? -1;
}

async function cleanupFixture(sql: DatabaseSql, ids: FixtureIds) {
  await setFixtureGuards(sql, "disable");
  try {
    await sql`delete from public.customer_sources where tenant_id=${ids.tenant}::uuid`;
    await sql`delete from public.douyin_lead_workflow_operations
      where tenant_id=${ids.tenant}::uuid`;
    await sql`delete from public.douyin_measurement_appointments
      where tenant_id=${ids.tenant}::uuid`;
    await sql`delete from public.sms_verification_codes
      where phone in (${ids.phone},${ids.secondPhone},${ids.assignPhone})
        and scene='douyin_lead'`;
    await sql`delete from public.marketing_leads where tenant_id=${ids.tenant}::uuid`;
    await sql`delete from public.customers where tenant_id=${ids.tenant}::uuid`;
    await sql`delete from public.douyin_miniapp_installations
      where id=${ids.installation}::uuid`;
    await sql`delete from public.douyin_third_party_components
      where component_appid=${ids.component}`;
    await sql`delete from public.employees
      where id in (${ids.employee}::uuid,${ids.targetEmployee}::uuid)`;
    await sql`delete from public.tenant_departments
      where id in (${ids.departmentOne}::uuid,${ids.departmentTwo}::uuid)`;
    await sql`delete from public.tenants where id=${ids.tenant}::uuid`;
  } finally {
    await setFixtureGuards(sql, "enable");
  }
  const remaining = await sql<Array<{ count: number }>>`select count(*)::integer
    from public.tenants where id=${ids.tenant}::uuid`;
  return remaining[0]?.count === 0;
}

async function setFixtureGuards(sql: DatabaseSql, state: "enable" | "disable") {
  if (state === "disable") {
    await sql`alter table public.customer_sources disable trigger
      douyin_measurement_customer_source_guard`;
    await sql`alter table public.douyin_lead_workflow_operations disable trigger
      douyin_lead_workflow_operation_immutable`;
    await sql`alter table public.douyin_measurement_appointments disable trigger
      douyin_measurement_appointment_guard`;
    return;
  }
  await sql`alter table public.customer_sources enable trigger
    douyin_measurement_customer_source_guard`;
  await sql`alter table public.douyin_lead_workflow_operations enable trigger
    douyin_lead_workflow_operation_immutable`;
  await sql`alter table public.douyin_measurement_appointments enable trigger
    douyin_measurement_appointment_guard`;
}

function stableFailure(error: unknown): string {
  if (error instanceof Error) return `TENANT_LEAD_DB_INTEGRATION_FAILED:${error.message}`;
  return "TENANT_LEAD_DB_INTEGRATION_FAILED";
}
