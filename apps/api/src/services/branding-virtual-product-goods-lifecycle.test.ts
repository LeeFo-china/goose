import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { BrandingAddonProductRecord } from
  "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from
  "@/repositories/branding-virtual-products";
import { PlatformAuditLogActionSchema } from "@/schema/platform-audit-logs";
import type { AuthContext } from "@/services/authorization";
import { BrandingVirtualProductGoodsLifecycleService } from
  "@/services/branding-virtual-product-goods-lifecycle";
import type {
  QueryVirtualGoodsPublishResult,
  QueryVirtualGoodsUploadResult,
} from "@/services/wechat-virtual-payment-gateway-contracts";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_URL = "https://cdn.example.test/branding.png";

const auth = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.payment.config.manage", scope: "all" }],
} satisfies AuthContext;

const product = {
  id: PRODUCT_ID,
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: true,
  purchase_mode: "maintenance",
  version: 4,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
} satisfies BrandingAddonProductRecord;

const mapping = {
  id: "44444444-4444-4444-8444-444444444444",
  addon_product_id: PRODUCT_ID,
  provider: "wechat_virtual",
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  item_url: ITEM_URL,
  goods_quantity: 1,
  expected_amount_fen: 9_900,
  encrypted_secret_ref:
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  secret_revision: 2,
  status: "draft",
  validation_status: "pending",
  validated_at: null,
  version: 3,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
} satisfies BrandingVirtualProductRecord;

const uploadItem = {
  id: mapping.provider_product_id,
  name: product.name,
  price: mapping.expected_amount_fen,
  remark: product.purchase_notes,
  itemUrl: ITEM_URL,
  uploadStatus: 2 as const,
};
const uploadSuccess = uploadTask(3, [uploadItem]);
const publishSuccess = publishTask(3, [{
  id: mapping.provider_product_id,
  publishStatus: 2 as const,
}]);

function uploadTask(
  status: 0 | 1 | 2 | 3,
  items: QueryVirtualGoodsUploadResult["items"] = [],
): QueryVirtualGoodsUploadResult {
  return {
    requestId: "upload-request-id",
    environment: "production",
    status,
    items,
  };
}

function publishTask(
  status: 0 | 1 | 2 | 3,
  items: QueryVirtualGoodsPublishResult["items"] = [],
): QueryVirtualGoodsPublishResult {
  return {
    requestId: "publish-request-id",
    environment: "production",
    status,
    items,
  };
}

function createFixture(options: {
  currentMapping?: BrandingVirtualProductRecord | null;
  upload?: QueryVirtualGoodsUploadResult;
  publish?: QueryVirtualGoodsPublishResult;
  startUploadError?: unknown;
  uploadAfterStartError?: QueryVirtualGoodsUploadResult;
} = {}) {
  const getManagementSnapshot = mock(async () => ({
    product,
    mappings: options.currentMapping === null
      ? []
      : [options.currentMapping ?? mapping],
  }));
  const getPlatformSecretStrings = mock(async () => ({
    WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: JSON.stringify({
      appKey: "production-secret",
      revision: 2,
    }),
    WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE: "",
  }));
  const assertPermission = mock(() => "all" as const);
  const recordBestEffort = mock(async () => null);
  const getAccessToken = mock(async () => "access-token-sensitive");
  let uploadQueries = 0;
  const queryUploadGoods = mock(async () => {
    uploadQueries += 1;
    if (uploadQueries > 1 && options.uploadAfterStartError) {
      return options.uploadAfterStartError;
    }
    return options.upload ?? uploadTask(0);
  });
  const queryPublishGoods = mock(async () => options.publish ?? publishTask(0));
  const startUploadGoods = mock(async () => {
    if (options.startUploadError) throw options.startUploadError;
    return {
      accepted: true as const,
      requestId: "start-upload-request-id",
      environment: "production" as const,
    };
  });
  const startPublishGoods = mock(async () => ({
    accepted: true as const,
    requestId: "start-publish-request-id",
    environment: "production" as const,
  }));
  const service = new BrandingVirtualProductGoodsLifecycleService({
    virtualProductRepository: { getManagementSnapshot },
    settingsService: { getPlatformSecretStrings },
    accessPolicy: { assertPermission },
    audit: { recordBestEffort },
    accessTokenProvider: { getAccessToken },
    gateway: {
      queryUploadGoods,
      queryPublishGoods,
      startUploadGoods,
      startPublishGoods,
    },
  });
  return {
    service,
    getManagementSnapshot,
    getPlatformSecretStrings,
    recordBestEffort,
    getAccessToken,
    queryUploadGoods,
    queryPublishGoods,
    startUploadGoods,
    startPublishGoods,
  };
}

describe("BrandingVirtualProductGoodsLifecycleService status", () => {
  test.each([
    [
      "no task",
      uploadTask(0),
      publishTask(0),
      "not_started",
      "not_started",
      "upload",
      null,
    ],
    [
      "upload processing",
      uploadTask(1),
      publishTask(0),
      "processing",
      "not_started",
      "wait_upload",
      2_000,
    ],
    [
      "ready to publish",
      uploadSuccess,
      publishTask(0),
      "succeeded",
      "not_started",
      "publish",
      null,
    ],
    [
      "ready to validate",
      uploadSuccess,
      publishSuccess,
      "succeeded",
      "succeeded",
      "validate",
      null,
    ],
  ] as const)("maps %s to a safe next action", async (
    _label,
    upload,
    publish,
    uploadState,
    publishState,
    nextAction,
    pollAfterMs,
  ) => {
    const fixture = createFixture({ upload, publish });

    await expect(fixture.service.getStatus(auth, "production"))
      .resolves.toEqual({
        environment: "production",
        mapping_version: 3,
        upload: {
          state: uploadState,
          task_status: upload.status,
          item_status: upload.items[0]?.uploadStatus ?? null,
          request_id: "upload-request-id",
        },
        publish: {
          state: publishState,
          task_status: publish.status,
          item_status: publish.items[0]?.publishStatus ?? null,
          request_id: "publish-request-id",
        },
        next_action: nextAction,
        poll_after_ms: pollAfterMs,
      });
  });

  test("marks a stale successful upload as mismatch", async () => {
    const fixture = createFixture({
      upload: uploadTask(3, [{ ...uploadItem, price: 8_800 }]),
      publish: publishSuccess,
    });

    await expect(fixture.service.getStatus(auth, "production"))
      .resolves.toMatchObject({
        upload: { state: "mismatch" },
        next_action: "upload",
        poll_after_ms: null,
      });
  });
});

describe("BrandingVirtualProductGoodsLifecycleService commands", () => {
  test("starts upload only after a no-task preflight and audits safe metadata", async () => {
    const fixture = createFixture();

    await expect(fixture.service.startUpload(auth, {
      environment: "production",
      version: 3,
    })).resolves.toEqual({
      outcome: "accepted",
      phase: "upload",
      environment: "production",
      mapping_version: 3,
      request_id: "start-upload-request-id",
    });
    expect(fixture.startUploadGoods).toHaveBeenCalledWith({
      accessToken: "access-token-sensitive",
      environment: "production",
      signingSecret: {
        environment: "production",
        appKey: "production-secret",
      },
      item: {
        id: mapping.provider_product_id,
        name: product.name,
        price: mapping.expected_amount_fen,
        remark: product.purchase_notes,
        itemUrl: ITEM_URL,
      },
    });
    expect(fixture.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      action: "branding_virtual_product.upload",
      metadata: {
        environment: "production",
        mapping_version: 3,
        provider_product_id: "branding-annual",
        outcome: "accepted",
        request_id: "start-upload-request-id",
      },
    }));
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain("production-secret");
  });

  test("does not duplicate a running upload", async () => {
    const fixture = createFixture({ upload: uploadTask(1) });

    await expect(fixture.service.startUpload(auth, {
      environment: "production",
      version: 3,
    })).resolves.toMatchObject({
      outcome: "already_processing",
      phase: "upload",
      request_id: "upload-request-id",
    });
    expect(fixture.startUploadGoods).not.toHaveBeenCalled();
  });

  test("requires the exact upload before publishing", async () => {
    const fixture = createFixture({ upload: uploadTask(0) });

    await expect(fixture.service.startPublish(auth, {
      environment: "production",
      version: 3,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED",
    });
    expect(fixture.queryPublishGoods).not.toHaveBeenCalled();
    expect(fixture.startPublishGoods).not.toHaveBeenCalled();
  });

  test("starts publish after the exact upload succeeds", async () => {
    const fixture = createFixture({ upload: uploadSuccess });

    await expect(fixture.service.startPublish(auth, {
      environment: "production",
      version: 3,
    })).resolves.toMatchObject({
      outcome: "accepted",
      phase: "publish",
      request_id: "start-publish-request-id",
    });
    expect(fixture.startPublishGoods).toHaveBeenCalledWith(expect.objectContaining({
      providerProductId: "branding-annual",
    }));
  });

  test("recovers a concurrent WeChat batch as already processing", async () => {
    const fixture = createFixture({
      startUploadError: Errors.business(
        502,
        "微信拒绝请求",
        "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
        { requestId: "race-request-id", wechatErrcode: 268490012 },
      ),
      uploadAfterStartError: uploadTask(1),
    });

    await expect(fixture.service.startUpload(auth, {
      environment: "production",
      version: 3,
    })).resolves.toMatchObject({
      outcome: "already_processing",
      request_id: "upload-request-id",
    });
    expect(fixture.queryUploadGoods).toHaveBeenCalledTimes(2);
  });

  test("does not recover an unrelated application error as a WeChat batch", async () => {
    const fixture = createFixture({
      startUploadError: Errors.business(
        502,
        "内部错误",
        "UNRELATED_APPLICATION_ERROR",
        { wechatErrcode: 268490012 },
      ),
      uploadAfterStartError: uploadTask(1),
    });

    await expect(fixture.service.startUpload(auth, {
      environment: "production",
      version: 3,
    })).rejects.toMatchObject({ code: "UNRELATED_APPLICATION_ERROR" });
    expect(fixture.queryUploadGoods).toHaveBeenCalledTimes(1);
  });

  test("rejects a stale mapping before requesting an access token", async () => {
    const fixture = createFixture();

    await expect(fixture.service.startUpload(auth, {
      environment: "production",
      version: 2,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
    });
    expect(fixture.getAccessToken).not.toHaveBeenCalled();
    expect(fixture.startUploadGoods).not.toHaveBeenCalled();
  });

  test("registers dedicated upload and publish audit actions", () => {
    for (const action of [
      "branding_virtual_product.upload",
      "branding_virtual_product.publish",
    ]) expect(PlatformAuditLogActionSchema.safeParse(action).success).toBe(true);
  });
});
