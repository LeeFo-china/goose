"use client";

import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function updateSetting(key: string, value: string | null) {
  const response = await fetch(`/api/backend/admin/system-settings/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "系统配置保存失败"));
  }
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
