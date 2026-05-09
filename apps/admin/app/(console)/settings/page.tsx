import { SlidersHorizontal } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SettingsData = {
  list: SystemSetting[];
  groups: Record<string, SystemSetting[]>;
};

const groupLabels: Record<string, string> = {
  sms: "短信配置",
  ezviz: "萤石监控",
  tencent_iot_video: "腾讯云监控",
  ai: "AI 配置",
  social_video: "短视频识别",
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
  const { list, groups, error } = await getSettingsData();
  const databaseCount = list.filter((item) => item.source === "database").length;
  const envCount = list.filter((item) => item.source === "env").length;
  const emptyCount = list.filter((item) => item.source === "empty").length;
  const secretCount = list.filter((item) => item.is_secret).length;
  const groupEntries = Object.entries(groups)
    .map(([groupCode, settings]) => ({
      code: groupCode,
      label: groupLabels[groupCode] || groupCode,
      settings,
      emptyCount: settings.filter((item) => item.source === "empty").length,
      secretCount: settings.filter((item) => item.is_secret).length,
    }))
    .sort((left, right) => {
      const order = ["sms", "ai", "social_video", "ezviz", "tencent_iot_video", "wechat", "notify"];
      return order.indexOf(left.code) - order.indexOf(right.code);
    });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">系统配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          非敏感配置明文存储；密钥类配置加密存储并保留环境变量回退。JWT、Supabase、端口和加密主密钥仍保留在服务器环境变量中。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SlidersHorizontal className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">配置项</div>
              <div className="text-xl font-semibold">{list.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">数据库覆盖</div>
            <div className="text-xl font-semibold">{databaseCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">环境变量回退</div>
            <div className="text-xl font-semibold">{envCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">未配置</div>
            <div className="text-xl font-semibold">{emptyCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">敏感项 {secretCount}</div>
          </CardContent>
        </Card>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <SettingsTabs groups={groupEntries} />
    </div>
  );
}
