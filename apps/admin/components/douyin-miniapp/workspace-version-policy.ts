import type { TenantDouyinReleaseOption } from "./workspace-types";

export function selectDefaultReleaseOption(options: readonly TenantDouyinReleaseOption[]) {
  return options.find((option) => option.source === "confirmed_template") ?? options[0] ?? null;
}

export function versionActionCopy(option: TenantDouyinReleaseOption) {
  const revision = option.source === "confirmed_template";
  return {
    title: `${option.template_version}${revision ? " · 新模板修订" : ""}`,
    description: revision
      ? "版本号相同或更新，但模板包已经更新。"
      : option.description,
    primaryLabel: primaryLabel(option),
  };
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
