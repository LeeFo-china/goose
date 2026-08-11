export type TrialSql = InstanceType<typeof Bun.SQL>;
export type SmokeJson = Record<string, unknown>;

export type TrialTenantFixture = {
  tenantId: string;
  employeeId: string;
  roleId: string;
  fileId: string;
};

export type PlatformServiceTrialFixture = {
  runId: string;
  platformAdminId: string;
  operationsActorId: string;
  paymentConfigId: string;
  paymentConfigGuardVersion: number;
  productId: string;
  productVersionId: string;
  productCode: string;
  amountFen: number;
  tenants: Record<
    "lifecycle" | "cooldown" | "duplicateA" | "duplicateB" | "grant"
      | "extend" | "commerce",
    TrialTenantFixture
  >;
};

class FixtureFailure extends Error {}

const TENANT_KEYS = [
  "lifecycle",
  "cooldown",
  "duplicateA",
  "duplicateB",
  "grant",
  "extend",
  "commerce",
] as const;

const CREDIT_CODES: Record<(typeof TENANT_KEYS)[number], string> = {
  lifecycle: "91310100TASK800001",
  cooldown: "91310100TASK800002",
  duplicateA: "91310100TASK8 0003",
  duplicateB: "91310100TASK80 003",
  grant: "91310100TASK800004",
  extend: "91310100TASK800005",
  commerce: "91310100TASK800006",
};

export async function createPlatformServiceTrialFixture(
  database: TrialSql,
): Promise<PlatformServiceTrialFixture> {
  return database.begin(async (db) => {
    const runId = crypto.randomUUID().replaceAll("-", "");
    const admins = await db<Array<{ id: string }>>`
      select employee.id
      from public.employees as employee
      join public.employee_roles as employee_role
        on employee_role.employee_id = employee.id
      join public.roles as role on role.id = employee_role.role_id
      where employee.tenant_id is null and employee.status = 'active'
        and role.tenant_id is null and role.code = 'platform_admin'
        and role.status = 'active'
      order by employee.created_at limit 1;
    `;
    const products = await db<Array<SmokeJson>>`
      select product.id, product.code, product.published_version_id,
        version.amount_fen::int as amount_fen
      from public.platform_service_products as product
      join public.platform_service_product_versions as version
        on version.id = product.published_version_id
      where product.code = 'platform_service_1y' and product.status = 'enabled'
      limit 1;
    `;
    const plans = await db<Array<{ id: string }>>`
      select id from public.tenant_billing_plans order by created_at limit 1;
    `;
    if (!admins[0] || !products[0] || !plans[0]) {
      throw new FixtureFailure("required local seed is missing");
    }

    const operations = await db<Array<{ id: string }>>`
      insert into public.employees (name, status)
      values ('Task8 local operations', 'active') returning id;
    `;
    await db`
      insert into public.employee_roles (employee_id, role_id)
      select ${operations[0]!.id}::uuid, role.id from public.roles as role
      where role.tenant_id is null and role.code = 'platform_operations';
    `;

    const configs = await db<Array<SmokeJson>>`
      insert into public.platform_payment_configs (
        profile_code, provider, principal_type, merchant_mode, merchant_name,
        merchant_id, app_id, enabled_channels, status, validation_status,
        recharge_guard_version
      ) values (
        'tenant_service_provider', 'wechat_pay', 'platform', 'direct_merchant',
        'Task8 local fixture', 'task8-local', 'task8-local',
        array['platform_service'], 'active', 'valid', 1
      ) returning id, recharge_guard_version;
    `;
    if (!configs[0]) throw new FixtureFailure("payment config creation failed");

    const tenants = {} as PlatformServiceTrialFixture["tenants"];
    for (const key of TENANT_KEYS) {
      tenants[key] = await createTenantFixture(db, {
        key,
        runId,
        creditCode: CREDIT_CODES[key],
        planId: plans[0]!.id,
        reviewerId: admins[0]!.id,
      });
    }

    return {
      runId,
      platformAdminId: admins[0]!.id,
      operationsActorId: operations[0]!.id,
      paymentConfigId: String(configs[0].id),
      paymentConfigGuardVersion: Number(configs[0].recharge_guard_version),
      productId: String(products[0].id),
      productVersionId: String(products[0].published_version_id),
      productCode: String(products[0].code),
      amountFen: Number(products[0].amount_fen),
      tenants,
    };
  });
}

async function createTenantFixture(
  db: TrialSql,
  input: {
    key: (typeof TENANT_KEYS)[number];
    runId: string;
    creditCode: string;
    planId: string;
    reviewerId: string;
  },
): Promise<TrialTenantFixture> {
  const tenants = await db<Array<{ id: string }>>`
    insert into public.tenants (
      name, slug, status, unified_social_credit_code
    ) values (
      ${`Task8 ${input.key}`}, ${`task8-${input.key}-${input.runId}`},
      'active', ${input.creditCode}
    ) returning id;
  `;
  const tenantId = tenants[0]!.id;
  const files = await db<Array<{ id: string }>>`
    insert into public.platform_file_objects (
      tenant_id, owner_type, scene, bucket, object_key, mime_type
    ) values (
      ${tenantId}::uuid, 'tenant_onboarding', 'business_license',
      'task8-local', ${`task8/${input.runId}/${input.key}`}, 'image/png'
    ) returning id;
  `;
  await db`
    insert into public.tenant_onboarding_applications (
      application_no, visitor_id, company_name, unified_social_credit_code,
      business_license_file_id, admin_name, admin_phone, address_city,
      address_region_code, address, service_region_codes, source_channel,
      status, converted_tenant_id, reviewed_by_employee_id, reviewed_at,
      privacy_policy_version, onboarding_terms_version, consented_at,
      idempotency_key
    ) values (
      ${`TASK8-${input.key}-${input.runId}`}, ${`task8-${input.runId}`},
      ${`Task8 ${input.key}`}, ${input.creditCode}, ${files[0]!.id}::uuid,
      'Local Admin', '13800000000', 'Shanghai', '310000', 'Local only',
      array['310000'], 'local_services', 'approved', ${tenantId}::uuid,
      ${input.reviewerId}::uuid, clock_timestamp(), 'task8', 'task8',
      clock_timestamp(), ${`task8-${input.key}-${input.runId}`}
    );
  `;
  const roles = await db<Array<{ id: string }>>`
    insert into public.roles (tenant_id, code, name, status)
    values (${tenantId}::uuid, 'system_admin', 'Task8 admin', 'active')
    returning id;
  `;
  const employees = await db<Array<{ id: string }>>`
    insert into public.employees (tenant_id, name, status)
    values (${tenantId}::uuid, 'Task8 local employee', 'active') returning id;
  `;
  await db`
    insert into public.employee_roles (employee_id, role_id)
    values (${employees[0]!.id}::uuid, ${roles[0]!.id}::uuid);
  `;
  await db`
    insert into public.role_permissions (role_id, permission_id, access_scope)
    select ${roles[0]!.id}::uuid, permission.id, 'all'
    from public.permissions as permission
    where permission.code in (
      'billing.service_trial.apply', 'billing.service_trial.read'
    );
  `;
  await db`
    insert into public.tenant_billing_subscriptions (
      tenant_id, plan_id, status, current_period_start, current_period_end,
      next_charge_at, locked_at, lock_reason
    ) values (
      ${tenantId}::uuid, ${input.planId}::uuid, 'locked', current_date,
      current_date + 1, clock_timestamp(), clock_timestamp(), 'Task8 local'
    );
  `;
  return {
    tenantId,
    employeeId: employees[0]!.id,
    roleId: roles[0]!.id,
    fileId: files[0]!.id,
  };
}

export async function cleanupPlatformServiceTrialFixture(
  db: TrialSql,
  fixture: PlatformServiceTrialFixture,
): Promise<boolean> {
  const tenantIds = Object.values(fixture.tenants).map((tenant) => tenant.tenantId);
  const roleIds = Object.values(fixture.tenants).map((tenant) => tenant.roleId);
  const fileIds = Object.values(fixture.tenants).map((tenant) => tenant.fileId);
  const tenantArray = `{${tenantIds.join(",")}}`;
  const roleArray = `{${roleIds.join(",")}}`;
  const fileArray = `{${fileIds.join(",")}}`;
  await db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`delete from public.tenant_service_trial_events where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_trial_commands where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_work_order_events where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_acceptance_preparations where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_contract_periods where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_contracts where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_refund_requests where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_work_orders where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_orders where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_service_trials where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_billing_subscriptions where tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.tenant_onboarding_applications where converted_tenant_id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.employee_permission_overrides where employee_id in (
      select id from public.employees where tenant_id = any(${tenantArray}::uuid[])
    ) or employee_id = ${fixture.operationsActorId}::uuid`;
    await tx`delete from public.employee_roles where role_id = any(${roleArray}::uuid[])
      or employee_id = ${fixture.operationsActorId}::uuid`;
    await tx`delete from public.role_permissions where role_id = any(${roleArray}::uuid[])`;
    await tx`delete from public.employees where tenant_id = any(${tenantArray}::uuid[])
      or id = ${fixture.operationsActorId}::uuid`;
    await tx`delete from public.roles where id = any(${roleArray}::uuid[])`;
    await tx`delete from public.platform_file_objects where id = any(${fileArray}::uuid[])`;
    await tx`delete from public.tenants where id = any(${tenantArray}::uuid[])`;
    await tx`delete from public.platform_payment_configs where id = ${fixture.paymentConfigId}::uuid`;
  });
  const residual = await db<Array<{ count: number }>>`
    select (
      (select count(*) from public.tenants where id = any(${tenantArray}::uuid[]))
      + (select count(*) from public.platform_file_objects where id = any(${fileArray}::uuid[]))
      + (select count(*) from public.platform_payment_configs
          where id = ${fixture.paymentConfigId}::uuid)
      + (select count(*) from public.employees
          where id = ${fixture.operationsActorId}::uuid)
      + (select count(*) from public.tenant_service_trials
          where tenant_id = any(${tenantArray}::uuid[]))
      + (select count(*) from public.tenant_service_orders
          where tenant_id = any(${tenantArray}::uuid[]))
    )::int as count;
  `;
  return residual[0]?.count === 0;
}
