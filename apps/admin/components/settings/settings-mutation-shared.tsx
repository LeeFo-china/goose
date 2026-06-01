"use client";

import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { requestBackendJson } from "@/lib/backend-client";

export async function updateSetting(key: string, value: string | null) {
  await requestBackendJson(`/admin/system-settings/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
    fallbackMessage: "系统配置保存失败",
  });
}

export function sourceBadge(setting: SystemSetting) {
  if (setting.source === "database") {
    return <Badge variant="success">数据库</Badge>;
  }
  if (setting.source === "env") {
    return <Badge variant="warning">环境变量</Badge>;
  }
  if (setting.source === "default") {
    return <Badge variant="outline">默认值</Badge>;
  }
  return <Badge variant="danger">未配置</Badge>;
}
