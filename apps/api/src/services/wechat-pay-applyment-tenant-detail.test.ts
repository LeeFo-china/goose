import { describe, expect, mock, test } from "bun:test";
import type {
  WechatPayApplymentSensitiveRecord,
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import { encryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";
import { buildTenantApplymentDetail } from "@/services/wechat-pay-applyment-tenant-detail";

const applyment = {
  id: "33333333-3333-4333-8333-333333333333",
  tenant_id: "11111111-1111-4111-8111-111111111111",
  status: "draft",
  has_sensitive_payload: true,
  sensitive_payload_version: 1,
} as WechatPayApplymentRecord;
const events = [] as WechatPayApplymentEventRecord[];
const rootSecret = "tenant-detail-sensitive-root-secret";
const sensitivePayload = {
  identity_name: "张三",
  identity_number: "41000019900101001X",
  identity_address: "河南省信阳市固始县示例路1号",
  contact_name: "张三",
  contact_phone: "13800000000",
  contact_email: "admin@example.com",
  contact_identity_number: "41000019920202002X",
  contact_identity_address: "河南省信阳市固始县经办人路2号",
  bank_account_name: "固始晴天装饰工程有限公司",
  bank_account_number: "6212345678901234",
};

function buildRepository(
  findSensitivePayloadById = mock(
    async (): Promise<WechatPayApplymentSensitiveRecord | null> => ({
      id: applyment.id,
      tenant_id: applyment.tenant_id,
      has_sensitive_payload: true,
      sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
        context: {
          tenantId: applyment.tenant_id,
          applymentId: applyment.id,
          version: 1,
        },
        payload: sensitivePayload,
        rootSecret,
      }),
      sensitive_payload_version: 1,
    }),
  ),
) {
  return {
    findEvents: async () => events,
    findSensitivePayloadById,
  };
}

function tenantSigningApplyment(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    ...applyment,
    status: "signing",
    applyment_state: "signing",
    wechat_applyment_state_raw: "APPLYMENT_STATE_TO_BE_SIGNED",
    sign_url: "https://pay.weixin.qq.com/public/apply4ec_sign/s",
    has_sensitive_payload: false,
    sensitive_payload_version: null,
    ...overrides,
  } as WechatPayApplymentRecord;
}

function readyTenantReadinessService() {
  return {
    runForApplyment: mock(async () => ({
      ready: true,
      review_ready: true,
      blockers: [],
    })),
  };
}

describe("buildTenantApplymentDetail", () => {
  test("uses only tenant review readiness for the loaded applyment", async () => {
    const runForApplyment = mock(async () => ({
      ready: true,
      review_ready: true,
      blockers: [],
    }));
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: true,
      repository: buildRepository(),
      encryptionRootSecret: rootSecret,
      tenantReadinessService: { runForApplyment },
    });

    expect(runForApplyment).toHaveBeenCalledWith(applyment);
    expect(result.submission_readiness).toEqual({
      ready: true,
      review_ready: true,
      blockers: [],
    });
    expect(result.can_submit).toBe(true);
  });

  test("blocks submit for business readiness without changing edit permission", async () => {
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: true,
      repository: buildRepository(),
      encryptionRootSecret: rootSecret,
      tenantReadinessService: {
        runForApplyment: async () => ({
          ready: false,
          review_ready: false,
          blockers: [{
            code: "APPLYMENT_REQUIRED_FIELD_MISSING",
            field: "service_phone",
          }],
        }),
      },
    });

    expect(result.submission_readiness?.review_ready).toBe(false);
    expect(result.can_edit).toBe(true);
    expect(result.can_submit).toBe(false);
  });

  test("does not turn business readiness into tenant permission", async () => {
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: false,
      repository: buildRepository(),
      encryptionRootSecret: rootSecret,
      tenantReadinessService: {
        runForApplyment: async () => ({
          ready: true,
          review_ready: true,
          blockers: [],
        }),
      },
    });

    expect(result.submission_readiness?.review_ready).toBe(true);
    expect(result.can_edit).toBe(false);
    expect(result.can_submit).toBe(false);
  });

  test("hydrates editable tenant draft detail with sensitive OCR fields for review", async () => {
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: true,
      repository: buildRepository(),
      encryptionRootSecret: rootSecret,
      tenantReadinessService: {
        runForApplyment: async () => ({
          ready: true,
          review_ready: true,
          blockers: [],
        }),
      },
    });

    expect(result.applyment).toMatchObject({
      identity_name: sensitivePayload.identity_name,
      identity_number: sensitivePayload.identity_number,
      identity_address: sensitivePayload.identity_address,
      contact_identity_number: sensitivePayload.contact_identity_number,
      contact_identity_address: sensitivePayload.contact_identity_address,
      settlement_account_number: sensitivePayload.bank_account_number,
    });
    expect(JSON.stringify(result.applyment)).not.toContain(
      "sensitive_payload_ciphertext",
    );
  });

  test("does not hydrate sensitive fields for read-only tenant detail", async () => {
    const findSensitivePayloadById = mock(
      async (): Promise<WechatPayApplymentSensitiveRecord | null> => null,
    );
    const result = await buildTenantApplymentDetail({
      applyment,
      canEdit: false,
      repository: buildRepository(findSensitivePayloadById),
      encryptionRootSecret: rootSecret,
      tenantReadinessService: {
        runForApplyment: async () => ({
          ready: true,
          review_ready: true,
          blockers: [],
        }),
      },
    });

    expect(findSensitivePayloadById).not.toHaveBeenCalled();
    expect(result.applyment).not.toHaveProperty("identity_number");
    expect(result.applyment).not.toHaveProperty("settlement_account_number");
  });

  test("exposes the WeChat sign link as a tenant action", async () => {
    const signUrl = "https://pay.weixin.qq.com/public/apply4ec_sign/s";
    const result = await buildTenantApplymentDetail({
      applyment: tenantSigningApplyment({ sign_url: signUrl }),
      canEdit: false,
      repository: buildRepository(mock(async () => null)),
      encryptionRootSecret: null,
      tenantReadinessService: readyTenantReadinessService(),
    });

    expect(result.can_edit).toBe(false);
    expect(result.available_actions).toContainEqual({
      key: "open_sign_url",
      label: "打开签约链接",
      url: signUrl,
    });
  });

  test("does not expose an empty or stale tenant sign link", async () => {
    const result = await buildTenantApplymentDetail({
      applyment: tenantSigningApplyment({
        wechat_applyment_state_raw: "APPLYMENT_STATE_FINISHED",
      }),
      canEdit: false,
      repository: buildRepository(mock(async () => null)),
      encryptionRootSecret: null,
      tenantReadinessService: readyTenantReadinessService(),
    });

    expect(result.available_actions).toEqual([]);
  });
});
