"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Save, TestTube2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { TencentOcrEncryptionPublicKeyEditor } from "@/components/platform-ocr/platform-ocr-encryption-public-key-editor";
import { FileAccessPolicyEditor } from "@/components/settings/settings-file-access-policy-editor";
import type { SystemSetting } from "@/components/settings/settings-types";
import {
  sourceBadge,
  updateSetting,
} from "@/components/settings/settings-mutation-shared";
import { requestBackendJson } from "@/lib/backend-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export { updateSetting } from "@/components/settings/settings-mutation-shared";

async function testSocialVideoTranscription(url: string) {
  return requestBackendJson<{
    actor_id?: string;
    run_id?: string;
    title?: string | null;
    text?: string;
    text_length?: number;
    segment_count?: number;
  }>("/admin/social-video/transcriptions/test", {
    method: "POST",
    body: JSON.stringify({ platform: "douyin", url }),
    fallbackMessage: "短视频识别测试失败",
  });
}

async function testTencentLbsWebservice() {
  return requestBackendJson<{
    ok: boolean;
    status: number;
    message: string;
    request_id: string | null;
    level_counts: number[];
    has_webservice_key: boolean;
    has_webservice_sk: boolean;
    has_miniprogram_key: boolean;
  }>("/admin/system-settings/tencent-lbs/test", {
    method: "POST",
    fallbackMessage: "腾讯位置服务配置测试失败",
  });
}

function getSettingPlaceholder(setting: SystemSetting) {
  if (setting.key === "CUSTOMER_SERVICE_WORKING_HOURS") {
    return "例如：周一至周日 09:00-18:00";
  }

  return setting.effective_scope === "tenant" ? "留空保存可清空租户值" : "留空则继承环境变量或默认值";
}

const smsChannelModeLabels: Record<string, string> = {
  platform: "继承平台短信通道",
  tenant_aliyun: "自有阿里云短信通道",
  tenant_tencent: "自有腾讯云短信通道",
};

type SettingSelectOption = {
  value: string;
  label: string;
};

const settingSelectOptions: Record<string, SettingSelectOption[]> = {
  SMS_PROVIDER: [
    { value: "mock", label: "模拟发送" },
    { value: "disabled", label: "禁用发送" },
    { value: "aliyun", label: "阿里云短信" },
    { value: "tencent", label: "腾讯云短信" },
  ],
  SMS_CHANNEL_MODE: Object.entries(smsChannelModeLabels).map(([value, label]) => ({
    value,
    label,
  })),
  PROJECT_ACCEPTANCE_SMS_LINK_TYPE: [
    { value: "scheme", label: "小程序短链" },
    { value: "url_link", label: "微信直达链接" },
  ],
  WECHAT_MINIPROGRAM_ENV_VERSION: [
    { value: "release", label: "正式版" },
    { value: "trial", label: "体验版" },
    { value: "develop", label: "开发版" },
  ],
  PLATFORM_STORAGE_PROVIDER: [
    { value: "supabase_storage", label: "旧版对象存储" },
    { value: "tencent_cos", label: "腾讯云对象存储" },
  ],
  SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER: [
    { value: "tencent_asr", label: "腾讯云语音识别" },
    { value: "apify", label: "Apify 直接转写" },
  ],
  PICTURE_COMMENT_DEFAULT_STATUS: [
    { value: "visible", label: "立即展示" },
    { value: "pending", label: "进入待处理" },
  ],
};

function getSettingSelectOptions(setting: SystemSetting) {
  return settingSelectOptions[setting.key];
}

function valueTypeLabel(valueType: SystemSetting["value_type"]) {
  if (valueType === "number") return "数字";
  if (valueType === "boolean") return "开关";
  if (valueType === "json") return "结构化数据";
  return "文本";
}

function formatDisplayValue(setting: SystemSetting, value: string | null) {
  if (!value?.trim()) return "-";
  if (setting.value_type === "boolean") {
    if (value === "true") return "是";
    if (value === "false") return "否";
  }
  const options = getSettingSelectOptions(setting);
  return options?.find((option) => option.value === value)?.label || value;
}

export function SettingEditor({ setting }: { setting: SystemSetting }) {
  if (setting.key === "PLATFORM_FILE_ACCESS_POLICY") {
    return <FileAccessPolicyEditor setting={setting} />;
  }

  if (setting.key === "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM") {
    return <TencentOcrEncryptionPublicKeyEditor setting={setting} />;
  }

  return <GenericSettingEditor setting={setting} />;
}

function GenericSettingEditor({ setting }: { setting: SystemSetting }) {
  const router = useRouter();
  const [value, setValue] = useState(setting.is_secret ? "" : setting.stored_value || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const initialValue = setting.is_secret ? "" : setting.stored_value || "";
  const dirty = setting.is_secret && setting.source === "database"
    ? true
    : value !== initialValue;

  function submit() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await updateSetting(setting.key, value.trim() ? value : null);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "系统配置保存失败");
      }
    });
  }

  function reset() {
    setValue(initialValue);
    setError("");
    setSaved(false);
  }

  return (
    <div className="grid gap-4 border-b px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{setting.name}</div>
          {sourceBadge(setting)}
          {setting.is_secret ? <Badge variant="warning">敏感</Badge> : null}
          <Badge variant="outline">{valueTypeLabel(setting.value_type)}</Badge>
        </div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{setting.key}</div>
        {setting.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{setting.description}</p>
        ) : null}
        <div className="mt-2 text-xs text-muted-foreground">
          当前生效值：<span className="break-all">{formatDisplayValue(setting, setting.effective_value)}</span>
        </div>
      </div>

      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor={`setting-${setting.key}`}>数据库配置值</FieldLabel>
        {getSettingSelectOptions(setting) ? (
          <Select
            value={value || "__empty__"}
            onValueChange={(nextValue) =>
              setValue(nextValue === "__empty__" ? "" : nextValue)
            }
          >
            <SelectTrigger id={`setting-${setting.key}`}>
              <SelectValue placeholder="选择配置值" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__empty__">继承环境变量或默认值</SelectItem>
                {getSettingSelectOptions(setting)?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : setting.is_secret ? (
          <Input
            id={`setting-${setting.key}`}
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={setting.effective_scope === "tenant" ? "输入新密钥，留空保存可清空租户值" : "输入新密钥"}
            autoComplete="new-password"
          />
        ) : setting.value_type === "boolean" ? (
          <Select value={value || "__empty__"} onValueChange={(nextValue) => setValue(nextValue === "__empty__" ? "" : nextValue)}>
            <SelectTrigger id={`setting-${setting.key}`}>
              <SelectValue placeholder="继承环境变量或默认值" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__empty__">继承环境变量或默认值</SelectItem>
                <SelectItem value="true">是</SelectItem>
                <SelectItem value="false">否</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : setting.value_type === "json" || setting.key.includes("PROMPT") ? (
          <Textarea
            id={`setting-${setting.key}`}
            rows={setting.key.includes("PROMPT") ? 5 : 3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={setting.effective_scope === "tenant" ? "留空保存可清空租户值" : "留空则继承环境变量或默认值"}
          />
        ) : (
          <Input
            id={`setting-${setting.key}`}
            type={setting.value_type === "number" ? "number" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={getSettingPlaceholder(setting)}
          />
        )}
        <FieldDescription>
          {setting.effective_scope === "tenant" ? "租户覆盖值，留空保存可清空。" : "平台配置值，留空保存将回退环境变量或默认值。"}
        </FieldDescription>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {saved ? <StatusAlert tone="success">已保存</StatusAlert> : null}
      </Field>

      <div className="flex gap-2 lg:items-center lg:justify-end">
        <Button type="button" variant="outline" onClick={reset} disabled={pending || !dirty}>
          <RotateCcw data-icon="inline-start" />
          重置
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : saved ? <Check data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          保存
        </Button>
      </div>
    </div>
  );
}

export function SocialVideoTranscriptionTester() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof testSocialVideoTranscription>> | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        const data = await testSocialVideoTranscription(url);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "短视频识别测试失败");
      }
    });
  }

  return (
    <div className="border-t bg-muted/20 px-5 py-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="font-medium">Apify 识别测试</div>
          <p className="mt-2 text-sm text-muted-foreground">
            使用当前 Apify 配置测试一个抖音链接，返回标题、文本和分段数量。测试会消耗 Apify 运行额度。
          </p>
        </div>

        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="social-video-test-url">抖音视频链接</FieldLabel>
          <Textarea
            id="social-video-test-url"
            rows={3}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="粘贴抖音分享链接或完整分享口令"
          />
          <FieldDescription>支持抖音分享链接、短链或完整分享口令。</FieldDescription>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {result ? (
            <StatusAlert tone="success">
              <div className="flex flex-col gap-2">
                <div>识别成功，文本长度 {result.text_length ?? result.text?.length ?? 0}，分段 {result.segment_count ?? 0}。</div>
                {result.title ? <div className="line-clamp-2">标题：{result.title}</div> : null}
                {result.text ? <div className="line-clamp-3">文本：{result.text}</div> : null}
                {result.run_id ? <div className="break-all text-xs">运行编号：{result.run_id}</div> : null}
              </div>
            </StatusAlert>
          ) : null}
        </Field>

        <div className="flex gap-2 lg:items-center lg:justify-end">
          <Button type="button" onClick={submit} disabled={pending || !url.trim()}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <TestTube2 data-icon="inline-start" />}
            测试
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TencentLbsConfigTester() {
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof testTencentLbsWebservice>> | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await testTencentLbsWebservice());
      } catch (err) {
        setError(err instanceof Error ? err.message : "腾讯位置服务配置测试失败");
      }
    });
  }

  return (
    <div className="border-t bg-muted/20 px-5 py-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="font-medium">腾讯位置服务接口测试</div>
          <p className="mt-2 text-sm text-muted-foreground">
            使用当前服务端密钥和签名校验密钥调用腾讯行政区划接口，验证签名和配额配置是否可用。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {result ? (
            <StatusAlert tone={result.ok ? "success" : "warning"}>
              <div className="flex flex-col gap-1">
                <div>{result.ok ? "腾讯位置服务调用成功" : `腾讯位置服务返回异常：${result.message}`}</div>
                <div className="break-all text-xs">
                  状态码：{result.status}，请求编号：{result.request_id || "-"}
                </div>
                <div className="text-xs">
                  行政区划层级数量：{result.level_counts.length ? result.level_counts.join(" / ") : "-"}
                </div>
                <div className="text-xs">
                  服务端密钥：{result.has_webservice_key ? "已配置" : "未配置"}，
                  签名校验密钥：{result.has_webservice_sk ? "已配置" : "未配置"}，
                  小程序密钥：{result.has_miniprogram_key ? "已配置" : "未配置"}
                </div>
              </div>
            </StatusAlert>
          ) : null}
        </div>

        <div className="flex gap-2 lg:justify-end">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <TestTube2 data-icon="inline-start" />}
            测试配置
          </Button>
        </div>
      </div>
    </div>
  );
}
