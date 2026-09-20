import type { TenantDouyinReleaseOption } from "./workspace-types";

export function selectDefaultReleaseOption(options: readonly TenantDouyinReleaseOption[]) {
  return options.find((option) => option.source === "confirmed_template"
    && option.is_recommended)
    ?? options.find((option) => option.source === "confirmed_template")
    ?? options[0] ?? null;
}

export function versionActionCopy(option: TenantDouyinReleaseOption) {
  const template = option.source === "confirmed_template";
  return {
    title: template
      ? `${option.template_version} · ${selectionLabel(option.selection_kind)}`
      : option.template_version,
    description: option.selection_kind === "rollback"
      ? "生成后需要重新体验、提审和发布，不会立即替换当前线上版本。"
      : option.description,
    primaryLabel: primaryLabel(option),
  };
}

export function selectionLabel(kind: TenantDouyinReleaseOption["selection_kind"]) {
  if (kind === "recommended") return "推荐版本";
  if (kind === "stable") return "稳定可选版本";
  if (kind === "rollback") return "旧版回退";
  if (kind === "current_online") return "已发布";
  return "发布记录";
}

function primaryLabel(option: TenantDouyinReleaseOption) {
  const action = option.actions[0];
  if (action === "create_test_version") return `生成 ${option.template_version} 测试码`;
  if (action === "generate_test_qr") return "生成体验二维码";
  if (action === "generate_audit_qr") return "获取审核版二维码";
  if (action === "submit_audit") return "提交审核";
  if (action === "sync_status") return "同步审核状态";
  if (action === "publish") return "正式发布";
  return "当前无需操作";
}
