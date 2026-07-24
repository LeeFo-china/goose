import type { PersistAttachmentsInput } from "./finance-wechat-pay-applyment-manual-entry";
import type { ApplymentSaveGenerationContext } from "./finance-wechat-pay-applyment-save-generation";
import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";

export type UseWechatPayApplymentMaterialsInput = {
  initialAttachments: WechatPayApplymentAttachment[];
  initialApplymentId?: string | null;
  resetKey: string;
  editable: boolean;
  persistAttachments: (
    input: PersistAttachmentsInput,
    context: ApplymentSaveGenerationContext,
  ) => Promise<{ applymentId?: string | null }>;
};
