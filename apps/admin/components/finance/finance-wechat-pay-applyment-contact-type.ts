import {
  createApplymentAttachmentMutationIntent,
  type ApplymentAttachmentChangeOptions,
} from "./finance-wechat-pay-applyment-manual-entry";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

export async function changeApplymentContactTypeWithRollback(input: {
  currentType: string;
  nextType: string;
  attachments: readonly WechatPayApplymentAttachment[];
  commitType: (value: string) => void;
  changeAttachments: (
    attachments: WechatPayApplymentAttachment[],
    options?: ApplymentAttachmentChangeOptions,
  ) => Promise<void>;
  reportError: (message: string) => void;
}) {
  if (input.nextType !== "LEGAL") {
    input.commitType(input.nextType);
    return;
  }
  const nextAttachments = input.attachments.filter((attachment) =>
    attachment.category !== "contact_id_card_front" &&
    attachment.category !== "contact_id_card_back"
  );
  try {
    await input.changeAttachments(nextAttachments, {
      intent: createApplymentAttachmentMutationIntent(
        input.attachments,
        nextAttachments,
      ),
      relatedMutation: {
        commitOptimistic: () => input.commitType(input.nextType),
        rollback: () => input.commitType(input.currentType),
        contactType: input.nextType,
      },
    });
  } catch (error) {
    input.reportError(error instanceof Error
      ? error.message
      : "联系人类型保存失败");
    throw error;
  }
}
