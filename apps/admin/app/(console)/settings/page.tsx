import { StatusAlert } from "@/components/admin/status-alert";
import type { PlatformWechatPayProfileListResult } from "@/components/settings/platform-payment-settings-types";
import {
  PlatformSettingsHeader,
  TenantSettingsHeader,
} from "@/components/settings/settings-page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { countTenantGroupMissing } from "@/components/settings/tenant-settings-status";
import type { SystemSetting } from "@/components/settings/settings-types";
import { TenantSettingsWorkspace } from "@/components/settings/tenant-settings-workspace";
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
  location: "定位匹配",
  notify: "通知配置",
  wechat: "微信配置",
  payment: "支付配置",
  picture_library: "图片资料库",
  visitor: "访客配置",
};

const groupOrder = [
  "sms",
  "customer_service",
  "storage",
  "tencent_lbs",
  "location",
  "ai",
  "social_video",
  "ezviz",
  "tencent_iot_video",
  "wechat",
  "payment",
  "notify",
  "picture_library",
  "visitor",
];

async function fetchSettings(token: string) {
  const response = await fetch(buildBackendUrl("/admin/system-settings"), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<SettingsData>(response);
  return payload.data as SettingsData;
}

const emptyPlatformPaymentProfiles: PlatformWechatPayProfileListResult = {
  can_manage: false,
  profiles: [],
  error: null,
};

async function fetchPlatformPaymentProfiles(token: string) {
  const response = await fetch(
    buildBackendUrl("/platform/payment/wechat-pay/profiles"),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await parseBackendJson<PlatformWechatPayProfileListResult>(
    response,
  );
  return payload.data as PlatformWechatPayProfileListResult;
}

async function getSettingsData(token: string | null) {
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

async function getPlatformPaymentProfilesData(
  token: string | null,
  isPlatformMode: boolean,
) {
  if (!isPlatformMode) return emptyPlatformPaymentProfiles;
  if (!token) {
    return {
      ...emptyPlatformPaymentProfiles,
      error: "缺少登录凭证",
    };
  }

  try {
    return {
      ...await fetchPlatformPaymentProfiles(token),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyPlatformPaymentProfiles,
      error: error instanceof Error ? error.message : "平台支付配置加载失败",
    };
  }
}

export default async function SettingsPage() {
  const [session, token] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
  ]);
  const isPlatformMode = isPlatformOnlySession(session);
  const [settingsResult, paymentProfiles] = await Promise.all([
    getSettingsData(token),
    getPlatformPaymentProfilesData(token, isPlatformMode),
  ]);
  const { list, groups, error } = settingsResult;
  const databaseCount = list.filter((item) => item.source === "database").length;
  const envCount = list.filter((item) => item.source === "env").length;
  const emptyCount = list.filter((item) => item.source === "empty").length;
  const secretCount = list.filter((item) => item.is_secret).length;
  const groupEntries = Object.entries(groups)
    .map(([groupCode, settings]) => ({
      code: groupCode,
      label: groupLabels[groupCode] || "其他配置",
      settings,
      emptyCount: isPlatformMode
        ? settings.filter((item) => item.source === "empty").length
        : countTenantGroupMissing(groupCode, settings),
      secretCount: settings.filter((item) => item.is_secret).length,
    }))
    .sort((left, right) => {
      const leftOrder = groupOrder.indexOf(left.code);
      const rightOrder = groupOrder.indexOf(right.code);
      return (leftOrder === -1 ? groupOrder.length : leftOrder) - (rightOrder === -1 ? groupOrder.length : rightOrder);
    });

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-4 overflow-hidden">
      {isPlatformMode ? (
        <>
          <PlatformSettingsHeader
            totalCount={list.length}
            databaseCount={databaseCount}
            envCount={envCount}
            emptyCount={emptyCount}
            secretCount={secretCount}
          />
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <SettingsTabs
            groups={groupEntries}
            isPlatformMode
            paymentProfiles={paymentProfiles}
          />
        </>
      ) : (
        <>
          <TenantSettingsHeader groups={groupEntries} />
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <TenantSettingsWorkspace groups={groupEntries} />
        </>
      )}
    </div>
  );
}
