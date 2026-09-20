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

export type PlatformDouyinDeployableTemplate = {
  id: string;
  template_id: string;
  template_version: string;
  description: string;
  channel: "default" | "1";
  is_current: boolean;
  is_tenant_selectable: boolean;
  confirmed_at: string;
  selectability_updated_at: string;
};

export type PlatformDouyinTemplateList = {
  list: PlatformDouyinDeployableTemplate[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export function getTemplateSelectabilityState(
  template: PlatformDouyinDeployableTemplate,
) {
  if (template.is_current) {
    return { disabled: true, label: "推荐版本，租户可选", help: "请先确认新的推荐模板" };
  }
  return {
    disabled: false,
    label: template.is_tenant_selectable ? "租户可选" : "租户不可选",
    help: null,
  };
}

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
