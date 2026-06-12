import { SlidersHorizontal } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { SystemSetting } from "@/components/settings/settings-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

type SettingsData = {
  list: SystemSetting[];
  groups: Record<string, SystemSetting[]>;
};

const groupLabels: Record<string, string> = {
  sms: "短信配置",
  customer_service: "客服配置",
  ezviz: "萤石监控",
  tencent_iot_video: "腾讯云监控",
  storage: "平台存储",
  ai: "AI 配置",
  social_video: "短视频识别",
  tencent_lbs: "腾讯位置",
  notify: "通知配置",
  wechat: "微信配置",
};

async function fetchSettings(token: string) {
  const response = await fetch(buildBackendUrl("/admin/system-settings"), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<SettingsData>(response);
  return payload.data as SettingsData;
}

async function getSettingsData() {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [] as SystemSetting[],
      groups: {} as Record<string, SystemSetting[]>,
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchSettings(token);
    return {
      list: data?.list || [],
      groups: data?.groups || {},
      error: null,
    };
  } catch (error) {
    return {
      list: [] as SystemSetting[],
      groups: {} as Record<string, SystemSetting[]>,
      error: error instanceof Error ? error.message : "系统配置加载失败",
    };
  }
}

export default async function SettingsPage() {
  const [session, settingsResult] = await Promise.all([
    getAdminSession(),
    getSettingsData(),
  ]);
  const { list, groups, error } = settingsResult;
  const isPlatformMode = isPlatformOnlySession(session);
  const databaseCount = list.filter((item) => item.source === "database").length;
  const envCount = list.filter((item) => item.source === "env").length;
  const emptyCount = list.filter((item) => item.source === "empty").length;
  const secretCount = list.filter((item) => item.is_secret).length;
  const tenantOverrideCount = list.filter((item) => item.effective_scope === "tenant").length;
  const tenantInheritedCount = list.filter((item) => item.effective_scope === "platform").length;
  const groupEntries = Object.entries(groups)
    .map(([groupCode, settings]) => ({
      code: groupCode,
      label: groupLabels[groupCode] || groupCode,
      settings,
      emptyCount: settings.filter((item) => item.source === "empty").length,
      secretCount: settings.filter((item) => item.is_secret).length,
    }))
    .sort((left, right) => {
      const order = ["sms", "customer_service", "storage", "tencent_lbs", "ai", "social_video", "ezviz", "tencent_iot_video", "wechat", "notify"];
      const leftOrder = order.indexOf(left.code);
      const rightOrder = order.indexOf(right.code);
      return (leftOrder === -1 ? order.length : leftOrder) - (rightOrder === -1 ? order.length : rightOrder);
    });

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">
            {isPlatformMode ? "平台系统配置" : "租户系统配置"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPlatformMode
              ? "平台级能力由平台统一维护，包含短信网关、监控接入、AI、微信、短视频识别和通知配置。密钥类配置加密存储并保留环境变量回退。"
              : "租户端可维护短信通道、客服入口等租户配置。继承平台配置时不展示平台密钥、签名和模板信息。"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>配置项 {list.length}</span>
            <span>{isPlatformMode ? `数据库覆盖 ${databaseCount}` : `租户覆盖 ${tenantOverrideCount}`}</span>
            <span>{isPlatformMode ? `环境变量回退 ${envCount}` : `继承平台 ${tenantInheritedCount}`}</span>
            <span>未配置 {emptyCount}</span>
            <span>敏感项 {secretCount}</span>
          </div>
        </div>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <SettingsTabs groups={groupEntries} isPlatformMode={isPlatformMode} />
    </div>
  );
}
