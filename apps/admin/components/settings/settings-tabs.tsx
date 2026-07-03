"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, MessageSquareText } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  SettingEditor,
  SocialVideoTranscriptionTester,
  TencentLbsConfigTester,
  updateSetting,
} from "@/components/settings/settings-actions";
import { PlatformPaymentSettingsPanel } from "@/components/settings/platform-payment-settings-panel";
import type { PlatformWechatPayProfileListResult } from "@/components/settings/platform-payment-settings-types";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SettingsGroup = {
  code: string;
  label: string;
  settings: SystemSetting[];
  emptyCount: number;
  secretCount: number;
};

type SettingsTabsProps = {
  groups: SettingsGroup[];
  isPlatformMode?: boolean;
  paymentProfiles?: PlatformWechatPayProfileListResult;
};

function normalizeGroup(groups: SettingsGroup[], value: string | null) {
  if (value && groups.some((group) => group.code === value)) {
    return value;
  }

  return groups[0]?.code || "";
}

const smsChannelModeLabels: Record<string, string> = {
  platform: "继承平台短信通道",
  tenant_aliyun: "自有阿里云短信通道",
  tenant_tencent: "自有腾讯云短信通道",
};

const aliyunSmsKeys = new Set([
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER",
  "ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE",
  "ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN",
  "ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

const tencentSmsKeys = new Set([
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_ENDPOINT",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
  "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
  "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
  "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
]);

function findSetting(settings: SystemSetting[], key: string) {
  return settings.find((setting) => setting.key === key) || null;
}

function countMissing(settings: SystemSetting[]) {
  return settings.filter((setting) => setting.source === "empty").length;
}

function TenantSmsSettingsPanel({ settings }: { settings: SystemSetting[] }) {
  const router = useRouter();
  const modeSetting = findSetting(settings, "SMS_CHANNEL_MODE");
  const initialMode = modeSetting?.effective_value || "platform";
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const configSettings = settings.filter((setting) => {
    if (setting.key === "SMS_CHANNEL_MODE") return false;
    if (mode === "tenant_aliyun") return aliyunSmsKeys.has(setting.key);
    if (mode === "tenant_tencent") return tencentSmsKeys.has(setting.key);
    return false;
  });
  const missingCount = countMissing(configSettings);

  function changeMode(nextMode: string) {
    setMode(nextMode);
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await updateSetting("SMS_CHANNEL_MODE", nextMode);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "短信通道模式保存失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border bg-background">
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium">短信通道</div>
            <p className="mt-1 text-xs text-muted-foreground">
              先选择短信发送通道。继承平台时租户不需要维护任何短信参数。
            </p>
          </div>
          <Badge variant={mode === "platform" ? "secondary" : missingCount > 0 ? "warning" : "success"}>
            {mode === "platform" ? "继承平台" : missingCount > 0 ? `未配置 ${missingCount}` : "配置完整"}
          </Badge>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(240px,360px)_1fr] md:items-center">
            <Select value={mode} onValueChange={changeMode} disabled={pending || !modeSetting}>
              <SelectTrigger id="tenant-sms-channel-mode">
                <SelectValue placeholder="选择短信通道" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">{smsChannelModeLabels.platform}</SelectItem>
                <SelectItem value="tenant_aliyun">{smsChannelModeLabels.tenant_aliyun}</SelectItem>
                <SelectItem value="tenant_tencent">{smsChannelModeLabels.tenant_tencent}</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              {pending ? "正在保存短信通道模式..." : smsChannelModeLabels[mode] || smsChannelModeLabels.platform}
            </div>
          </div>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {saved ? <StatusAlert tone="success">短信通道模式已保存</StatusAlert> : null}
        </div>
      </div>

      {mode === "platform" ? (
        <div className="rounded-md border bg-background p-4">
          <div className="flex flex-row items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <MessageSquareText />
            </div>
            <div>
              <div className="text-sm font-medium">当前使用平台统一短信通道</div>
              <p className="mt-1 text-xs text-muted-foreground">
                短信服务商、签名、模板和密钥由平台统一维护，本租户不展示也不覆盖平台参数。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <div className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <div className="text-sm font-medium">{mode === "tenant_aliyun" ? "阿里云短信参数" : "腾讯云短信参数"}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                自有短信通道必须完整配置。缺少关键参数时，后端会拒绝发送短信。
              </p>
            </div>
            <Badge variant={missingCount > 0 ? "warning" : "success"}>
              {missingCount > 0 ? `未配置 ${missingCount}` : "配置完整"}
            </Badge>
          </div>
          <div>
            {configSettings.map((setting) => (
              <SettingEditor key={setting.key} setting={setting} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const emptyPaymentProfiles: PlatformWechatPayProfileListResult = {
  can_manage: false,
  profiles: [],
  error: null,
};

export function SettingsTabs({
  groups,
  isPlatformMode = false,
  paymentProfiles = emptyPaymentProfiles,
}: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeGroupCode = normalizeGroup(groups, searchParams.get("group"));
  const activeGroup = groups.find((group) => group.code === activeGroupCode) || groups[0];

  function switchGroup(groupCode: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("group", groupCode);
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  if (!activeGroup) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          暂无配置项
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs
      value={activeGroup.code}
      onValueChange={switchGroup}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-card px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <TabsList className="h-auto w-full justify-start overflow-x-auto md:w-auto">
              {groups.map((group) => {
                const active = group.code === activeGroup.code;

                return (
                  <TabsTrigger
                    key={group.code}
                    value={group.code}
                    disabled={pending}
                    className="gap-2 whitespace-nowrap"
                  >
                    {pending && active ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : null}
                    <span>{group.label}</span>
                    <Badge variant={active ? "secondary" : "outline"}>
                      {group.settings.length}
                    </Badge>
                    {group.emptyCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <AlertCircle />
                        {group.emptyCount}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <div className="flex flex-wrap gap-2 pb-3 text-xs text-muted-foreground md:pb-0">
              <span>{activeGroup.settings.length} 项配置</span>
              <span>{activeGroup.secretCount} 项敏感配置</span>
              <span>{activeGroup.emptyCount} 项未配置</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <TabsContent
            value={activeGroup.code}
            className="m-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
          >
            {!isPlatformMode && activeGroup.code === "sms" ? (
              <div className="flex flex-col gap-3 p-4">
                <TenantSmsSettingsPanel settings={activeGroup.settings} />
              </div>
            ) : isPlatformMode && activeGroup.code === "payment" ? (
              <PlatformPaymentSettingsPanel paymentProfiles={paymentProfiles} />
            ) : (
              <>
                <div className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div>
                    <CardTitle className="text-base">{activeGroup.label}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeGroup.settings.length} 项配置，{activeGroup.secretCount} 项敏感配置，
                      {activeGroup.emptyCount} 项未配置。
                    </p>
                  </div>
                  <Badge variant={activeGroup.emptyCount > 0 ? "warning" : "success"}>
                    {activeGroup.emptyCount > 0 ? `未配置 ${activeGroup.emptyCount}` : "配置完整"}
                  </Badge>
                </div>
                <div>
                  {activeGroup.code === "social_video" ? (
                    <SocialVideoTranscriptionTester />
                  ) : null}
                  {activeGroup.code === "tencent_lbs" ? (
                    <TencentLbsConfigTester />
                  ) : null}
                  {activeGroup.settings.map((setting) => (
                    <SettingEditor key={setting.key} setting={setting} />
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}
