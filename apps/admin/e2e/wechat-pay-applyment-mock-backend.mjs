import { createServer } from "node:http";

const port = Number.parseInt(
  process.env.WECHAT_PAY_APPLYMENT_MOCK_BACKEND_PORT || "3998",
  10,
);
const now = "2026-07-23T10:30:00+08:00";
const session = {
  user_id: "mock-admin-user",
  login_channel: "admin_web",
  employee: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "测试管理员",
    phone: "18800000001",
    status: "active",
    tenant_department_id: null,
    department_name: "运营部",
    post_id: null,
    post_name: "管理员",
    avatar: null,
  },
  tenant: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "复核测试商户",
    slug: "applyment-review-test",
    status: "active",
  },
  roles: ["tenant_admin"],
  permissions: [{ code: "finance.read", scope: "all" }],
  token: "mock-admin-token",
  expires_at: "2026-12-31T23:59:59+08:00",
};

const attachmentCategories = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "settlement_account_proof",
];
const attachments = attachmentCategories.map((category, index) => ({
  category,
  file_object_id: `00000000-0000-4000-8000-00000000000${index}`,
  object_key: `tenants/mock/${category}.png`,
  file_name: `${category}.png`,
  content_type: "image/png",
  size: 68,
  ocr_recognition_id: null,
  ocr_review_status: "confirmed",
}));
const applyment = {
  id: "33333333-3333-4333-8333-333333333333",
  tenant_id: session.tenant.id,
  application_no: "WPA202607230001",
  status: "draft",
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
  merchant_short_name: "复核测试简称",
  license_name: "复核测试商户有限公司",
  license_code: "91410000TEST000001",
  license_address: "测试注册地址",
  license_period_begin: "2020-01-01",
  license_period_end: "长期",
  legal_representative_name: "测试法人",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
  identity_address_masked: "测试省测试市••••",
  identity_period_begin: "2020-01-01",
  identity_period_end: "长期",
  contact_type: "LEGAL",
  super_admin_name: "测试法人",
  super_admin_phone_masked: "138****1234",
  super_admin_email: "admin@example.com",
  contact_identity_doc_type: null,
  contact_identity_period_begin: null,
  contact_identity_period_end: null,
  service_phone: "4008001234",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
  settlement_account_name: "复核测试商户有限公司",
  settlement_account_number_masked: "6222••••1234",
  settlement_bank_name: "测试银行",
  settlement_bank_full_name: "测试银行营业部",
  settlement_bank_branch_id: "123456789012",
  settlement_account_summary: null,
  settlement_id: "716",
  qualification_type: "零售批发",
  business_scene_description: "线下家装服务",
  contact_address: "测试市测试区一号",
  attachments,
  remark: "待提交复核",
  has_sensitive_payload: true,
  rejected_reason: null,
  sub_mchid: null,
  created_at: now,
  updated_at: now,
};

const capabilities = [
  ["business_license", ["license_copy"]],
  [
    "id_card_front",
    ["legal_representative_id_card_front", "contact_id_card_front"],
  ],
  [
    "id_card_back",
    ["legal_representative_id_card_back", "contact_id_card_back"],
  ],
  ["bank_card", ["settlement_account_proof"]],
].map(([documentType, categories]) => ({
  scene: "wechat_pay_applyment",
  document_type: documentType,
  label: documentType,
  attachment_categories: categories,
  supported_mime_types: ["image/png", "image/jpeg"],
  max_size_bytes: 2 * 1024 * 1024,
  mode: "sync",
  output_fields: [],
}));

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    await readBody(request);
    sendJson(response, 200, { success: true, data: session });
    return;
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    sendJson(response, 200, { success: true, data: session });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/finance/wechat-pay/applyment/current"
  ) {
    sendJson(response, 200, {
      success: true,
      data: {
        applyment,
        events: [],
        can_edit: true,
        can_submit: true,
        available_actions: [],
        submission_readiness: {
          ready: true,
          review_ready: true,
          blockers: [],
        },
      },
    });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/ocr/capabilities"
  ) {
    sendJson(response, 200, { success: true, data: capabilities });
    return;
  }
  if (
    request.method === "GET" &&
    /^\/uploads\/files\/[^/]+\/preview$/.test(url.pathname)
  ) {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4+QAAAAASUVORK5CYII=",
      "base64",
    ));
    return;
  }
  if (request.method === "GET" && url.pathname === "/notifications/summary") {
    sendJson(response, 200, { success: true, data: { unread_count: 0 } });
    return;
  }
  if (request.method === "GET" && url.pathname === "/notifications") {
    sendJson(response, 200, {
      success: true,
      data: { list: [], pagination: { total: 0 } },
    });
    return;
  }

  sendJson(response, 404, {
    success: false,
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[wechat-pay-applyment-mock] listening on http://127.0.0.1:${port}`,
  );
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
