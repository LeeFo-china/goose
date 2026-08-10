import type { TenantBillingSubscriptionStatus } from "../repositories/billing-subscriptions";
import type { TenantServiceAccessFacts } from "../repositories/tenant-service-access";

export type SmokeJson = Record<string, unknown>;
export type SmokeFixture = {
  tenantId: string;
  employeeId: string;
  platformOperatorId: string;
  productId: string;
  productVersionId: string;
  productCode: string;
  amountFen: number;
  paymentConfigId: string;
  paymentConfigGuardVersion: number;
  createdPaymentConfig: boolean;
};
export type SmokeOrder = {
  id: string;
  outTradeNo: string;
  transactionId: string;
  workOrderId: string;
};

type SqlClient = InstanceType<typeof Bun.SQL>;
class FixtureFailure extends Error {}

export async function createAccessSmokeFixture(
  database: SqlClient,
): Promise<SmokeFixture> {
  return database.begin(async (db) => {
  const runId = crypto.randomUUID().replaceAll("-", "");
  const operators = await db<Array<{ id: string }>>`
    select employee.id from public.employees as employee
    where employee.tenant_id is null and employee.status = 'active'
      and exists (
        select 1 from public.employee_roles as employee_role
        join public.roles as role on role.id = employee_role.role_id
        where employee_role.employee_id = employee.id
          and role.tenant_id is null and role.status = 'active'
      ) order by employee.created_at limit 1;
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
  requireRows(operators, products, plans);

  const insertedConfigs = await db<Array<SmokeJson>>`
    insert into public.platform_payment_configs (
      profile_code, provider, principal_type, merchant_mode, merchant_name,
      merchant_id, app_id, enabled_channels, status, validation_status,
      recharge_guard_version
    ) values (
      'tenant_service_provider', 'wechat_pay', 'platform', 'direct_merchant',
      'Task7 local fixture', 'task7-local', 'task7-local',
      array['platform_service'], 'active', 'valid', 1
    ) on conflict (provider, profile_code) do nothing
    returning id, recharge_guard_version;
  `;
  const configs = insertedConfigs.length > 0 ? insertedConfigs : await db<Array<SmokeJson>>`
    select id, recharge_guard_version from public.platform_payment_configs
    where provider = 'wechat_pay' and profile_code = 'tenant_service_provider'
    limit 1;
  `;
  requireRows(configs);
  const tenants = await db<Array<{ id: string }>>`
    insert into public.tenants (name, slug, status)
    values ('Task7 local fixture', ${`task7-${runId}`}, 'active') returning id;
  `;
  const employees = await db<Array<{ id: string }>>`
    insert into public.employees (tenant_id, name, status)
    values (${tenants[0]!.id}::uuid, 'Task7 local fixture', 'active') returning id;
  `;
  await db`
    insert into public.tenant_billing_subscriptions (
      tenant_id, plan_id, status, current_period_start, current_period_end,
      next_charge_at, locked_at, lock_reason
    ) values (
      ${tenants[0]!.id}::uuid, ${plans[0]!.id}::uuid, 'locked', current_date,
      current_date + 1, now(), now(), 'Task7 local fixture'
    );
  `;
  return {
    tenantId: tenants[0]!.id,
    employeeId: employees[0]!.id,
    platformOperatorId: operators[0]!.id,
    productId: String(products[0]!.id),
    productVersionId: String(products[0]!.published_version_id),
    productCode: String(products[0]!.code),
    amountFen: Number(products[0]!.amount_fen),
    paymentConfigId: String(configs[0]!.id),
    paymentConfigGuardVersion: Number(configs[0]!.recharge_guard_version),
    createdPaymentConfig: insertedConfigs.length > 0,
  };
  });
}

export async function createPaidSmokeOrder(
  db: SqlClient,
  fixture: SmokeFixture,
  sequence: number,
): Promise<SmokeOrder> {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const outTradeNo = `task7-trade-${suffix}`;
  const transactionId = `task7-tx-${suffix}`;
  const rows = await db<Array<{ id: string }>>`
    insert into public.tenant_service_orders (
      tenant_id, product_id, product_version_id, order_no, out_trade_no,
      product_code, pricing_version, product_snapshot, term_years, amount_fen,
      payment_config_id, payment_config_guard_version, payer_openid,
      payment_expires_at, terms_version, terms_accepted_at, created_by_employee_id
    ) values (
      ${fixture.tenantId}::uuid, ${fixture.productId}::uuid,
      ${fixture.productVersionId}::uuid, ${`TASK7-${sequence}-${suffix}`},
      ${outTradeNo}, ${fixture.productCode}, 1, '{}'::jsonb, 1,
      ${fixture.amountFen}::bigint, ${fixture.paymentConfigId}::uuid,
      ${fixture.paymentConfigGuardVersion}, ${`task7-openid-${suffix}`},
      now() + interval '15 minutes', 1, now(), ${fixture.employeeId}::uuid
    ) returning id;
  `;
  const orderId = rows[0]!.id;
  const payment = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_confirm_payment(
      ${orderId}::uuid, ${transactionId}, ${fixture.amountFen}::bigint,
      clock_timestamp(), ${crypto.randomUUID()}::uuid, '{}'::jsonb
    ) as result;
  `;
  if (payment[0]?.result.access_mode !== "paid_onboarding") {
    throw new FixtureFailure("payment did not produce paid onboarding");
  }
  const workOrders = await db<Array<{ id: string }>>`
    select id from public.tenant_service_work_orders
    where service_order_id = ${orderId}::uuid;
  `;
  return { id: orderId, outTradeNo, transactionId, workOrderId: workOrders[0]!.id };
}

export async function prepareSmokeAcceptance(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
): Promise<number> {
  await db`
    update public.tenant_service_orders set service_status = 'awaiting_acceptance',
      version = version + 1 where id = ${order.id}::uuid;
  `;
  await db`
    update public.tenant_service_work_orders set status = 'awaiting_acceptance',
      version = version + 1 where id = ${order.workOrderId}::uuid;
  `;
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_upsert_acceptance_preparation(
      ${order.workOrderId}::uuid, 'submitted', 'Task7 local acceptance',
      ${fixture.employeeId}::uuid, now() + interval '7 days'
    ) as result;
  `;
  if (rows[0]?.result.error_code !== null) {
    throw new FixtureFailure("acceptance preparation failed");
  }
  return Number((rows[0]!.result.work_order as SmokeJson).version);
}

export async function decideSmokeAcceptance(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
  expectedVersion: number,
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.tenant_service_decide_acceptance(
      ${fixture.tenantId}::uuid, ${order.id}::uuid, 'accepted',
      ${expectedVersion}, ${fixture.employeeId}::uuid, 'Task7 local acceptance',
      '{}'::jsonb
    ) as result;
  `;
  return rows[0]!.result;
}

export async function verifyPaidOnboarding(
  db: SqlClient,
  tenantId: string,
): Promise<boolean> {
  const rows = await db<Array<{ count: number }>>`
    select count(*)::int as count from public.tenant_service_orders
    where tenant_id = ${tenantId}::uuid
      and payment_status in ('paid','refund_reviewing','refunding','partially_refunded')
      and service_status not in ('accepted','active')
      and paid_at is not null and service_access_terminated_at is null;
  `;
  return rows[0]?.count === 2;
}

export async function verifyRenewalExtension(
  db: SqlClient,
  tenantId: string,
): Promise<boolean> {
  const rows = await db<Array<SmokeJson>>`
    select starts_at, ends_at from public.tenant_service_contract_periods
    where tenant_id = ${tenantId}::uuid and status <> 'voided'
    order by starts_at, accepted_at;
  `;
  if (rows.length !== 2) return false;
  return instant(rows[0]!.ends_at) === instant(rows[1]!.starts_at)
    && instant(rows[0]!.ends_at) > instant(rows[0]!.starts_at)
    && instant(rows[1]!.ends_at) > instant(rows[1]!.starts_at);
}

export async function createApprovedSmokeRefund(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
): Promise<string> {
  await db`
    update public.tenant_service_orders set payment_status = 'refund_reviewing'
    where id = ${order.id}::uuid;
  `;
  const rows = await db<Array<{ id: string }>>`
    insert into public.tenant_service_refund_requests (
      tenant_id, service_order_id, idempotency_key, reason, status,
      created_by_employee_id, reviewed_by_employee_id, reviewed_at
    ) values (
      ${fixture.tenantId}::uuid, ${order.id}::uuid, ${crypto.randomUUID()}::uuid,
      'Task7 local refund', 'approved', ${fixture.employeeId}::uuid,
      ${fixture.platformOperatorId}::uuid, now()
    ) returning id;
  `;
  return rows[0]!.id;
}

export async function refundSmokeOrder(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
  label: string,
): Promise<string> {
  const requestId = await createApprovedSmokeRefund(db, fixture, order);
  const result = await confirmSmokeRefund(db, fixture, order, requestId, label);
  if (result.idempotent !== false || result.error_code !== null) {
    throw new FixtureFailure("refund confirmation failed");
  }
  return requestId;
}

export async function confirmSmokeRefund(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
  requestId: string,
  providerKey: string,
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_confirm_refund(
      ${requestId}::uuid, ${order.id}::uuid, ${order.transactionId},
      ${order.outTradeNo}, ${fixture.paymentConfigId}::uuid,
      ${fixture.paymentConfigGuardVersion}, ${`task7-refund-${providerKey}`},
      ${`task7-wechat-${providerKey}`}, ${fixture.amountFen}::bigint,
      clock_timestamp(), ${fixture.platformOperatorId}::uuid, '{}'::jsonb
    ) as result;
  `;
  return rows[0]!.result;
}

export async function closeSmokeRefund(
  db: SqlClient,
  fixture: SmokeFixture,
  order: SmokeOrder,
  requestId: string,
  providerKey: string,
): Promise<SmokeJson> {
  const rows = await db<Array<{ result: SmokeJson }>>`
    select public.platform_service_close_refund_execution(
      ${requestId}::uuid, ${order.id}::uuid, ${order.transactionId},
      ${order.outTradeNo}, ${fixture.paymentConfigId}::uuid,
      ${fixture.paymentConfigGuardVersion}, ${`task7-refund-${providerKey}`},
      ${`task7-wechat-${providerKey}`}, ${fixture.amountFen}::bigint,
      ${fixture.platformOperatorId}::uuid, '{}'::jsonb
    ) as result;
  `;
  return rows[0]!.result;
}

export async function readSmokeAccessMode(
  db: SqlClient,
  tenantId: string,
): Promise<string> {
  const rows = await db<Array<SmokeJson>>`
    select tenant.status,
      (select jsonb_build_object(
          'id', contract.id,
          'service_start_at', contract.service_start_at,
          'service_end_at', contract.service_end_at
        ) from public.tenant_service_contracts contract
        where contract.tenant_id = tenant.id and contract.status = 'active'
          and contract.service_start_at <= now() and contract.service_end_at > now()
        limit 1) as contract,
      (select jsonb_build_object('id', service_order.id, 'paid_at', service_order.paid_at)
        from public.tenant_service_orders service_order
        where service_order.tenant_id = tenant.id
          and service_order.payment_status in ('paid','refund_reviewing','refunding','partially_refunded')
          and service_order.service_status not in ('accepted','active')
          and service_order.paid_at is not null
          and service_order.service_access_terminated_at is null
        order by service_order.paid_at desc nulls last, service_order.id desc
        limit 1) as paid_onboarding_order,
      (select subscription.status from public.tenant_billing_subscriptions subscription
        where subscription.tenant_id = tenant.id limit 1) as legacy_status
    from public.tenants tenant where tenant.id = ${tenantId}::uuid;
  `;
  const fact = rows[0];
  const legacyStatus = isLegacyStatus(fact?.legacy_status)
    ? fact.legacy_status
    : null;
  const facts: TenantServiceAccessFacts = {
    tenantStatus: typeof fact?.status === "string" ? fact.status : null,
    contract: readAccessObject(fact?.contract, [
      "id", "service_start_at", "service_end_at",
    ]),
    paidOnboardingOrder: readAccessObject(fact?.paid_onboarding_order, [
      "id", "paid_at",
    ]),
    legacySubscriptionStatus: legacyStatus,
  };
  return withIsolatedLocalSupabaseEnvironment(async () => {
    const { TenantServiceAccessService } = await import(
      "../services/tenant-service-access"
    );
    const service = new TenantServiceAccessService({
      repository: { getAccessFacts: async () => facts },
    });
    return (await service.resolveForRoute({
      tenantId,
      routeAccess: "write",
      now: new Date(),
    })).mode;
  });
}

export async function withIsolatedLocalSupabaseEnvironment<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const localValues = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_PUBLISH: "task7-local-publish",
    SUPABASE_SERVICE_ROLE_KEY: "task7-local-service-role",
  } as const;
  const previous = Object.fromEntries(
    Object.keys(localValues).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, localValues);
  try {
    return await operation();
  } finally {
    for (const name of Object.keys(localValues)) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

export async function cleanupAccessSmokeFixture(
  db: SqlClient,
  fixture: SmokeFixture,
): Promise<void> {
  await db.begin(async (tx) => {
    await tx`delete from public.tenant_service_work_order_events where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_service_acceptance_preparations where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`update public.tenant_service_contracts set last_period_id = null where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_service_contract_periods where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_service_contracts where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_service_refund_requests where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_service_work_orders where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_service_orders where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.tenant_billing_subscriptions where tenant_id = ${fixture.tenantId}::uuid`;
    await tx`delete from public.employees where id = ${fixture.employeeId}::uuid`;
    await tx`delete from public.tenants where id = ${fixture.tenantId}::uuid`;
    if (fixture.createdPaymentConfig) {
      await tx`delete from public.platform_payment_configs where id = ${fixture.paymentConfigId}::uuid`;
    }
  });
}

export function isStableProviderConflict(error: unknown): boolean {
  return error instanceof Error
    && error.message === "SERVICE_REFUND_EXECUTION_ID_CONFLICT";
}

function requireRows(...rowSets: unknown[][]): void {
  if (rowSets.some((rows) => rows.length === 0)) {
    throw new FixtureFailure("required local seed fixture is missing");
  }
}

function instant(value: unknown): number {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new FixtureFailure("invalid database time fact");
  return parsed;
}

function isLegacyStatus(value: unknown): value is TenantBillingSubscriptionStatus {
  return typeof value === "string"
    && ["active", "past_due", "locked", "canceled"].includes(value);
}

function readAccessObject<T extends Record<string, string>>(
  value: unknown,
  fields: readonly (keyof T)[],
): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (fields.some((field) => typeof record[String(field)] !== "string")) {
    throw new FixtureFailure("database access fact is malformed");
  }
  return Object.fromEntries(
    fields.map((field) => [field, record[String(field)]]),
  ) as T;
}
