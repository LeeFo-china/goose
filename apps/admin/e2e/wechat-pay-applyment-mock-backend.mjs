import { createServer } from "node:http";
import {
  getMockAttachmentReadinessBlockers,
  initialApplyment,
  mockOcrRecognitions,
  mockTenantId,
} from "./wechat-pay-applyment-mock-fixture.mjs";

const port = Number.parseInt(
  process.env.WECHAT_PAY_APPLYMENT_MOCK_BACKEND_PORT || "3998",
  10,
);
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
    id: mockTenantId,
    name: "复核测试商户",
    slug: "applyment-review-test",
    status: "active",
  },
  roles: ["tenant_admin"],
  permissions: [{ code: "finance.read", scope: "all" }],
  token: "mock-admin-token",
  expires_at: "2026-12-31T23:59:59+08:00",
};

let applyment = structuredClone(initialApplyment);
let startedSaves = [];
let committedSaves = [];
let nextSaveDelayMs = 0;
let injectedReadinessBlockers = [];
let uploadSequence = 0;
let recognitionSequence = 0;
let failNextRecognition = false;
let uploadedFiles = new Map();
let recognitions = new Map(
  mockOcrRecognitions.map((recognition) => [recognition.id, recognition]),
);
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

function applymentDetail() {
  const blockers = deduplicateBlockers([
    ...getMockAttachmentReadinessBlockers(
      applyment,
      Array.from(recognitions.values()),
    ),
    ...injectedReadinessBlockers,
  ]);
  const ready = blockers.length === 0;
  const canEdit = ["draft", "rejected", "wechat_editing"].includes(
    applyment.status,
  );
  return {
    applyment,
    events: [],
    can_edit: canEdit,
    can_submit: canEdit && ready,
    available_actions: [],
    submission_readiness: {
      ready,
      review_ready: ready,
      blockers,
    },
  };
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
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    await readBody(request);
    applyment = structuredClone(initialApplyment);
    startedSaves = [];
    committedSaves = [];
    nextSaveDelayMs = 0;
    injectedReadinessBlockers = [];
    uploadSequence = 0;
    recognitionSequence = 0;
    failNextRecognition = false;
    uploadedFiles = new Map();
    recognitions = new Map(
      mockOcrRecognitions.map((recognition) => [recognition.id, recognition]),
    );
    sendJson(response, 200, { success: true });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/__test/fail-next-recognition"
  ) {
    await readBody(request);
    failNextRecognition = true;
    sendJson(response, 200, { success: true });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/__test/readiness"
  ) {
    const body = JSON.parse(await readBody(request) || "{}");
    injectedReadinessBlockers = Array.isArray(body.blockers)
      ? structuredClone(body.blockers)
      : [];
    sendJson(response, 200, { success: true });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/__test/delay-next-save"
  ) {
    const body = JSON.parse(await readBody(request) || "{}");
    nextSaveDelayMs = Number(body.milliseconds) || 0;
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__test/saves") {
    sendJson(response, 200, {
      started: startedSaves,
      committed: committedSaves,
    });
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
      data: applymentDetail(),
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname ===
      `/finance/wechat-pay/applyments/${applyment.id}/draft-session`
  ) {
    applyment = {
      ...applyment,
      draft_epoch: applyment.draft_epoch + 1,
      draft_revision: 0,
    };
    sendJson(response, 200, {
      success: true,
      data: applymentDetail(),
    });
    return;
  }
  if (
    request.method === "PUT" &&
    url.pathname === `/finance/wechat-pay/applyments/${applyment.id}`
  ) {
    const payload = JSON.parse(await readBody(request) || "{}");
    startedSaves.push(structuredClone(payload));
    const delayMs = nextSaveDelayMs;
    nextSaveDelayMs = 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const incomingEpoch = Number(payload.draft_epoch);
    const incomingRevision = Number(payload.draft_revision);
    const outcome = !Number.isSafeInteger(incomingEpoch) ||
        incomingEpoch !== applyment.draft_epoch
      ? "stale_epoch"
      : !Number.isSafeInteger(incomingRevision) ||
          incomingRevision <= applyment.draft_revision
      ? "same_or_older_revision"
      : "applied";
    if (outcome === "applied") {
      const {
        draft_update_source: _draftUpdateSource,
        draft_epoch: _draftEpoch,
        draft_revision: _draftRevision,
        ...draftFields
      } = payload;
      applyment = {
        ...applyment,
        ...draftFields,
        draft_revision: incomingRevision,
        updated_at: new Date().toISOString(),
      };
    }
    committedSaves.push(structuredClone({
      ...payload,
      outcome,
      server_draft_epoch: applyment.draft_epoch,
      server_draft_revision: applyment.draft_revision,
    }));
    if (outcome === "stale_epoch") {
      sendJson(response, 409, {
        success: false,
        code: "WECHAT_PAY_APPLYMENT_DRAFT_SESSION_STALE",
        message: "其他页面已接管当前草稿，请刷新页面后继续",
      });
      return;
    }
    sendJson(response, 200, {
      success: true,
      data: applymentDetail(),
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
    request.method === "POST" &&
    url.pathname === "/uploads/cos/direct-init"
  ) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (payload.scene !== "wechat_pay_applyment") {
      sendJson(response, 400, {
        success: false,
        message: "Mock upload scene mismatch",
      });
      return;
    }
    uploadSequence += 1;
    const suffix = String(uploadSequence).padStart(12, "0");
    const fileId = `40000000-0000-4000-8000-${suffix}`;
    const objectKey =
      `tenants/${mockTenantId}/wechat-pay-applyment/${fileId}.png`;
    uploadedFiles.set(objectKey, {
      fileId,
      sequence: uploadSequence,
      contentType: payload.mimetype || "image/png",
      size: Number(payload.size_bytes) || 68,
      uploadIntent: `mock-upload-intent-${uploadSequence}`,
      putCompleted: false,
      directCompleteCompleted: false,
    });
    sendJson(response, 200, {
      success: true,
      data: {
        object_key: objectKey,
        storage_path: objectKey,
        upload_url: `/api/backend/__test/cos-upload/${uploadSequence}`,
        method: "PUT",
        headers: {
          "content-type": payload.mimetype || "image/png",
        },
        upload_intent: `mock-upload-intent-${uploadSequence}`,
      },
    });
    return;
  }
  if (
    request.method === "PUT" &&
    /^\/__test\/cos-upload\/\d+$/.test(url.pathname)
  ) {
    await readBody(request);
    const sequence = Number(url.pathname.split("/").at(-1));
    const uploaded = Array.from(uploadedFiles.values()).find(
      (candidate) => candidate.sequence === sequence,
    );
    if (!uploaded) {
      sendJson(response, 404, {
        success: false,
        message: "Mock upload intent not found",
      });
      return;
    }
    uploaded.putCompleted = true;
    response.writeHead(200, { etag: `"mock-etag-${sequence}"` });
    response.end();
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/uploads/cos/direct-complete"
  ) {
    const payload = JSON.parse(await readBody(request) || "{}");
    const uploaded = uploadedFiles.get(payload.object_key);
    if (
      !uploaded ||
      payload.scene !== "wechat_pay_applyment" ||
      payload.upload_intent !== uploaded.uploadIntent ||
      !uploaded.putCompleted
    ) {
      sendJson(response, 409, {
        success: false,
        message: "Mock upload sequence incomplete",
      });
      return;
    }
    uploaded.directCompleteCompleted = true;
    sendJson(response, 200, {
      success: true,
      data: {
        file_id: uploaded.fileId,
        object_key: payload.object_key,
        storage_path: payload.object_key,
      },
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/ocr/recognitions"
  ) {
    const payload = JSON.parse(await readBody(request) || "{}");
    recognitionSequence += 1;
    const uploaded = Array.from(uploadedFiles.values()).find(
      (candidate) => candidate.fileId === payload.file_object_id,
    );
    if (
      payload.scene !== "wechat_pay_applyment" ||
      !uploaded?.directCompleteCompleted ||
      typeof payload.idempotency_key !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(payload.idempotency_key)
    ) {
      sendJson(response, 400, {
        success: false,
        message: "Mock OCR request contract mismatch",
      });
      return;
    }
    if (failNextRecognition) {
      failNextRecognition = false;
      sendJson(response, 502, {
        success: false,
        code: "OCR_PROVIDER_UNAVAILABLE",
        message: "证照识别失败",
      });
      return;
    }
    const suffix = String(recognitionSequence).padStart(12, "0");
    const recognition = {
      id: `50000000-0000-4000-8000-${suffix}`,
      tenant_id: mockTenantId,
      status: "succeeded",
      scene: "wechat_pay_applyment",
      document_type: payload.document_type,
      file_object_id: payload.file_object_id,
      subject_type: payload.subject_type ?? null,
      subject_id: payload.subject_id ?? null,
      provider_request_id: `mock-provider-${recognitionSequence}`,
      expires_at: "2026-07-24T23:59:59+08:00",
      fields: [{
        key: "license_name",
        label: "营业执照主体名称",
        value: `OCR 识别主体 ${recognitionSequence}`,
        normalized: true,
        sensitive: false,
        confidence: 0.99,
      }],
      warnings: [],
    };
    recognitions.set(recognition.id, recognition);
    sendJson(response, 200, {
      success: true,
      data: {
        recognition,
        idempotent: false,
        cached: false,
      },
    });
    return;
  }
  if (
    request.method === "GET" &&
    /^\/ocr\/recognitions\/[^/]+$/.test(url.pathname)
  ) {
    const recognitionId = decodeURIComponent(
      url.pathname.slice("/ocr/recognitions/".length),
    );
    const recognition = recognitions.get(recognitionId);
    if (!recognition) {
      sendJson(response, 404, {
        success: false,
        message: "Mock OCR recognition not found",
      });
      return;
    }
    sendJson(response, 200, { success: true, data: recognition });
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

function deduplicateBlockers(blockers) {
  const seen = new Set();
  return blockers.filter((blocker) => {
    const key = JSON.stringify(blocker);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
