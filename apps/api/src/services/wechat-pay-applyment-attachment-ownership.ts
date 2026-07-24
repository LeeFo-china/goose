import { Errors } from "@/errors/error-factory";
import type {
  WechatPayApplymentFileObjectRepositoryPort,
} from "@/services/wechat-pay-applyments-types";

type ApplymentAttachmentIdentity = {
  file_object_id?: string | null;
  object_key: string;
};

const ATTACHMENT_LIMIT = 20;
const APPLYMENT_SCENE = "wechat_pay_applyment";

export async function assertTenantApplymentAttachmentsOwned(input: {
  attachments?: readonly ApplymentAttachmentIdentity[];
  currentAttachments: unknown;
  tenantId: string;
  employeeId: string;
  fileRepository: WechatPayApplymentFileObjectRepositoryPort;
}): Promise<void> {
  if (input.attachments === undefined || input.attachments.length === 0) return;
  const currentAttachments = readCurrentAttachments(input.currentAttachments);
  const identifiedAttachments = input.attachments.filter((attachment) => {
    if (attachment.file_object_id?.trim()) return true;
    if (currentAttachments.legacyObjectKeys.has(attachment.object_key)) {
      return false;
    }
    throwInvalidAttachment();
  });
  if (identifiedAttachments.length === 0) return;
  const fileIds = identifiedAttachments.map((attachment) =>
    attachment.file_object_id?.trim()
  );
  const ids = [...new Set(
    fileIds.filter((fileId): fileId is string => Boolean(fileId)),
  )];
  const files = await input.fileRepository.findActiveByIds({
    ids,
    tenantId: input.tenantId,
    limit: ATTACHMENT_LIMIT,
  });
  const fileById = new Map(files.map((file) => [file.id, file]));

  for (const attachment of identifiedAttachments) {
    const fileId = attachment.file_object_id as string;
    const file = fileById.get(fileId);
    if (
      !file ||
      file.tenant_id !== input.tenantId ||
      file.scene !== APPLYMENT_SCENE ||
      file.object_key !== attachment.object_key
    ) {
      throwInvalidAttachment();
    }
    if (
      file.created_by_employee_id !== input.employeeId &&
      !currentAttachments.fileBindings.has(
        bindingKey(fileId, attachment.object_key),
      )
    ) {
      throw Errors.business(
        403,
        "无权绑定其他员工上传的微信支付进件附件",
        "WECHAT_PAY_APPLYMENT_ATTACHMENT_ACCESS_DENIED",
      );
    }
  }
}

function readCurrentAttachments(value: unknown) {
  const fileBindings = new Set<string>();
  const legacyObjectKeys = new Set<string>();
  if (!Array.isArray(value)) return { fileBindings, legacyObjectKeys };
  for (const attachment of value) {
    if (!attachment || typeof attachment !== "object") continue;
    const record = attachment as Record<string, unknown>;
    if (typeof record.object_key !== "string") continue;
    if (typeof record.file_object_id === "string") {
      fileBindings.add(bindingKey(record.file_object_id, record.object_key));
    } else {
      legacyObjectKeys.add(record.object_key);
    }
  }
  return { fileBindings, legacyObjectKeys };
}

function bindingKey(fileObjectId: string, objectKey: string): string {
  return `${fileObjectId}:${objectKey}`;
}

function throwInvalidAttachment(): never {
  throw Errors.business(
    400,
    "微信支付进件附件与已上传文件不匹配",
    "WECHAT_PAY_APPLYMENT_ATTACHMENT_FILE_INVALID",
  );
}
