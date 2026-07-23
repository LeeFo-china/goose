import type {
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type {
  UpdateWechatPayApplymentInput,
} from "@/schema/wechat-pay-applyments";
import {
  getSensitiveReplacementFields,
} from "@/services/wechat-pay-applyment-draft";

// Only free-form narrative fields without identity, ownership, or settlement effect
// may suppress an autosave audit.
const LOW_RISK_AUTOSAVE_FIELDS = new Set([
  "business_scene_description",
  "remark",
]);

const INTERNAL_SERVER_PATCH_FIELDS = new Set<string>(
  [
    "has_sensitive_payload",
    "identity_address_masked",
    "sensitive_payload_ciphertext",
    "sensitive_payload_updated_at",
    "sensitive_payload_version",
    "settlement_account_number_masked",
    "super_admin_phone_masked",
    "updated_by_employee_id",
  ] satisfies readonly (keyof WechatPayApplymentUpdate)[],
);

const INTERNAL_DRAFT_INPUT_FIELDS = new Set([
  "draft_revision",
  "draft_update_source",
]);

const ATTACHMENT_COMPARE_FIELDS = [
  "category",
  "file_object_id",
  "object_key",
  "file_name",
  "content_type",
  "size",
  "ocr_recognition_id",
  "ocr_review_status",
] as const;

type ComparableAttachment = Partial<
  Record<(typeof ATTACHMENT_COMPARE_FIELDS)[number], unknown>
>;

type AttachmentChange = {
  before: ComparableAttachment | null;
  after: ComparableAttachment | null;
};

export function buildDraftChangeAudit(
  input: object,
  actualChangedFields?: readonly string[],
) {
  const changedFields = (
    actualChangedFields ??
      Object.keys(input).filter((field) => !INTERNAL_DRAFT_INPUT_FIELDS.has(field))
  ).toSorted();
  const changeSource = "draft_update_source" in input
    ? input.draft_update_source
    : undefined;
  const sensitiveReplacementFields = new Set(
    getSensitiveReplacementFields(input),
  );
  return {
    changed_fields: changedFields,
    change_source: changeSource ?? "manual_save",
    has_sensitive_replacement: changedFields.some((field) =>
      sensitiveReplacementFields.has(field)
    ),
  };
}

export function buildDraftAuditDecision(input: {
  current: WechatPayApplymentRecord;
  input: UpdateWechatPayApplymentInput;
  serverPatch?: WechatPayApplymentUpdate;
}) {
  const attachmentChanges = getAttachmentChanges(
    input.current.attachments,
    input.input.attachments,
  );
  const actualChangedFields = getActualChangedFields(
    input,
    attachmentChanges,
  );
  const metadata = buildDraftChangeAudit(input.input, actualChangedFields);
  const forcedAudit = actualChangedFields.some((field) =>
    !LOW_RISK_AUTOSAVE_FIELDS.has(field)
  );
  const changeSource = attachmentChanges.length > 0
    ? deriveAttachmentChangeSource(attachmentChanges)
    : forcedAudit
    ? "manual_entry"
    : metadata.change_source;
  return {
    should_audit: metadata.change_source !== "autosave" || forcedAudit,
    metadata: {
      ...metadata,
      change_source: changeSource,
      ...(forcedAudit ? { forced_audit: true } : {}),
    },
  };
}

function getActualChangedFields(
  input: {
    current: WechatPayApplymentRecord;
    input: UpdateWechatPayApplymentInput;
    serverPatch?: WechatPayApplymentUpdate;
  },
  attachmentChanges: readonly AttachmentChange[],
) {
  const currentProjection = input.current as unknown as Record<string, unknown>;
  const sensitiveFields = new Set(getSensitiveReplacementFields(input.input));
  const changedFields = Object.entries(input.input)
    .filter(([field, value]) => {
      if (INTERNAL_DRAFT_INPUT_FIELDS.has(field) || value === undefined) {
        return false;
      }
      if (field === "attachments") return attachmentChanges.length > 0;
      if (sensitiveFields.has(field)) return true;
      return value !== currentProjection[field];
    })
    .map(([field]) => field);
  for (const [field, nextValue] of Object.entries(input.serverPatch ?? {})) {
    if (field === "attachments") continue;
    if (
      nextValue !== undefined &&
      !INTERNAL_SERVER_PATCH_FIELDS.has(field) &&
      nextValue !== currentProjection[field]
    ) {
      changedFields.push(field);
    }
  }
  return [...new Set(changedFields)].sort();
}

function deriveAttachmentChangeSource(
  changes: readonly AttachmentChange[],
) {
  if (
    changes.some((change) =>
      change.before?.ocr_review_status !== "confirmed" &&
      change.after?.ocr_review_status === "confirmed"
    )
  ) return "ocr_confirm";
  if (
    changes.some((change) =>
      change.before?.ocr_review_status !== "manual" &&
      change.after?.ocr_review_status === "manual"
    )
  ) return "manual_entry";
  return "attachment_change";
}

function getAttachmentChanges(
  currentAttachments: unknown,
  nextAttachments: UpdateWechatPayApplymentInput["attachments"],
): AttachmentChange[] {
  if (nextAttachments === undefined) return [];
  const currentByIdentity = indexAttachments(currentAttachments);
  const nextByIdentity = indexAttachments(nextAttachments);
  const identities = new Set([
    ...currentByIdentity.keys(),
    ...nextByIdentity.keys(),
  ]);
  const changes: AttachmentChange[] = [];
  for (const identity of identities) {
    const before = currentByIdentity.get(identity) ?? null;
    const after = nextByIdentity.get(identity) ?? null;
    if (!areAttachmentsEqual(before, after)) changes.push({ before, after });
  }
  return changes;
}

function indexAttachments(value: unknown) {
  const indexed = new Map<string, ComparableAttachment>();
  if (!Array.isArray(value)) return indexed;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const attachment = candidate as Record<string, unknown>;
    const comparable: ComparableAttachment = {};
    for (const field of ATTACHMENT_COMPARE_FIELDS) {
      comparable[field] = attachment[field];
    }
    const baseIdentity = String(comparable.object_key ?? "");
    let identity = baseIdentity;
    let duplicateIndex = 1;
    while (indexed.has(identity)) {
      identity = `${baseIdentity}\u0000${duplicateIndex}`;
      duplicateIndex += 1;
    }
    indexed.set(identity, comparable);
  }
  return indexed;
}

function areAttachmentsEqual(
  left: ComparableAttachment | null,
  right: ComparableAttachment | null,
) {
  if (!left || !right) return left === right;
  return ATTACHMENT_COMPARE_FIELDS.every((field) =>
    Object.is(left[field], right[field])
  );
}
