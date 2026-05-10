import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type AnyRecord = Record<string, unknown>;

const fixture = {
  tenantA: "51111111-1111-4111-8111-111111111111",
  tenantB: "52222222-2222-4222-8222-222222222222",
  authUserA: "",
  authUserB: "",
  departmentA: "5aaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa",
  departmentB: "5bbbbbbb-0001-4bbb-8bbb-bbbbbbbbbbbb",
  postA: "5aaaaaaa-0002-4aaa-8aaa-aaaaaaaaaaaa",
  postB: "5bbbbbbb-0002-4bbb-8bbb-bbbbbbbbbbbb",
  roleA: "5aaaaaaa-0003-4aaa-8aaa-aaaaaaaaaaaa",
  roleB: "5bbbbbbb-0003-4bbb-8bbb-bbbbbbbbbbbb",
  employeeA: "5aaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa",
  employeeB: "5bbbbbbb-0004-4bbb-8bbb-bbbbbbbbbbbb",
  customerA: "5aaaaaaa-0005-4aaa-8aaa-aaaaaaaaaaaa",
  customerB: "5bbbbbbb-0005-4bbb-8bbb-bbbbbbbbbbbb",
  projectA: "5aaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa",
  projectB: "5bbbbbbb-0006-4bbb-8bbb-bbbbbbbbbbbb",
  expenseA: "5aaaaaaa-0007-4aaa-8aaa-aaaaaaaaaaaa",
  expenseB: "5bbbbbbb-0007-4bbb-8bbb-bbbbbbbbbbbb",
  acceptanceA: "5aaaaaaa-0008-4aaa-8aaa-aaaaaaaaaaaa",
  acceptanceB: "5bbbbbbb-0008-4bbb-8bbb-bbbbbbbbbbbb",
  cameraA: "5aaaaaaa-0009-4aaa-8aaa-aaaaaaaaaaaa",
  cameraB: "5bbbbbbb-0009-4bbb-8bbb-bbbbbbbbbbbb",
  marketingPageA: "5aaaaaaa-0010-4aaa-8aaa-aaaaaaaaaaaa",
  marketingPageB: "5bbbbbbb-0010-4bbb-8bbb-bbbbbbbbbbbb",
  marketingLeadA: "5aaaaaaa-0011-4aaa-8aaa-aaaaaaaaaaaa",
  marketingLeadB: "5bbbbbbb-0011-4bbb-8bbb-bbbbbbbbbbbb",
  shareLinkA: "5aaaaaaa-0012-4aaa-8aaa-aaaaaaaaaaaa",
  shareLinkB: "5bbbbbbb-0012-4bbb-8bbb-bbbbbbbbbbbb",
  notificationA: "5aaaaaaa-0013-4aaa-8aaa-aaaaaaaaaaaa",
  notificationB: "5bbbbbbb-0013-4bbb-8bbb-bbbbbbbbbbbb",
  transcriptionA: "5aaaaaaa-0014-4aaa-8aaa-aaaaaaaaaaaa",
  transcriptionB: "5bbbbbbb-0014-4bbb-8bbb-bbbbbbbbbbbb",
  scriptA: "5aaaaaaa-0015-4aaa-8aaa-aaaaaaaaaaaa",
  scriptB: "5bbbbbbb-0015-4bbb-8bbb-bbbbbbbbbbbb",
  aiCallA: "5aaaaaaa-0016-4aaa-8aaa-aaaaaaaaaaaa",
  aiCallB: "5bbbbbbb-0016-4bbb-8bbb-bbbbbbbbbbbb",
};

loadDotEnv();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const apiBaseUrl = process.env.API_BASE_URL || process.env.GOOES_API_BASE_URL || "";
const outputFormat = process.argv.includes("--format=shell") ? "shell" : "json";

if (!supabaseUrl || !serviceRoleKey || !jwtSecret) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or JWT_SECRET");
  process.exit(1);
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signToken(payload: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 7 * 24 * 60 * 60,
  };
  const encodedHeader = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = toBase64Url(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", jwtSecret!)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function rest(table: string, init: RequestInit & { query?: string }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${init.query || ""}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${table}: ${response.status} ${response.statusText}: ${text}`);
  }
}

async function restJson<T>(table: string, query = "") {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${table}: ${response.status} ${response.statusText}: ${text}`);
  }

  return await response.json() as T;
}

async function must(label: string, operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    console.error(`[phase5h seed failed] ${label}`);
    console.error(error);
    process.exit(1);
  }
}

async function removeByIds(table: string, ids: string[]) {
  await must(
    `delete ${table}`,
    rest(table, {
      method: "DELETE",
      query: `?id=in.(${ids.join(",")})`,
    }),
  );
}

async function cleanup() {
  await removeByIds("ai_call_logs", [fixture.aiCallA, fixture.aiCallB]);
  await removeByIds("social_video_scripts", [fixture.scriptA, fixture.scriptB]);
  await removeByIds("social_video_transcriptions", [fixture.transcriptionA, fixture.transcriptionB]);
  await removeByIds("notifications", [fixture.notificationA, fixture.notificationB]);
  await removeByIds("tenant_share_links", [fixture.shareLinkA, fixture.shareLinkB]);
  await removeByIds("marketing_leads", [fixture.marketingLeadA, fixture.marketingLeadB]);
  await removeByIds("marketing_page_versions", [fixture.marketingPageA, fixture.marketingPageB]);
  await removeByIds("marketing_pages", [fixture.marketingPageA, fixture.marketingPageB]);
  await removeByIds("project_cameras", [fixture.cameraA, fixture.cameraB]);
  await removeByIds("project_acceptances", [fixture.acceptanceA, fixture.acceptanceB]);
  await removeByIds("expense_requests", [fixture.expenseA, fixture.expenseB]);
  await removeByIds("projects", [fixture.projectA, fixture.projectB]);
  await removeByIds("customer_sources", [fixture.customerA, fixture.customerB]);
  await removeByIds("customers", [fixture.customerA, fixture.customerB]);
  await must("delete employee role permissions", rest("role_permissions", {
    method: "DELETE",
    query: `?role_id=in.(${fixture.roleA},${fixture.roleB})`,
  }));
  await must("delete employee roles", rest("employee_roles", {
    method: "DELETE",
    query: `?employee_id=in.(${fixture.employeeA},${fixture.employeeB})`,
  }));
  await removeByIds("employees", [fixture.employeeA, fixture.employeeB]);
  await removeByIds("roles", [fixture.roleA, fixture.roleB]);
  await removeByIds("posts", [fixture.postA, fixture.postB]);
  await removeByIds("departments", [fixture.departmentA, fixture.departmentB]);
  await removeByIds("tenants", [fixture.tenantA, fixture.tenantB]);
}

async function insert(table: string, rows: AnyRecord[]) {
  await must(`insert ${table}`, rest(table, {
    method: "POST",
    body: JSON.stringify(rows),
  }));
}

async function createAuthUser(label: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: `${label}-${Date.now()}@phase5h-tenant-verify.local`,
      password: `TenantVerify5H-${Date.now()}`,
      email_confirm: true,
      user_metadata: {
        source: "phase5h_tenant_verification",
        label,
      },
    }),
  });

  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(`create auth user ${label} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.id;
}

async function grantAllPermissions() {
  const permissions = await restJson<Array<{ id: string }>>("permissions", "?select=id&status=eq.active");
  const rows = permissions.flatMap((permission) => [
    {
      role_id: fixture.roleA,
      permission_id: permission.id,
      access_scope: "all",
    },
    {
      role_id: fixture.roleB,
      permission_id: permission.id,
      access_scope: "all",
    },
  ]);

  if (rows.length === 0) return;
  await insert("role_permissions", rows);
}

async function seed() {
  await cleanup();
  const now = new Date().toISOString();
  const uniqueSuffix = Date.now();
  fixture.authUserA = await createAuthUser("phase5h-tenant-a");
  fixture.authUserB = await createAuthUser("phase5h-tenant-b");

  await insert("tenants", [
    {
      id: fixture.tenantA,
      slug: "phase5h_verify_a",
      name: "5H 验收租户 A",
      status: "active",
      contact_name: "验收联系人 A",
      contact_phone: "19000005001",
    },
    {
      id: fixture.tenantB,
      slug: "phase5h_verify_b",
      name: "5H 验收租户 B",
      status: "active",
      contact_name: "验收联系人 B",
      contact_phone: "19000005002",
    },
  ]);

  await insert("departments", [
    { id: fixture.departmentA, tenant_id: fixture.tenantA, code: "ADMIN", name: "行政人事部" },
    { id: fixture.departmentB, tenant_id: fixture.tenantB, code: "ADMIN", name: "行政人事部" },
  ]);

  await insert("posts", [
    { id: fixture.postA, tenant_id: fixture.tenantA, code: "SYSTEM_ADMIN", name: "系统管理员", salary_type: "fixed", status: 1, sort: 1 },
    { id: fixture.postB, tenant_id: fixture.tenantB, code: "SYSTEM_ADMIN", name: "系统管理员", salary_type: "fixed", status: 1, sort: 1 },
  ]);

  await insert("roles", [
    { id: fixture.roleA, tenant_id: fixture.tenantA, code: "system_admin", name: "系统管理员", status: "active" },
    { id: fixture.roleB, tenant_id: fixture.tenantB, code: "system_admin", name: "系统管理员", status: "active" },
  ]);
  await grantAllPermissions();

  await insert("employees", [
    {
      id: fixture.employeeA,
      tenant_id: fixture.tenantA,
      user_id: fixture.authUserA,
      department_id: fixture.departmentA,
      post_id: fixture.postA,
      name: "5H 验收员工 A",
      phone: "19000005001",
      status: "active",
    },
    {
      id: fixture.employeeB,
      tenant_id: fixture.tenantB,
      user_id: fixture.authUserB,
      department_id: fixture.departmentB,
      post_id: fixture.postB,
      name: "5H 验收员工 B",
      phone: "19000005002",
      status: "active",
    },
  ]);

  await insert("employee_roles", [
    { employee_id: fixture.employeeA, role_id: fixture.roleA },
    { employee_id: fixture.employeeB, role_id: fixture.roleB },
  ]);

  await insert("customers", [
    {
      id: fixture.customerA,
      tenant_id: fixture.tenantA,
      owner_id: fixture.employeeA,
      name: "5H 验收客户 A",
      phone: "19100005001",
      status: "potential",
      source: "platform",
    },
    {
      id: fixture.customerB,
      tenant_id: fixture.tenantB,
      owner_id: fixture.employeeB,
      name: "5H 验收客户 B",
      phone: "19100005002",
      status: "potential",
      source: "platform",
    },
  ]);

  await insert("projects", [
    {
      id: fixture.projectA,
      tenant_id: fixture.tenantA,
      customer_id: fixture.customerA,
      name: "5H 验收项目 A",
      status: "constructing",
      supervisor_id: fixture.employeeA,
      designer_id: fixture.employeeA,
      address: "5H A 租户测试地址",
    },
    {
      id: fixture.projectB,
      tenant_id: fixture.tenantB,
      customer_id: fixture.customerB,
      name: "5H 验收项目 B",
      status: "constructing",
      supervisor_id: fixture.employeeB,
      designer_id: fixture.employeeB,
      address: "5H B 租户测试地址",
    },
  ]);

  await insert("expense_requests", [
    {
      id: fixture.expenseA,
      tenant_id: fixture.tenantA,
      employee_id: fixture.employeeA,
      project_id: fixture.projectA,
      mode: "reimbursement",
      status: "pending",
      current_step: "manager_review",
      request_no: `PHASE5H-A-${uniqueSuffix}`,
      title: "5H 验收费用 A",
      total_amount: 100,
      amount: 100,
      category: "测试费用",
      reason: "阶段 5H 租户隔离验收",
      assignee_id: fixture.employeeA,
    },
    {
      id: fixture.expenseB,
      tenant_id: fixture.tenantB,
      employee_id: fixture.employeeB,
      project_id: fixture.projectB,
      mode: "reimbursement",
      status: "pending",
      current_step: "manager_review",
      request_no: `PHASE5H-B-${uniqueSuffix}`,
      title: "5H 验收费用 B",
      total_amount: 200,
      amount: 200,
      category: "测试费用",
      reason: "阶段 5H 租户隔离验收",
      assignee_id: fixture.employeeB,
    },
  ]);

  await insert("project_acceptances", [
    {
      id: fixture.acceptanceA,
      tenant_id: fixture.tenantA,
      project_id: fixture.projectA,
      stage_code: "plumbing_electrical",
      title: "5H 验收单 A",
      status: "submitted",
      initiator_id: fixture.employeeA,
      reviewer_id: fixture.employeeA,
      customer_id: fixture.customerA,
      submitted_at: now,
    },
    {
      id: fixture.acceptanceB,
      tenant_id: fixture.tenantB,
      project_id: fixture.projectB,
      stage_code: "plumbing_electrical",
      title: "5H 验收单 B",
      status: "submitted",
      initiator_id: fixture.employeeB,
      reviewer_id: fixture.employeeB,
      customer_id: fixture.customerB,
      submitted_at: now,
    },
  ]);

  await insert("project_cameras", [
    {
      id: fixture.cameraA,
      tenant_id: fixture.tenantA,
      project_id: fixture.projectA,
      vendor: "ezviz",
      vendor_device_serial: `PHASE5HA${uniqueSuffix}`,
      channel_no: 1,
      name: "5H 验收摄像头 A",
      status: "online",
    },
    {
      id: fixture.cameraB,
      tenant_id: fixture.tenantB,
      project_id: fixture.projectB,
      vendor: "ezviz",
      vendor_device_serial: `PHASE5HB${uniqueSuffix}`,
      channel_no: 1,
      name: "5H 验收摄像头 B",
      status: "online",
    },
  ]);

  await insert("marketing_pages", [
    {
      id: fixture.marketingPageA,
      tenant_id: fixture.tenantA,
      title: "5H 验收营销页 A",
      slug: `phase5h-a-${uniqueSuffix}`,
      status: "draft",
      description: "阶段 5H 验收数据 A",
      display_scene: "all",
      sort_order: 100,
      created_by: fixture.employeeA,
      updated_by: fixture.employeeA,
    },
    {
      id: fixture.marketingPageB,
      tenant_id: fixture.tenantB,
      title: "5H 验收营销页 B",
      slug: `phase5h-b-${uniqueSuffix}`,
      status: "draft",
      description: "阶段 5H 验收数据 B",
      display_scene: "all",
      sort_order: 100,
      created_by: fixture.employeeB,
      updated_by: fixture.employeeB,
    },
  ]);

  await insert("marketing_leads", [
    {
      id: fixture.marketingLeadA,
      tenant_id: fixture.tenantA,
      page_id: fixture.marketingPageA,
      name: "5H H5 线索 A",
      phone: "19200005001",
      city: "郑州",
      community: "A 小区",
      form_data: { source: "phase5h" },
      source: "h5",
      lead_status: "new",
    },
    {
      id: fixture.marketingLeadB,
      tenant_id: fixture.tenantB,
      page_id: fixture.marketingPageB,
      name: "5H H5 线索 B",
      phone: "19200005002",
      city: "郑州",
      community: "B 小区",
      form_data: { source: "phase5h" },
      source: "h5",
      lead_status: "new",
    },
  ]);

  await insert("tenant_share_links", [
    {
      id: fixture.shareLinkA,
      tenant_id: fixture.tenantA,
      share_employee_id: fixture.employeeA,
      source: "employee_share",
      target_type: "miniprogram",
      token: `phase5h-share-a-${uniqueSuffix}`,
      status: "active",
      metadata: { source: "phase5h" },
    },
    {
      id: fixture.shareLinkB,
      tenant_id: fixture.tenantB,
      share_employee_id: fixture.employeeB,
      source: "employee_share",
      target_type: "miniprogram",
      token: `phase5h-share-b-${uniqueSuffix}`,
      status: "active",
      metadata: { source: "phase5h" },
    },
  ]);

  await insert("notifications", [
    {
      id: fixture.notificationA,
      tenant_id: fixture.tenantA,
      recipient_employee_id: fixture.employeeA,
      scene: "phase5h_verify",
      title: "5H 验收通知 A",
      content: "A 租户通知",
      status: "unread",
      payload: { source: "phase5h" },
    },
    {
      id: fixture.notificationB,
      tenant_id: fixture.tenantB,
      recipient_employee_id: fixture.employeeB,
      scene: "phase5h_verify",
      title: "5H 验收通知 B",
      content: "B 租户通知",
      status: "unread",
      payload: { source: "phase5h" },
    },
  ]);

  await insert("social_video_transcriptions", [
    {
      id: fixture.transcriptionA,
      tenant_id: fixture.tenantA,
      platform: "douyin",
      source_url: "https://v.douyin.com/phase5h-a/",
      normalized_url: "https://v.douyin.com/phase5h-a/",
      input_hash: `phase5h-a-${uniqueSuffix}`,
      status: "completed",
      progress: 100,
      provider: "tencent_asr",
      title: "5H 验收短视频 A",
      text: "A 租户测试转写文本",
      audio_duration_seconds: 32,
      created_by_auth_user_id: fixture.authUserA,
      completed_at: now,
    },
    {
      id: fixture.transcriptionB,
      tenant_id: fixture.tenantB,
      platform: "douyin",
      source_url: "https://v.douyin.com/phase5h-b/",
      normalized_url: "https://v.douyin.com/phase5h-b/",
      input_hash: `phase5h-b-${uniqueSuffix}`,
      status: "completed",
      progress: 100,
      provider: "tencent_asr",
      title: "5H 验收短视频 B",
      text: "B 租户测试转写文本",
      audio_duration_seconds: 48,
      created_by_auth_user_id: fixture.authUserB,
      completed_at: now,
    },
  ]);

  await insert("social_video_scripts", [
    {
      id: fixture.scriptA,
      tenant_id: fixture.tenantA,
      transcription_id: fixture.transcriptionA,
      user_id: fixture.authUserA,
      platform: "douyin",
      target_platform: "douyin",
      style: "douyin_practical",
      duration_seconds: 60,
      goal: "lead_generation",
      title: "5H 验收脚本 A",
      rewritten_copy: "A 租户脚本",
      hook: "A 租户开场",
      shooting_script: [],
      cover_text_options: [],
      caption_options: [],
      tips: [],
      source_text_length: 10,
      prompt_version: "phase5h",
      model_provider: "deepseek",
      model_name: "deepseek-chat",
      status: "completed",
    },
    {
      id: fixture.scriptB,
      tenant_id: fixture.tenantB,
      transcription_id: fixture.transcriptionB,
      user_id: fixture.authUserB,
      platform: "douyin",
      target_platform: "douyin",
      style: "douyin_practical",
      duration_seconds: 60,
      goal: "lead_generation",
      title: "5H 验收脚本 B",
      rewritten_copy: "B 租户脚本",
      hook: "B 租户开场",
      shooting_script: [],
      cover_text_options: [],
      caption_options: [],
      tips: [],
      source_text_length: 10,
      prompt_version: "phase5h",
      model_provider: "deepseek",
      model_name: "deepseek-chat",
      status: "completed",
    },
  ]);

  await insert("ai_call_logs", [
    {
      id: fixture.aiCallA,
      tenant_id: fixture.tenantA,
      scene_code: "social_video_script",
      provider_code: "deepseek",
      model_code: "deepseek-chat",
      model_name: "deepseek-chat",
      status: "success",
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
    {
      id: fixture.aiCallB,
      tenant_id: fixture.tenantB,
      scene_code: "social_video_script",
      provider_code: "deepseek",
      model_code: "deepseek-chat",
      model_name: "deepseek-chat",
      status: "success",
      prompt_tokens: 200,
      completion_tokens: 80,
      total_tokens: 280,
    },
  ]);
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function output(token: string) {
  const data = {
    API_BASE_URL: apiBaseUrl,
    TENANT_VERIFY_TOKEN: token,
    TENANT_OWN_PROJECT_ID: fixture.projectA,
    TENANT_FORBIDDEN_IDS: [
      fixture.tenantB,
      fixture.departmentB,
      fixture.postB,
      fixture.roleB,
      fixture.employeeB,
      fixture.customerB,
      fixture.projectB,
      fixture.expenseB,
      fixture.acceptanceB,
      fixture.cameraB,
      fixture.marketingPageB,
      fixture.marketingLeadB,
      fixture.shareLinkB,
      fixture.notificationB,
      fixture.transcriptionB,
      fixture.scriptB,
      fixture.aiCallB,
    ].join(","),
    TENANT_OTHER_CUSTOMER_ID: fixture.customerB,
    TENANT_OTHER_PROJECT_ID: fixture.projectB,
    TENANT_OTHER_EXPENSE_REQUEST_ID: fixture.expenseB,
    TENANT_OTHER_PROJECT_ACCEPTANCE_ID: fixture.acceptanceB,
    TENANT_OTHER_CAMERA_ID: fixture.cameraB,
    TENANT_OTHER_MARKETING_PAGE_ID: fixture.marketingPageB,
    TENANT_OTHER_SOCIAL_VIDEO_TRANSCRIPTION_ID: fixture.transcriptionB,
  };

  if (outputFormat === "shell") {
    for (const [key, value] of Object.entries(data)) {
      if (!value) continue;
      console.log(`export ${key}=${quoteShell(value)}`);
    }
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

await seed();

output(signToken({
  sub: fixture.authUserA,
  login_channel: "admin_web",
  roles: ["employee"],
  token_type: "auth",
}));
