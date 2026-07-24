import { describe, expect, mock, test } from "bun:test";

import type { OcrPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import {
  assertTenantApplymentAttachmentsOwned,
} from "@/services/wechat-pay-applyment-attachment-ownership";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const otherEmployeeId = "33333333-3333-4333-8333-333333333333";
const fileObjectId = "44444444-4444-4444-8444-444444444444";
const objectKey = `tenants/${tenantId}/wechat_pay_applyment/license.jpg`;

function file(
  overrides: Partial<OcrPlatformFileObjectRecord> = {},
): OcrPlatformFileObjectRecord {
  return {
    id: fileObjectId,
    tenant_id: tenantId,
    owner_type: "tenant",
    owner_id: tenantId,
    scene: "wechat_pay_applyment",
    provider: "tencent_cos",
    bucket: "private-bucket",
    region: "ap-guangzhou",
    object_key: objectKey,
    mime_type: "image/jpeg",
    size_bytes: 1024,
    checksum: "checksum",
    visibility: "private",
    status: "active",
    deleted_at: null,
    created_by_employee_id: employeeId,
    ...overrides,
  };
}

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    category: "license_copy",
    file_object_id: fileObjectId,
    object_key: objectKey,
    ...overrides,
  };
}

function repository(records: OcrPlatformFileObjectRecord[]) {
  return {
    findActiveByIds: mock(async () => records),
  };
}

describe("tenant WeChat Pay applyment attachment ownership", () => {
  test("accepts an active matching file uploaded by the current employee", async () => {
    const fileRepository = repository([file()]);

    await assertTenantApplymentAttachmentsOwned({
      attachments: [attachment()],
      currentAttachments: [],
      tenantId,
      employeeId,
      fileRepository,
    });

    expect(fileRepository.findActiveByIds).toHaveBeenCalledWith({
      ids: [fileObjectId],
      tenantId,
      limit: 20,
    });
  });

  test("keeps a matching file already bound to the current applyment", async () => {
    await expect(assertTenantApplymentAttachmentsOwned({
      attachments: [attachment()],
      currentAttachments: [attachment()],
      tenantId,
      employeeId,
      fileRepository: repository([
        file({ created_by_employee_id: otherEmployeeId }),
      ]),
    })).resolves.toBeUndefined();
  });

  test("keeps an unchanged legacy attachment inert when it has no file id", async () => {
    const legacyAttachment = { object_key: "legacy/license.jpg" };

    await expect(assertTenantApplymentAttachmentsOwned({
      attachments: [legacyAttachment],
      currentAttachments: [legacyAttachment],
      tenantId,
      employeeId,
      fileRepository: repository([]),
    })).resolves.toBeUndefined();
  });

  test("rejects binding another employee's unbound private file", async () => {
    await expect(assertTenantApplymentAttachmentsOwned({
      attachments: [attachment()],
      currentAttachments: [],
      tenantId,
      employeeId,
      fileRepository: repository([
        file({ created_by_employee_id: otherEmployeeId }),
      ]),
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "WECHAT_PAY_APPLYMENT_ATTACHMENT_ACCESS_DENIED",
    });
  });

  test("rejects a mismatched object key or upload scene", async () => {
    for (const record of [
      file({ object_key: `${objectKey}.other` }),
      file({ scene: "expense_request" }),
    ]) {
      await expect(assertTenantApplymentAttachmentsOwned({
        attachments: [attachment()],
        currentAttachments: [],
        tenantId,
        employeeId,
        fileRepository: repository([record]),
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "WECHAT_PAY_APPLYMENT_ATTACHMENT_FILE_INVALID",
      });
    }
  });

  test("rejects missing file identity and inactive or absent files", async () => {
    await expect(assertTenantApplymentAttachmentsOwned({
      attachments: [{ object_key: objectKey }],
      currentAttachments: [],
      tenantId,
      employeeId,
      fileRepository: repository([]),
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_PAY_APPLYMENT_ATTACHMENT_FILE_INVALID",
    });
    await expect(assertTenantApplymentAttachmentsOwned({
      attachments: [attachment()],
      currentAttachments: [],
      tenantId,
      employeeId,
      fileRepository: repository([]),
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_PAY_APPLYMENT_ATTACHMENT_FILE_INVALID",
    });
  });
});
