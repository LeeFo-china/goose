"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  SettingEditor,
  updateSetting,
} from "@/components/settings/settings-actions";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function ChannelStatus({
  mode,
  missingCount,
}: {
  mode: string;
  missingCount: number;
}) {
  if (mode === "platform") {
    return <Badge variant="secondary">继承平台</Badge>;
  }

  const isComplete = missingCount === 0;
  return (
    <Badge variant={isComplete ? "success" : "warning"} className="gap-1.5">
      {isComplete ? (
        <CheckCircle2 aria-hidden="true" className="size-3.5" />
      ) : (
        <CircleAlert aria-hidden="true" className="size-3.5" />
      )}
      {isComplete ? "配置完整" : `${missingCount} 项待完善`}
    </Badge>
  );
}

export function TenantSmsSettingsPanel({
  settings,
}: {
  settings: SystemSetting[];
}) {
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
        setError(err instanceof Error ? err.message : "短信发送通道保存失败");
      }
    });
  }

  return (
    <div>
      <section className="border-b px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">短信发送通道</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              选择平台统一服务，或使用本租户自己的短信服务商。
            </p>
          </div>
          <ChannelStatus mode={mode} missingCount={missingCount} />
        </div>

        <Field
          className="mt-4 max-w-xl"
          data-disabled={pending || !modeSetting || undefined}
          data-invalid={Boolean(error) || undefined}
        >
          <FieldLabel htmlFor="tenant-sms-channel-mode">发送通道</FieldLabel>
          <Select
            value={mode}
            onValueChange={changeMode}
            disabled={pending || !modeSetting}
          >
            <SelectTrigger
              id="tenant-sms-channel-mode"
              aria-invalid={Boolean(error) || undefined}
            >
              <SelectValue placeholder="选择短信发送通道" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="platform">
                  {smsChannelModeLabels.platform}
                </SelectItem>
                <SelectItem value="tenant_aliyun">
                  {smsChannelModeLabels.tenant_aliyun}
                </SelectItem>
                <SelectItem value="tenant_tencent">
                  {smsChannelModeLabels.tenant_tencent}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            选择后立即保存。使用自有通道时，需要完成下方服务商参数。
          </FieldDescription>
          {pending ? (
            <p
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              正在保存短信发送通道...
            </p>
          ) : null}
          {!modeSetting ? (
            <StatusAlert tone="warning">当前租户未开放短信通道配置。</StatusAlert>
          ) : null}
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {saved ? (
            <StatusAlert tone="success">短信发送通道已保存</StatusAlert>
          ) : null}
        </Field>
      </section>

      {mode === "platform" ? (
        <section className="flex items-start gap-3 px-4 py-5 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <MessageSquareText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium">当前使用平台统一短信通道</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              短信服务商、签名、模板和密钥由平台统一维护，本租户无需填写参数，也不会看到平台敏感信息。
            </p>
          </div>
        </section>
      ) : (
        <section
          aria-label={
            mode === "tenant_aliyun" ? "阿里云短信参数" : "腾讯云短信参数"
          }
        >
          <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div>
              <h3 className="text-sm font-medium">
                {mode === "tenant_aliyun"
                  ? "阿里云短信参数"
                  : "腾讯云短信参数"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                自有短信通道需要完整配置，缺少必要参数时将无法发送短信。
              </p>
            </div>
            <ChannelStatus mode={mode} missingCount={missingCount} />
          </div>
          {configSettings.length > 0 ? (
            configSettings.map((setting) => (
              <SettingEditor key={setting.key} setting={setting} />
            ))
          ) : (
            <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
              当前服务商暂无可维护参数。
            </p>
          )}
        </section>
      )}
    </div>
  );
}
