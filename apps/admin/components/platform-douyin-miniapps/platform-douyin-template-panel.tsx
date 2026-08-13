"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileClock,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requestBackendJson } from "@/lib/backend-client";
import {
  getTemplateConfirmationState,
  type PlatformDouyinTemplateStatus,
} from "./platform-douyin-template-rules";

type ConfirmedTemplate = NonNullable<
  PlatformDouyinTemplateStatus["current_template"]
>;

export function PlatformDouyinTemplatePanel({
  initialError,
  initialStatus,
}: {
  initialError: string | null;
  initialStatus: PlatformDouyinTemplateStatus | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const confirmation = status
    ? getTemplateConfirmationState(status)
    : { canConfirm: false, label: "模板状态不可用", tone: "neutral" as const };

  async function confirmLatestTemplate() {
    if (!status || !confirmation.canConfirm || pending) return;
    setPending(true);
    setError(null);
    try {
      const confirmed = await requestBackendJson<ConfirmedTemplate>(
        "/platform/douyin-miniapps/deployable-template/confirm-latest",
        {
          method: "POST",
          body: JSON.stringify({ channel: "default" }),
          fallbackMessage: "确认抖音模板失败",
        },
      );
      setStatus({
        ...status,
        current_template: confirmed,
        is_latest_confirmed: true,
      });
      toast.success("最新模板已设为租户可发布版本");
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "确认抖音模板失败";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-normal">抖音模板版本</h1>
        <p className="text-sm text-muted-foreground">
          确认租户可使用的公共模板版本
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>模板状态不可用</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="max-w-4xl shadow-none">
        <CardHeader className="gap-3 border-b">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="space-y-1">
              <CardTitle>默认发布通道</CardTitle>
              <CardDescription>
                确认后，各租户 Admin 可自行生成体验版、提审并发布。
              </CardDescription>
            </div>
            <Badge variant={toneVariant(confirmation.tone)}>
              {confirmation.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <VersionBlock
              icon={FileClock}
              title="开发工具最新草稿"
              version={status?.latest_draft?.version ?? "暂无草稿"}
              description={status?.latest_draft?.description ?? "上传代码后刷新查看"}
              time={status?.latest_draft
                ? formatProviderTime(status.latest_draft.created_at)
                : null}
            />
            <VersionBlock
              icon={CheckCircle2}
              title="当前可发布模板"
              version={status?.current_template?.template_version ?? "尚未确认"}
              description={status?.current_template?.description ?? "确认草稿后租户可见"}
              time={status?.current_template
                ? formatIsoTime(status.current_template.confirmed_at)
                : null}
            />
          </dl>

          <Separator />

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 text-sm">
              <p className="font-medium">模板开发 AppID</p>
              <p className="mt-1 break-all font-mono text-muted-foreground">
                {status?.template_app_id ?? "未配置"}
              </p>
            </div>
            <Button
              disabled={!confirmation.canConfirm || pending}
              onClick={confirmLatestTemplate}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud aria-hidden="true" />
              )}
              {pending ? "正在确认" : "确认最新模板"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VersionBlock({
  description,
  icon: Icon,
  time,
  title,
  version,
}: {
  description: string;
  icon: typeof FileClock;
  time: string | null;
  title: string;
  version: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-3 text-lg font-semibold">{version}</p>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        {description}
      </p>
      {time ? <p className="mt-3 text-xs text-muted-foreground">{time}</p> : null}
    </div>
  );
}

function toneVariant(tone: "neutral" | "success" | "warning") {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  return "secondary" as const;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

function formatProviderTime(timestamp: number) {
  return dateFormatter.format(new Date(timestamp * 1000));
}

function formatIsoTime(timestamp: string) {
  return dateFormatter.format(new Date(timestamp));
}
