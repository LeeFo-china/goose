"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, MessageSquareText } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  SettingEditor,
  SocialVideoTranscriptionTester,
  updateSetting,
} from "@/components/settings/settings-actions";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>短信通道</CardTitle>
            <CardDescription>
              先选择短信发送通道。继承平台时租户不需要维护任何短信参数。
            </CardDescription>
          </div>
          <Badge variant={mode === "platform" ? "secondary" : missingCount > 0 ? "warning" : "success"}>
            {mode === "platform" ? "继承平台" : missingCount > 0 ? `未配置 ${missingCount}` : "配置完整"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
        </CardContent>
      </Card>

      {mode === "platform" ? (
        <Card>
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <MessageSquareText />
            </div>
            <div>
              <CardTitle>当前使用平台统一短信通道</CardTitle>
              <CardDescription>
                短信服务商、签名、模板和密钥由平台统一维护，本租户不展示也不覆盖平台参数。
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{mode === "tenant_aliyun" ? "阿里云短信参数" : "腾讯云短信参数"}</CardTitle>
              <CardDescription>
                自有短信通道必须完整配置。缺少关键参数时，后端会拒绝发送短信。
              </CardDescription>
            </div>
            <Badge variant={missingCount > 0 ? "warning" : "success"}>
              {missingCount > 0 ? `未配置 ${missingCount}` : "配置完整"}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {configSettings.map((setting) => (
              <SettingEditor key={setting.key} setting={setting} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function SettingsTabs({ groups, isPlatformMode = false }: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeGroupCode = normalizeGroup(groups, searchParams.get("group"));
  const activeGroup = groups.find((group) => group.code === activeGroupCode) || groups[0];

  const tabItems = useMemo(() => groups, [groups]);

  function switchGroup(groupCode: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("group", groupCode);
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  if (!activeGroup) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          暂无配置项
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto rounded-md border bg-card p-2">
        {tabItems.map((group) => {
          const active = group.code === activeGroup.code;
          return (
            <Button
              key={group.code}
              type="button"
              variant={active ? "default" : "ghost"}
              className={cn(
                "h-9 shrink-0 gap-2 px-3",
                active ? "shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => switchGroup(group.code)}
              disabled={pending}
              aria-pressed={active}
            >
              {pending && active ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              <span>{group.label}</span>
              <Badge variant={active ? "secondary" : "outline"}>{group.settings.length}</Badge>
              {group.emptyCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs">
                  <AlertCircle className="size-3" />
                  {group.emptyCount}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>

      {!isPlatformMode && activeGroup.code === "sms" ? (
        <TenantSmsSettingsPanel settings={activeGroup.settings} />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{activeGroup.label}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeGroup.settings.length} 项配置，{activeGroup.secretCount} 项敏感配置，{activeGroup.emptyCount} 项未配置。
              </p>
            </div>
            <Badge variant={activeGroup.emptyCount > 0 ? "warning" : "success"}>
              {activeGroup.emptyCount > 0 ? `未配置 ${activeGroup.emptyCount}` : "配置完整"}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {activeGroup.code === "social_video" ? (
              <SocialVideoTranscriptionTester />
            ) : null}
            {activeGroup.settings.map((setting) => (
              <SettingEditor key={setting.key} setting={setting} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
