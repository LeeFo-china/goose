import { SupabaseDB } from "@/utils/supabase";

type Action = "status" | "lock" | "recover";

type CliOptions = {
  action: Action;
  tenantId: string | null;
  apply: boolean;
  confirmTenant: string | null;
  initialCredits: number;
};

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type BillingPlanRecord = {
  id: string;
  code: string;
  monthly_fee_credits: number;
  reminder_days_before_due: number;
};

type CreditAccountRecord = {
  balance_credits: number;
  frozen_credits: number;
  available_credits: number;
  total_recharged_credits: number;
  total_consumed_credits: number;
};

type SubscriptionRecord = {
  id: string;
  tenant_id: string;
  status: string;
  lock_reason: string | null;
  last_invoice_id: string | null;
  metadata: Record<string, unknown>;
};

type InvoiceRecord = {
  id: string;
  tenant_id: string;
  status: string;
  amount_credits: number;
  due_at: string;
  metadata: Record<string, unknown>;
};

const SOURCE = "mini_program_billing_lock_joint_test";
const PLAN_CODE = "system_monthly_1000";

const client = SupabaseDB.getAdminClient();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    action: "status",
    tenantId: null,
    apply: false,
    confirmTenant: null,
    initialCredits: Number(process.env.BILLING_LOCK_TEST_INITIAL_CREDITS || 500),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--action") {
      const value = argv[index + 1];
      if (value !== "status" && value !== "lock" && value !== "recover") {
        throw new Error("--action 必须是 status、lock 或 recover");
      }
      options.action = value;
      index += 1;
      continue;
    }
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--confirm-tenant") {
      options.confirmTenant = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--initial-credits") {
      options.initialCredits = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!options.tenantId) {
    throw new Error("请传 --tenant-id <uuid>");
  }
  if (!Number.isInteger(options.initialCredits) || options.initialCredits < 0) {
    throw new Error("--initial-credits 必须是非负整数");
  }
  if (options.action !== "status" && !options.apply) {
    throw new Error("写入操作必须传 --apply");
  }
  if (
    options.action !== "status" &&
    options.confirmTenant !== options.tenantId
  ) {
    throw new Error("写入操作必须传 --confirm-tenant <tenant-id>");
  }

  return options;
}

async function findTenant(tenantId: string) {
  const { data, error } = await client
    .from("tenants")
    .select("id, name, slug, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data as TenantRecord | null;
}

async function findPlan() {
  const { data, error } = await client
    .from("tenant_billing_plans")
    .select("id, code, monthly_fee_credits, reminder_days_before_due")
    .eq("code", PLAN_CODE)
    .maybeSingle();

  if (error) throw error;
  return data as BillingPlanRecord | null;
}

async function findAccount(tenantId: string) {
  const { data, error } = await client
    .from("tenant_credit_account_balances")
    .select("balance_credits, frozen_credits, available_credits, total_recharged_credits, total_consumed_credits")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data as CreditAccountRecord | null;
}

async function findSubscription(tenantId: string) {
  const { data, error } = await client
    .from("tenant_billing_subscriptions")
    .select("id, tenant_id, status, lock_reason, last_invoice_id, metadata")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data as SubscriptionRecord | null;
}

async function findOpenInvoice(tenantId: string) {
  const { data, error } = await client
    .from("tenant_subscription_invoices")
    .select("id, tenant_id, status, amount_credits, due_at, metadata")
    .eq("tenant_id", tenantId)
    .in("status", ["reminded", "past_due", "failed"])
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as InvoiceRecord | null;
}

function isScriptSubscription(subscription: SubscriptionRecord | null) {
  return subscription?.metadata?.source === SOURCE;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function ensureInitialCredits(input: {
  tenantId: string;
  account: CreditAccountRecord | null;
  initialCredits: number;
}) {
  if (input.account) return;
  if (input.initialCredits <= 0) return;

  const { error } = await client.rpc("billing_manual_recharge", {
    p_tenant_id: input.tenantId,
    p_amount_fen: 0,
    p_credits: input.initialCredits,
    p_bonus_credits: 0,
    p_operator_user_id: null,
    p_remark: "小程序计费锁定联调初始积分",
    p_metadata: { source: SOURCE },
    p_idempotency_key: `${SOURCE}:initial:${input.tenantId}`,
  });

  if (error) throw error;
}

async function prepareLockedState(input: {
  tenantId: string;
  plan: BillingPlanRecord;
  subscription: SubscriptionRecord | null;
}) {
  if (input.subscription && !isScriptSubscription(input.subscription)) {
    throw new Error(
      "该租户已有非联调脚本创建的订阅记录，拒绝覆盖真实订阅状态",
    );
  }

  const existingOpenInvoice = await findOpenInvoice(input.tenantId);
  if (existingOpenInvoice) {
    const { data, error } = await client.rpc("billing_charge_subscription_invoice", {
      p_invoice_id: existingOpenInvoice.id,
      p_operator_user_id: null,
    });

    if (error) throw error;
    return {
      idempotent: true,
      invoice_id: existingOpenInvoice.id,
      result: data,
    };
  }

  const today = new Date();
  const periodStart = today;
  const periodEnd = addDays(today, 30);
  const dueAt = addDays(today, -1);
  const subscriptionId = input.subscription?.id ?? crypto.randomUUID();

  if (!input.subscription) {
    const { error } = await client
      .from("tenant_billing_subscriptions")
      .insert({
        id: subscriptionId,
        tenant_id: input.tenantId,
        plan_id: input.plan.id,
        status: "active",
        current_period_start: dateOnly(periodStart),
        current_period_end: dateOnly(periodEnd),
        next_charge_at: dueAt.toISOString(),
        metadata: { source: SOURCE },
      });

    if (error) throw error;
  }

  const invoiceId = crypto.randomUUID();
  const { error: invoiceError } = await client
    .from("tenant_subscription_invoices")
    .insert({
      id: invoiceId,
      tenant_id: input.tenantId,
      subscription_id: subscriptionId,
      plan_id: input.plan.id,
      period_start: dateOnly(periodStart),
      period_end: dateOnly(periodEnd),
      due_at: dueAt.toISOString(),
      amount_credits: input.plan.monthly_fee_credits,
      status: "reminded",
      reminder_due_at: dueAt.toISOString(),
      reminded_at: dueAt.toISOString(),
      metadata: { source: SOURCE },
    });

  if (invoiceError) throw invoiceError;

  const { data, error } = await client.rpc("billing_charge_subscription_invoice", {
    p_invoice_id: invoiceId,
    p_operator_user_id: null,
  });

  if (error) throw error;
  return data;
}

async function recoverTenant(tenantId: string, plan: BillingPlanRecord) {
  const account = await findAccount(tenantId);
  const availableCredits = account?.available_credits ?? 0;
  const rechargeCredits = Math.max(plan.monthly_fee_credits - availableCredits, 0);

  if (rechargeCredits > 0) {
    const { error } = await client.rpc("billing_manual_recharge", {
      p_tenant_id: tenantId,
      p_amount_fen: 0,
      p_credits: rechargeCredits,
      p_bonus_credits: 0,
      p_operator_user_id: null,
      p_remark: "小程序计费锁定联调恢复积分",
      p_metadata: { source: SOURCE },
      p_idempotency_key: `${SOURCE}:recover:${tenantId}:${Date.now()}`,
    });

    if (error) throw error;
  }

  const { data, error } = await client.rpc(
    "billing_recover_subscription_after_recharge",
    { p_tenant_id: tenantId },
  );

  if (error) throw error;
  return data;
}

async function printStatus(tenantId: string) {
  const [tenant, account, subscription, openInvoice] = await Promise.all([
    findTenant(tenantId),
    findAccount(tenantId),
    findSubscription(tenantId),
    findOpenInvoice(tenantId),
  ]);

  console.log(JSON.stringify({
    tenant,
    account,
    subscription,
    open_invoice: openInvoice,
  }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tenant = await findTenant(options.tenantId as string);
  if (!tenant) throw new Error("租户不存在");
  if (tenant.status !== "active") {
    throw new Error(`租户状态不是 active: ${tenant.status}`);
  }

  const plan = await findPlan();
  if (!plan) throw new Error(`计费方案不存在: ${PLAN_CODE}`);

  if (options.action === "status") {
    await printStatus(tenant.id);
    return;
  }

  if (options.action === "lock") {
    const account = await findAccount(tenant.id);
    const availableCredits = account?.available_credits ?? 0;
    if (availableCredits >= plan.monthly_fee_credits) {
      throw new Error(
        `当前可用积分 ${availableCredits} >= 月费 ${plan.monthly_fee_credits}，拒绝消耗真实积分`,
      );
    }

    await ensureInitialCredits({
      tenantId: tenant.id,
      account,
      initialCredits: options.initialCredits,
    });

    const nextAccount = await findAccount(tenant.id);
    if ((nextAccount?.available_credits ?? 0) >= plan.monthly_fee_credits) {
      throw new Error("初始积分过高，无法构造余额不足锁定态");
    }

    const result = await prepareLockedState({
      tenantId: tenant.id,
      plan,
      subscription: await findSubscription(tenant.id),
    });

    console.log(JSON.stringify({ action: "lock", result }, null, 2));
    await printStatus(tenant.id);
    return;
  }

  const subscription = await findSubscription(tenant.id);
  if (subscription && !isScriptSubscription(subscription)) {
    throw new Error("该租户订阅不是联调脚本创建，拒绝自动恢复");
  }

  const result = await recoverTenant(tenant.id, plan);
  console.log(JSON.stringify({ action: "recover", result }, null, 2));
  await printStatus(tenant.id);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
