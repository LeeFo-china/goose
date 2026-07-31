export const DEV_MARKETING_FIXTURE_TENANT_ID = "3eebca47-961f-4899-b976-a3d3208d326b";
const DEV_MARKETING_FIXTURE_PROJECT_ID = "fa32f6dd-b2d0-4efc-a810-347dfe90ec4c";
const PERMITTED_EMPLOYEE_PHONE = "18800000001";
export const MARKETING_CLAIM_VOUCHER_FIXTURE_IDS = {
  shareCampaign: "f1700000-0000-4000-8000-000000000001",
  appointmentCampaign: "f1700000-0000-4000-8000-000000000002",
  shareUnderTarget: "f1700000-0000-4000-8000-000000000011",
  shareAchieved: "f1700000-0000-4000-8000-000000000012",
  shareClaimed: "f1700000-0000-4000-8000-000000000013", shareExpired: "f1700000-0000-4000-8000-000000000014",
  shareClosedUnderTarget: "f1700000-0000-4000-8000-000000000015", shareClosedAchieved: "f1700000-0000-4000-8000-000000000016",
  appointmentAchieved: "f1700000-0000-4000-8000-000000000021",
} as const;
type FixtureMode = "upsert" | "cleanup";
export interface MarketingClaimVoucherFixtureOptions {
  target: "dev"; tenantId: string; mode: FixtureMode; dryRun: boolean;
}

function parseOption(args: string[], name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

export function parseMarketingClaimVoucherFixtureArgs(args: string[]): MarketingClaimVoucherFixtureOptions {
  const target = parseOption(args, "--target");
  if (!target) {
    throw new Error("必须显式指定 --target=dev");
  }
  if (target !== "dev") {
    throw new Error("领奖凭证 fixture 只允许 target=dev");
  }
  if (!args.includes("--confirm-dev-fixtures")) {
    throw new Error("必须显式传入 --confirm-dev-fixtures");
  }

  const mode = parseOption(args, "--mode");
  if (mode !== "upsert" && mode !== "cleanup") {
    throw new Error("必须显式指定 --mode=upsert 或 --mode=cleanup");
  }

  return {
    target: "dev",
    tenantId: DEV_MARKETING_FIXTURE_TENANT_ID,
    mode,
    dryRun: args.includes("--dry-run"),
  };
}

const SENSITIVE_REPORT_KEYS = new Set([
  "login_token", "access_token", "authorization", "service_role_key", "jwt_secret",
]);

export function sanitizeMarketingFixtureReport(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => !SENSITIVE_REPORT_KEYS.has(key.toLowerCase()))
      .map(([key, value]) => [
        key,
        value && typeof value === "object" && !Array.isArray(value)
          ? sanitizeMarketingFixtureReport(value as Record<string, unknown>)
          : value,
      ]),
  );
}

interface FixtureContext {
  customerId: string; customerPhone: string | null; projectName: string | null;
  activeLogId: string; referenceLogId: string; permittedEmployeeId: string;
  permittedEmployeePhone: string; unauthorizedEmployeePhone: string | null;
  envVersion: string;
}

interface AdminClient { from(table: string): unknown }

async function requireFixtureContext(client: AdminClient): Promise<FixtureContext> {
  const db = client as {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: unknown): unknown;
        neq(column: string, value: unknown): unknown;
        is(column: string, value: null): unknown;
        not(column: string, operator: string, value: unknown): unknown;
      };
    };
  };
  const projectQuery = db.from("projects").select("id, tenant_id, customer_id, name") as {
    eq(column: string, value: unknown): {
      eq(column: string, value: unknown): { maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }> };
    };
  };
  const { data: project, error: projectError } = await projectQuery
    .eq("id", DEV_MARKETING_FIXTURE_PROJECT_ID)
    .eq("tenant_id", DEV_MARKETING_FIXTURE_TENANT_ID)
    .maybeSingle();
  if (projectError || !project || typeof project.customer_id !== "string") {
    throw new Error("dev fixture 项目不存在或租户不匹配");
  }

  const logQuery = db.from("project_logs").select("id") as {
    eq(column: string, value: unknown): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{ data: Array<{ id: string }> | null; error: unknown }>;
      };
    };
  };
  const { data: logs, error: logsError } = await logQuery
    .eq("project_id", DEV_MARKETING_FIXTURE_PROJECT_ID)
    .order("created_at", { ascending: false })
    .limit(20);
  if (logsError || !logs?.length) {
    throw new Error("dev fixture 项目没有可用施工日志");
  }
  const referenceLog = logs[0];
  if (!referenceLog) {
    throw new Error("dev fixture 项目没有可用施工日志");
  }

  const activeQuery = db.from("customer_log_share_campaigns").select("id, log_id") as {
    eq(column: string, value: unknown): {
      eq(column: string, value: unknown): Promise<{
        data: Array<{ id: string; log_id: string }> | null;
        error: unknown;
      }>;
    };
  };
  const { data: activeRows, error: activeError } = await activeQuery
    .eq("project_id", DEV_MARKETING_FIXTURE_PROJECT_ID)
    .eq("status", "active");
  if (activeError) {
    throw new Error("查询 dev 进行中助力活动失败");
  }
  const occupiedLogIds = new Set(
    (activeRows || [])
      .filter((row) => row.id !== MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareUnderTarget)
      .map((row) => row.log_id),
  );
  const activeLog = logs.find((log) => !occupiedLogIds.has(log.id));
  if (!activeLog) {
    throw new Error("没有可安全创建 active fixture 的施工日志");
  }

  const customerQuery = db.from("customers").select("phone") as {
    eq(column: string, value: unknown): { maybeSingle(): Promise<{ data: { phone: string | null } | null; error: unknown }> };
  };
  const employeeQuery = db.from("employees").select("id, phone") as {
    eq(column: string, value: unknown): {
      eq(column: string, value: unknown): { maybeSingle(): Promise<{ data: { id: string; phone: string | null } | null; error: unknown }> };
    };
  };
  const unauthorizedQuery = db.from("employees").select("id, phone") as {
    neq(column: string, value: unknown): {
      not(column: string, operator: string, value: unknown): {
        limit(count: number): Promise<{ data: Array<{ id: string; phone: string | null }> | null; error: unknown }>;
      };
    };
  };
  const settingQuery = db.from("system_settings").select("value_text") as {
    eq(column: string, value: unknown): {
      eq(column: string, value: unknown): {
        is(column: string, value: null): { maybeSingle(): Promise<{ data: { value_text: string | null } | null; error: unknown }> };
      };
    };
  };
  const [customerResult, employeeResult, unauthorizedResult, settingResult] = await Promise.all([
    customerQuery.eq("id", project.customer_id).maybeSingle(),
    employeeQuery
      .eq("tenant_id", DEV_MARKETING_FIXTURE_TENANT_ID)
      .eq("phone", PERMITTED_EMPLOYEE_PHONE)
      .maybeSingle(),
    unauthorizedQuery
      .neq("tenant_id", DEV_MARKETING_FIXTURE_TENANT_ID)
      .not("phone", "is", null)
      .limit(1),
    settingQuery
      .eq("key", "WECHAT_MINIPROGRAM_ENV_VERSION")
      .eq("status", "active")
      .is("tenant_id", null)
      .maybeSingle(),
  ]);
  if (employeeResult.error || !employeeResult.data) {
    throw new Error(`dev 租户缺少员工 ${PERMITTED_EMPLOYEE_PHONE}`);
  }

  return {
    customerId: project.customer_id,
    customerPhone: customerResult.data?.phone ?? null,
    projectName: typeof project.name === "string" ? project.name : null,
    activeLogId: activeLog.id,
    referenceLogId: referenceLog.id,
    permittedEmployeeId: employeeResult.data.id,
    permittedEmployeePhone: employeeResult.data.phone || PERMITTED_EMPLOYEE_PHONE,
    unauthorizedEmployeePhone: unauthorizedResult.data?.[0]?.phone ?? null,
    envVersion: settingResult.data?.value_text || "release",
  };
}

function buildFixtureReport(context: FixtureContext, dryRun: boolean) {
  const voucherPath = (token: string) => `/employee/marketing-center/claim-vouchers/${token}`;
  return sanitizeMarketingFixtureReport({
    target: "dev",
    dry_run: dryRun,
    tenant_id: DEV_MARKETING_FIXTURE_TENANT_ID,
    project_id: DEV_MARKETING_FIXTURE_PROJECT_ID,
    project_name: context.projectName,
    customer_test_identity: context.customerPhone,
    permitted_employee_identity: context.permittedEmployeePhone,
    unauthorized_employee_identity: context.unauthorizedEmployeePhone,
    env_version: context.envVersion,
    scenarios: {
      under_target: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareUnderTarget,
        customer_qrcode_path: "/share-campaigns/st_fixture_under_target/qrcode",
      },
      achieved: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareAchieved,
        voucher_path: voucherPath("rcv_fixture_share_achieved"),
        qrcode_path: "/share-campaign-claim-vouchers/rcv_fixture_share_achieved/qrcode",
      },
      claimed: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClaimed,
        voucher_path: voucherPath("rcv_fixture_share_claimed"),
      },
      expired: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareExpired,
        voucher_path: voucherPath("rcv_fixture_share_expired"),
      },
      closed_under_target: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClosedUnderTarget,
        voucher_path: voucherPath("rcv_fixture_share_closed_under"),
      },
      closed_achieved: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClosedAchieved,
        voucher_path: voucherPath("rcv_fixture_share_closed_achieved"),
      },
      appointment_reward: {
        instance_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.appointmentAchieved,
        voucher_path: voucherPath("rcv_fixture_appointment_achieved"),
        qrcode_path:
          "/appointment-reward-claim-vouchers/rcv_fixture_appointment_achieved/qrcode",
      },
    },
  });
}

async function upsertFixtureRows(client: AdminClient, context: FixtureContext) {
  const db = client as {
    from(table: string): {
      upsert(rows: unknown, options: { onConflict: string }): Promise<{ error: unknown }>;
    };
  };
  const now = new Date();
  const achievedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const claimedAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const futureExpiry = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const pastExpiry = new Date(now.getTime() - 86400_000).toISOString();

  const { error: campaignError } = await db.from("marketing_campaigns").upsert([
    {
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareCampaign,
      tenant_id: DEV_MARKETING_FIXTURE_TENANT_ID,
      campaign_type: "share_assist",
      name: "好友助力联调 Fixture",
      status: "draft",
      enabled: false,
      target_scope_type: "all_projects",
      auto_close_on_expire: false,
      reward_title: "联调到店礼",
      reward_claim_instruction: "请到门店由员工扫码核销",
      reward_claim_channel: "store",
      config_payload: { target_assist_count: 3 },
    },
    {
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.appointmentCampaign,
      tenant_id: DEV_MARKETING_FIXTURE_TENANT_ID,
      campaign_type: "appointment_reward",
      name: "预约有礼联调 Fixture",
      status: "draft",
      enabled: false,
      target_scope_type: "all_projects",
      auto_close_on_expire: false,
      reward_title: "联调预约礼",
      reward_claim_instruction: "请到门店由员工扫码核销",
      reward_claim_channel: "store",
      config_payload: { achievement_mode: "appointment_submit" },
    },
  ], { onConflict: "id" });
  if (campaignError) throw new Error("写入联调营销活动失败");

  const commonShare = {
    campaign_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareCampaign,
    campaign_type: "share_assist",
    customer_id: context.customerId,
    project_id: DEV_MARKETING_FIXTURE_PROJECT_ID,
    log_id: context.referenceLogId,
    config_id: null,
    channel: "timeline",
    target_assist_count: 3,
    assist_uv: 0,
    reward_title: "联调到店礼",
    reward_remark: "好友助力联调 Fixture",
    reward_claim_instruction: "请到门店由员工扫码核销",
    reward_claim_channel: "store",
    valid_until: futureExpiry,
  };
  const { error: shareError } = await db.from("customer_log_share_campaigns").upsert([
    {
      ...commonShare,
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareUnderTarget,
      share_token: "st_fixture_under_target",
      log_id: context.activeLogId,
      status: "active",
      assist_count: 1,
      reward_claim_status: "unclaimed",
      reward_claim_code: null,
      reward_claim_voucher_token: null,
      reward_claim_voucher_expires_at: null,
      achieved_at: null,
      reward_claimed_at: null,
      reward_claimed_by_employee_id: null,
      closed_reason: null,
    },
    {
      ...commonShare,
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareAchieved,
      share_token: "st_fixture_share_achieved",
      status: "achieved",
      assist_count: 3,
      reward_claim_status: "unclaimed",
      reward_claim_code: "FIX-SHARE-ACTIVE",
      reward_claim_voucher_token: "rcv_fixture_share_achieved",
      reward_claim_voucher_expires_at: futureExpiry,
      achieved_at: achievedAt,
      reward_claimed_at: null,
      reward_claimed_by_employee_id: null,
      closed_reason: null,
    },
    {
      ...commonShare,
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClaimed,
      share_token: "st_fixture_share_claimed",
      status: "reward_claimed",
      assist_count: 3,
      reward_claim_status: "claimed",
      reward_claim_code: "FIX-SHARE-CLAIMED",
      reward_claim_voucher_token: "rcv_fixture_share_claimed",
      reward_claim_voucher_expires_at: futureExpiry,
      achieved_at: achievedAt,
      reward_claimed_at: claimedAt,
      reward_claimed_by_employee_id: context.permittedEmployeeId,
      closed_reason: null,
    },
    {
      ...commonShare,
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareExpired,
      share_token: "st_fixture_share_expired",
      status: "achieved",
      assist_count: 3,
      reward_claim_status: "unclaimed",
      reward_claim_code: "FIX-SHARE-EXPIRED",
      reward_claim_voucher_token: "rcv_fixture_share_expired",
      reward_claim_voucher_expires_at: pastExpiry,
      achieved_at: achievedAt,
      reward_claimed_at: null,
      reward_claimed_by_employee_id: null,
      closed_reason: null,
    },
    {
      ...commonShare,
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClosedUnderTarget,
      share_token: "st_fixture_share_closed_under",
      status: "closed",
      assist_count: 1,
      reward_claim_status: "unclaimed",
      reward_claim_code: null,
      reward_claim_voucher_token: "rcv_fixture_share_closed_under",
      reward_claim_voucher_expires_at: futureExpiry,
      achieved_at: null,
      reward_claimed_at: null,
      reward_claimed_by_employee_id: null,
      closed_reason: "联调 Fixture 未达标关闭",
    },
    {
      ...commonShare,
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClosedAchieved,
      share_token: "st_fixture_share_closed_achieved",
      status: "closed",
      assist_count: 3,
      reward_claim_status: "unclaimed",
      reward_claim_code: "FIX-SHARE-CLOSED-ACTIVE",
      reward_claim_voucher_token: "rcv_fixture_share_closed_achieved",
      reward_claim_voucher_expires_at: futureExpiry,
      achieved_at: achievedAt,
      reward_claimed_at: null,
      reward_claimed_by_employee_id: null,
      closed_reason: "联调 Fixture 达标后关闭",
    },
  ], { onConflict: "id" });
  if (shareError) throw new Error("写入好友助力联调 Fixture 失败");

  const { error: appointmentError } = await db
    .from("customer_appointment_reward_campaigns")
    .upsert({
      id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.appointmentAchieved,
      campaign_id: MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.appointmentCampaign,
      campaign_type: "appointment_reward",
      customer_id: context.customerId,
      project_id: DEV_MARKETING_FIXTURE_PROJECT_ID,
      appointment_name: "预约有礼联调 Fixture",
      appointment_phone: context.customerPhone,
      appointment_time: futureExpiry,
      status: "achieved",
      reward_claim_status: "unclaimed",
      reward_claim_code: "FIX-APPOINTMENT-ACTIVE",
      reward_claim_voucher_token: "rcv_fixture_appointment_achieved",
      achieved_at: achievedAt,
      reward_claimed_at: null,
      reward_claimed_by_employee_id: null,
      reward_claim_channel: "store",
      closed_at: null,
      closed_reason: null,
    }, { onConflict: "id" });
  if (appointmentError) throw new Error("写入预约有礼联调 Fixture 失败");
}

async function cleanupFixtureRows(client: AdminClient) {
  const db = client as {
    from(table: string): {
      delete(): {
        in(column: string, values: readonly string[]): Promise<{ error: unknown }>;
      };
    };
  };
  const shareIds = [
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareUnderTarget,
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareAchieved,
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClaimed,
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareExpired,
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClosedUnderTarget,
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareClosedAchieved,
  ];
  const instanceTables = [
    ["customer_log_share_campaigns", shareIds],
    ["customer_appointment_reward_campaigns", [
      MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.appointmentAchieved,
    ]],
  ] as const;
  for (const [table, ids] of instanceTables) {
    const { error } = await db.from(table).delete().in("id", ids);
    if (error) throw new Error(`清理 ${table} 联调 Fixture 失败`);
  }
  const { error: campaignError } = await db.from("marketing_campaigns").delete().in("id", [
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.shareCampaign,
    MARKETING_CLAIM_VOUCHER_FIXTURE_IDS.appointmentCampaign,
  ]);
  if (campaignError) throw new Error("清理联调营销活动失败");
}

export async function runMarketingClaimVoucherFixtures(options: MarketingClaimVoucherFixtureOptions) {
  if (
    options.target !== "dev"
    || options.tenantId !== DEV_MARKETING_FIXTURE_TENANT_ID
  ) {
    throw new Error("fixture 运行目标不是已知 dev 租户");
  }

  const { SupabaseDB } = await import("@/utils/supabase");
  const client = SupabaseDB.getAdminClient() as unknown as AdminClient;
  const context = await requireFixtureContext(client);
  if (!options.dryRun) {
    if (options.mode === "upsert") {
      await upsertFixtureRows(client, context);
    } else {
      await cleanupFixtureRows(client);
    }
  }

  return {
    mode: options.mode,
    ...buildFixtureReport(context, options.dryRun),
  };
}

async function runCli(): Promise<void> {
  try {
    const options = parseMarketingClaimVoucherFixtureArgs(process.argv.slice(2));
    const report = await runMarketingClaimVoucherFixtures(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "联调 Fixture 执行失败");
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void runCli();
}
