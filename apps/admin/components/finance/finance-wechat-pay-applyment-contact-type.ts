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
  ) => Promise<void>;
  reportError: (message: string) => void;
}) {
  input.commitType(input.nextType);
  if (input.nextType !== "LEGAL") return;
  const nextAttachments = input.attachments.filter((attachment) =>
    attachment.category !== "contact_id_card_front" &&
    attachment.category !== "contact_id_card_back"
  );
  try {
    await input.changeAttachments(nextAttachments);
  } catch (error) {
    input.commitType(input.currentType);
    input.reportError(error instanceof Error
      ? error.message
      : "联系人类型保存失败");
    throw error;
  }
}
