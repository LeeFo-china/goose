import { createHmac } from "node:crypto";

type AnyRecord = Record<string, unknown>;

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!supabaseUrl || !serviceRoleKey || !jwtSecret) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or JWT_SECRET");
  process.exit(1);
}

const fixture = {
  tenantA: "11111111-1111-4111-8111-111111111111",
  tenantB: "22222222-2222-4222-8222-222222222222",
  authUserA: "",
  authUserB: "",
  employeeA: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa",
  employeeB: "bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb",
  roleA: "aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa",
  roleB: "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb",
  customerA: "aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa",
  customerB: "bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb",
  projectA: "aaaaaaaa-4444-4aaa-8aaa-aaaaaaaaaaaa",
  projectB: "bbbbbbbb-4444-4bbb-8bbb-bbbbbbbbbbbb",
  expenseA: "aaaaaaaa-5555-4aaa-8aaa-aaaaaaaaaaaa",
  expenseB: "bbbbbbbb-5555-4bbb-8bbb-bbbbbbbbbbbb",
  acceptanceA: "aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa",
  acceptanceB: "bbbbbbbb-6666-4bbb-8bbb-bbbbbbbbbbbb",
  cameraA: "aaaaaaaa-7777-4aaa-8aaa-aaaaaaaaaaaa",
  cameraB: "bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb",
  transcriptionA: "aaaaaaaa-8888-4aaa-8aaa-aaaaaaaaaaaa",
  transcriptionB: "bbbbbbbb-8888-4bbb-8bbb-bbbbbbbbbbbb",
  scriptA: "aaaaaaaa-9999-4aaa-8aaa-aaaaaaaaaaaa",
  scriptB: "bbbbbbbb-9999-4bbb-8bbb-bbbbbbbbbbbb",
};

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
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
}

async function must(label: string, operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    console.error(`[seed failed] ${label}`);
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
  await removeByIds("ai_call_logs", [fixture.scriptA, fixture.scriptB]);
  await removeByIds("social_video_scripts", [fixture.scriptA, fixture.scriptB]);
  await removeByIds("social_video_transcriptions", [
    fixture.transcriptionA,
    fixture.transcriptionB,
  ]);
  await removeByIds("project_cameras", [fixture.cameraA, fixture.cameraB]);
  await removeByIds("project_acceptances", [fixture.acceptanceA, fixture.acceptanceB]);
  await removeByIds("expense_requests", [fixture.expenseA, fixture.expenseB]);
  await removeByIds("projects", [fixture.projectA, fixture.projectB]);
  await removeByIds("customers", [fixture.customerA, fixture.customerB]);
  await must("delete employee_roles", rest("employee_roles", {
    method: "DELETE",
    query: `?employee_id=in.(${fixture.employeeA},${fixture.employeeB})`,
  }));
  await removeByIds("employees", [fixture.employeeA, fixture.employeeB]);
  await removeByIds("roles", [fixture.roleA, fixture.roleB]);
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
      email: `${label}-${Date.now()}@tenant-verify.local`,
      password: `TenantVerify-${Date.now()}`,
      email_confirm: true,
      user_metadata: {
        source: "phase3_tenant_verification",
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

async function seed() {
  await cleanup();
  const now = new Date().toISOString();
  fixture.authUserA = await createAuthUser("tenant-a");
  fixture.authUserB = await createAuthUser("tenant-b");

  await insert("tenants", [
    {
      id: fixture.tenantA,
      slug: "tenant_verify_a",
      name: "验收测试租户 A",
      status: "active",
    },
    {
      id: fixture.tenantB,
      slug: "tenant_verify_b",
      name: "验收测试租户 B",
      status: "active",
    },
  ]);

  await insert("roles", [
    {
      id: fixture.roleA,
      tenant_id: fixture.tenantA,
      code: "system_admin",
      name: "系统管理员",
      status: "active",
    },
    {
      id: fixture.roleB,
      tenant_id: fixture.tenantB,
      code: "system_admin",
      name: "系统管理员",
      status: "active",
    },
  ]);

  await insert("employees", [
    {
      id: fixture.employeeA,
      tenant_id: fixture.tenantA,
      user_id: fixture.authUserA,
      name: "验收员工 A",
      phone: "19000000001",
      status: "active",
    },
    {
      id: fixture.employeeB,
      tenant_id: fixture.tenantB,
      user_id: fixture.authUserB,
      name: "验收员工 B",
      phone: "19000000001",
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
      name: "验收客户 A",
      phone: "19100000001",
      status: "potential",
      source: "platform",
    },
    {
      id: fixture.customerB,
      tenant_id: fixture.tenantB,
      owner_id: fixture.employeeB,
      name: "验收客户 B",
      phone: "19100000001",
      status: "potential",
      source: "platform",
    },
  ]);

  await insert("projects", [
    {
      id: fixture.projectA,
      tenant_id: fixture.tenantA,
      customer_id: fixture.customerA,
      name: "验收项目 A",
      status: "constructing",
      supervisor_id: fixture.employeeA,
      designer_id: fixture.employeeA,
      address: "A 租户测试地址",
    },
    {
      id: fixture.projectB,
      tenant_id: fixture.tenantB,
      customer_id: fixture.customerB,
      name: "验收项目 B",
      status: "constructing",
      supervisor_id: fixture.employeeB,
      designer_id: fixture.employeeB,
      address: "B 租户测试地址",
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
      request_no: `VERIFY-A-${Date.now()}`,
      title: "验收费用 A",
      total_amount: 100,
      amount: 100,
      category: "测试费用",
      reason: "阶段 3 租户验收",
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
      request_no: `VERIFY-B-${Date.now()}`,
      title: "验收费用 B",
      total_amount: 200,
      amount: 200,
      category: "测试费用",
      reason: "阶段 3 租户验收",
      assignee_id: fixture.employeeB,
    },
  ]);

  await insert("project_acceptances", [
    {
      id: fixture.acceptanceA,
      tenant_id: fixture.tenantA,
      project_id: fixture.projectA,
      stage_code: "plumbing_electrical",
      title: "验收单 A",
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
      title: "验收单 B",
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
      vendor_device_serial: `VERIFYA${Date.now()}`,
      channel_no: 1,
      name: "验收摄像头 A",
      status: "online",
    },
    {
      id: fixture.cameraB,
      tenant_id: fixture.tenantB,
      project_id: fixture.projectB,
      vendor: "ezviz",
      vendor_device_serial: `VERIFYB${Date.now()}`,
      channel_no: 1,
      name: "验收摄像头 B",
      status: "online",
    },
  ]);

  await insert("social_video_transcriptions", [
    {
      id: fixture.transcriptionA,
      tenant_id: fixture.tenantA,
      platform: "douyin",
      source_url: "https://v.douyin.com/verify-a/",
      normalized_url: "https://v.douyin.com/verify-a/",
      input_hash: `verify-a-${Date.now()}`,
      status: "completed",
      progress: 100,
      provider: "tencent_asr",
      title: "验收短视频 A",
      text: "A 租户测试转写文本",
      audio_duration_seconds: 32,
      created_by_auth_user_id: fixture.authUserA,
      completed_at: now,
    },
    {
      id: fixture.transcriptionB,
      tenant_id: fixture.tenantB,
      platform: "douyin",
      source_url: "https://v.douyin.com/verify-b/",
      normalized_url: "https://v.douyin.com/verify-b/",
      input_hash: `verify-b-${Date.now()}`,
      status: "completed",
      progress: 100,
      provider: "tencent_asr",
      title: "验收短视频 B",
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
      style: "practical",
      duration_seconds: 60,
      goal: "lead_generation",
      title: "验收脚本 A",
      rewritten_copy: "A 租户脚本",
      hook: "A 租户开场",
      shooting_script: [],
      cover_text_options: [],
      caption_options: [],
      tips: [],
      source_text_length: 10,
      prompt_version: "verify",
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
      style: "practical",
      duration_seconds: 60,
      goal: "lead_generation",
      title: "验收脚本 B",
      rewritten_copy: "B 租户脚本",
      hook: "B 租户开场",
      shooting_script: [],
      cover_text_options: [],
      caption_options: [],
      tips: [],
      source_text_length: 10,
      prompt_version: "verify",
      model_provider: "deepseek",
      model_name: "deepseek-chat",
      status: "completed",
    },
  ]);

  await insert("ai_call_logs", [
    {
      id: fixture.scriptA,
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
      id: fixture.scriptB,
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

await seed();

const tenantAToken = signToken({
  sub: fixture.authUserA,
  login_channel: "admin_web",
  roles: ["employee"],
  token_type: "auth",
});

console.log(JSON.stringify({
  tenant_a_token: tenantAToken,
  tenant_b_forbidden_ids: [
    fixture.tenantB,
    fixture.employeeB,
    fixture.customerB,
    fixture.projectB,
    fixture.expenseB,
    fixture.acceptanceB,
    fixture.cameraB,
    fixture.transcriptionB,
    fixture.scriptB,
  ].join(","),
  tenant_b_expense_request_id: fixture.expenseB,
  tenant_b_project_acceptance_id: fixture.acceptanceB,
  tenant_b_project_id: fixture.projectB,
  tenant_b_camera_id: fixture.cameraB,
  tenant_b_social_video_transcription_id: fixture.transcriptionB,
}, null, 2));
