export type PlatformDouyinTemplateStatus = {
  template_app_id: string;
  latest_draft: {
    version: string;
    description: string;
    created_at: number;
  } | null;
  current_template: {
    id: string;
    source_draft_id: string;
    template_id: string;
    template_version: string;
    description: string;
    channel: "default" | "1";
    confirmed_at: string;
  } | null;
  is_latest_confirmed: boolean;
};

export function getTemplateConfirmationState(
  status: PlatformDouyinTemplateStatus,
) {
  if (!status.latest_draft) {
    return {
      canConfirm: false,
      label: "暂无可用草稿",
      tone: "neutral" as const,
    };
  }
  if (status.is_latest_confirmed) {
    return {
      canConfirm: false,
      label: "当前模板已确认",
      tone: "success" as const,
    };
  }
  return {
    canConfirm: true,
    label: "发现待确认草稿",
    tone: "warning" as const,
  };
}
