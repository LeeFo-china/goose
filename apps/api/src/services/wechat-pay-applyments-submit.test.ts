import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";
import { encryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const rootSecret = "tenant-submit-test-root-secret";
const updatedAt = "2026-07-23T13:29:00.000Z";
const requiredAttachments = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
].map((category) => ({
  category,
  object_key: `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/${category}.jpg`,
  content_type: "image/jpeg",
  size: 1024,
  ocr_review_status: "manual",
}));
const completeSensitive = {
  identity_name: "张三",
  identity_number: "41000019900101001X",
  identity_address: "河南省信阳市固始县示例路1号",
  contact_name: "李四",
  contact_phone: "13800000000",
  contact_email: "admin@example.com",
  contact_identity_number: null,
  contact_identity_address: null,
  bank_account_name: "固始晴天装饰工程有限公司",
  bank_account_number: "6212345678901234",
};

function applyment(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    application_no: "WPA202607230001",
    status: "draft",
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    merchant_short_name: "晴天装饰",
    license_name: "固始晴天装饰工程有限公司",
    license_code: "91411525MA00000000",
    legal_representative_name: "张三",
    identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
    identity_address_masked: "河南省信阳市***1号",
    identity_period_begin: "2020-01-01",
    identity_period_end: "2040-01-01",
    contact_type: "LEGAL",
    super_admin_name: "李四",
    super_admin_phone_masked: "138****0000",
    super_admin_email: "admin@example.com",
    service_phone: "0376-1234567",
    settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    settlement_account_name: "固始晴天装饰工程有限公司",
    settlement_bank_name: "中国银行",
    settlement_account_number_masked: "62**********1234",
    settlement_account_summary: "中国银行 尾号 1234",
    settlement_id: "716",
    qualification_type: "零售批发/生活娱乐/网上商城/其他",
    business_scene_description: "装修项目收款",
    contact_address: "河南省信阳市固始县",
    attachments: requiredAttachments,
    has_sensitive_payload: true,
    sensitive_payload_version: 1,
    submitted_at: null,
    updated_at: updatedAt,
    ...overrides,
  } as WechatPayApplymentRecord;
}

const findById = mock(async () => applyment() as WechatPayApplymentRecord | null);
const findSensitivePayloadById = mock(async () => ({
  id: applymentId,
  tenant_id: tenantId,
  has_sensitive_payload: true,
  sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
    context: { tenantId, applymentId, version: 1 },
    payload: completeSensitive,
    rootSecret,
  }),
  sensitive_payload_version: 1,
}));
const findOcrRecognitionsByIds = mock(async () => [] as Array<{
  id: string;
  tenant_id: string;
  file_object_id: string;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
}>);
const submitAtomically = mock(async () =>
  applyment({ status: "submitted", submitted_at: updatedAt })
);
const updateApplyment = mock(async () => applyment());
const insertEvent = mock(async () => ({} as WechatPayApplymentEventRecord));

const authContext: AuthContext = {
  authUserId: "auth-1",
  employeeId,
  tenantId,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "ADMIN",
  departmentName: "管理部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
};

async function createService() {
  const { WechatPayApplymentService } = await import("./wechat-pay-applyments");
  return new WechatPayApplymentService({
    repository: {
      findLatestByTenant: async () => applyment(),
      findById,
      findSensitivePayloadById,
      createApplyment: async () => applyment(),
      updateApplyment,
      submitTenantApplymentAtomically: submitAtomically,
      activateConfigAtomically: async () => applyment(),
      insertEvent,
      findEvents: async () => [],
      listApplyments: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    },
    configRepository: {
      upsertWechatPayConfig: async () => ({} as WechatPayConfigRecord),
      updateWechatPayConfig: async () => ({} as WechatPayConfigRecord),
    },
    accessPolicyService: {
      assertTenantContext: () => tenantId,
      hasPermission: () => true,
    },
    ocrRecognitionRepository: {
      findByIdsForTenant: findOcrRecognitionsByIds,
    },
    encryptionRootSecretFactory: () => rootSecret,
  });
}

describe("WechatPayApplymentService tenant submit", () => {
  beforeEach(() => {
    for (const fn of [
      findById,
      findSensitivePayloadById,
      findOcrRecognitionsByIds,
      submitAtomically,
      updateApplyment,
      insertEvent,
    ]) fn.mockClear();
    findById.mockImplementation(async () => applyment());
    submitAtomically.mockImplementation(async () =>
      applyment({ status: "submitted", submitted_at: updatedAt })
    );
  });

  test("validates the key and returns committed retries without writes", async () => {
    const service = await createService();
    await expect(service.submit(authContext, applymentId, {
      idempotency_key: "99999999-9999-4999-8999-999999999999",
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_IDEMPOTENCY_MISMATCH",
    });
    findById.mockImplementationOnce(async () =>
      applyment({ status: "submitted", submitted_at: updatedAt })
    );
    const result = await service.submit(authContext, applymentId, {
      idempotency_key: applymentId,
    });
    expect(result.applyment?.status).toBe("submitted");
    expect(submitAtomically).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  test("submits only through the atomic repository boundary", async () => {
    const service = await createService();
    await service.submit(authContext, applymentId, {
      idempotency_key: applymentId,
      remark: "已补充资料",
    });
    expect(submitAtomically).toHaveBeenCalledWith({
      applymentId,
      tenantId,
      employeeId,
      idempotencyKey: applymentId,
      expectedUpdatedAt: updatedAt,
      remark: "已补充资料",
    });
    expect(updateApplyment).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  test("serializes concurrent retries to one transition and event", async () => {
    let transitionCount = 0;
    let eventCount = 0;
    let transitioned = false;
    submitAtomically.mockImplementation(async () => {
      if (!transitioned) {
        transitioned = true;
        transitionCount += 1;
        eventCount += 1;
      }
      return applyment({ status: "submitted", submitted_at: updatedAt });
    });
    const service = await createService();
    await Promise.all([
      service.submit(authContext, applymentId, { idempotency_key: applymentId }),
      service.submit(authContext, applymentId, { idempotency_key: applymentId }),
    ]);
    expect(submitAtomically).toHaveBeenCalledTimes(2);
    expect({ transitionCount, eventCount }).toEqual({
      transitionCount: 1,
      eventCount: 1,
    });
  });

  test("rejects partial sensitive data and enterprise personal accounts", async () => {
    findSensitivePayloadById.mockImplementationOnce(async () => ({
      id: applymentId,
      tenant_id: tenantId,
      has_sensitive_payload: true,
      sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
        context: { tenantId, applymentId, version: 1 },
        payload: { identity_name: "张三" },
        rootSecret,
      }),
      sensitive_payload_version: 1,
    }));
    const service = await createService();
    await expect(service.submit(authContext, applymentId, {
      idempotency_key: applymentId,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_SENSITIVE_FIELDS_MISSING",
    });
    findById.mockImplementationOnce(async () => applyment({
      settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
    }));
    await expect(service.submit(authContext, applymentId, {
      idempotency_key: applymentId,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_SUBMISSION_CONTENT_INVALID",
      details: {
        blockers: expect.arrayContaining([{
          code: "APPLYMENT_ENTERPRISE_ACCOUNT_TYPE_INVALID",
          field: "settlement_account_type",
        }]),
      },
    });
    expect(submitAtomically).not.toHaveBeenCalled();
  });

  test("requires OCR review and matching confirmed recognition ownership", async () => {
    findById.mockImplementationOnce(async () => applyment({
      attachments: requiredAttachments.map((item, index) =>
        index === 0
          ? { ...item, ocr_review_status: "review_required" }
          : item
      ),
    }));
    const service = await createService();
    await expect(service.submit(authContext, applymentId, {
      idempotency_key: applymentId,
    })).rejects.toMatchObject({
      details: {
        blockers: expect.arrayContaining([{
          code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED",
          category: "license_copy",
        }]),
      },
    });

    const recognitionId = "66666666-6666-4666-8666-666666666666";
    const fileObjectId = "77777777-7777-4777-8777-777777777777";
    findById.mockImplementationOnce(async () => applyment({
      attachments: requiredAttachments.map((item, index) =>
        index === 0
          ? {
            ...item,
            file_object_id: fileObjectId,
            ocr_recognition_id: recognitionId,
            ocr_review_status: "confirmed",
          }
          : item
      ),
    }));
    findOcrRecognitionsByIds.mockImplementationOnce(async () => [{
      id: recognitionId,
      tenant_id: tenantId,
      file_object_id: "88888888-8888-4888-8888-888888888888",
      subject_type: "wechat_pay_applyment",
      subject_id: applymentId,
      status: "succeeded",
    }]);
    await expect(service.submit(authContext, applymentId, {
      idempotency_key: applymentId,
    })).rejects.toMatchObject({
      details: {
        blockers: expect.arrayContaining([{
          code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
          category: "license_copy",
        }]),
      },
    });
    expect(submitAtomically).not.toHaveBeenCalled();
  });
});
