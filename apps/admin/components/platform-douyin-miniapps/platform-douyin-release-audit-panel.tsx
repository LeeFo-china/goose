"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AppWindow,
  Clock3,
  FileWarning,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestBackendJson } from "@/lib/backend-client";
import {
  douyinAuditRejectionReason,
  getDouyinReleaseAuditOptions,
  releaseAuditStatusLabel,
  releaseAuditStatusTone,
  type PlatformDouyinInstallation,
  type PlatformDouyinReleaseAudit,
  type PlatformDouyinReleaseListData,
} from "./platform-douyin-release-audit-rules";

export function PlatformDouyinReleaseAuditPanel({
  installations,
  initialError,
}: {
  installations: PlatformDouyinInstallation[];
  initialError: string | null;
}) {
  const options = getDouyinReleaseAuditOptions(installations);
  const [merchantId, setMerchantId] = useState(options.defaultMerchantId);
  const [release, setRelease] = useState<PlatformDouyinReleaseAudit | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (!merchantId) {
      setRelease(null);
      setError(initialError);
      return;
    }

    let cancelled = false;
    setPending(true);
    setError(null);
    requestBackendJson<PlatformDouyinReleaseListData>(
      `/platform/douyin-miniapps/${encodeURIComponent(merchantId)}`
        + "/releases?page=1&pageSize=1",
      { fallbackMessage: "加载商户发布记录失败" },
    ).then((payload) => {
      if (cancelled) return;
      setRelease(payload.list[0] ?? null);
    }).catch((caught) => {
      if (cancelled) return;
      setRelease(null);
      setError(caught instanceof Error ? caught.message : "加载商户发布记录失败");
    }).finally(() => {
      if (!cancelled) setPending(false);
    });

    return () => {
      cancelled = true;
    };
  }, [initialError, merchantId]);

  const rejectionReason = douyinAuditRejectionReason(release);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">商户发布审核</h2>
        <p className="text-sm text-muted-foreground">
          查看已授权商家的最新测试、审核和发布状态，以及抖音返回的驳回原因。
        </p>
      </header>

      <Card className="w-full shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="space-y-1">
              <CardTitle>最近发布记录</CardTitle>
              <CardDescription>
                仅展示当前选中的已授权商户，不提供提审或发布操作。
              </CardDescription>
            </div>
            {release ? (
              <Badge variant={releaseAuditStatusTone(release.status)}>
                {releaseAuditStatusLabel(release.status)}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>商户发布记录不可用</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="douyin-release-audit-merchant">目标商家</Label>
            <Select value={merchantId} onValueChange={setMerchantId}>
              <SelectTrigger
                id="douyin-release-audit-merchant"
                disabled={pending && Boolean(merchantId)}
              >
                <SelectValue placeholder="选择已授权商家" />
              </SelectTrigger>
              <SelectContent>
                {options.merchants.map((merchant) => (
                  <SelectItem key={merchant.id} value={merchant.id}>
                    {merchant.tenant?.name || merchant.authorizer_appid}
                    {` · ${merchant.authorizer_appid}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {options.merchants.length === 0 ? (
            <Alert>
              <AppWindow aria-hidden="true" />
              <AlertTitle>暂无可查看商户</AlertTitle>
              <AlertDescription>
                当前没有已授权的商户小程序，或授权状态不是启用中。
              </AlertDescription>
            </Alert>
          ) : null}

          {pending ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <RefreshCw className="animate-spin" aria-hidden="true" />
              正在加载最新发布记录
            </div>
          ) : null}

          {!pending && release ? (
            <>
              <ReleaseDetail release={release} />
              {rejectionReason ? (
                <Alert variant="destructive">
                  <FileWarning aria-hidden="true" />
                  <AlertTitle>审核驳回原因</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap break-words">
                    {rejectionReason}
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          ) : null}

          {!pending && !release && options.merchants.length > 0 ? (
            <Alert>
              <Clock3 aria-hidden="true" />
              <AlertTitle>暂无发布记录</AlertTitle>
              <AlertDescription>
                该商户尚未生成体验版或提交审核。
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReleaseDetail({
  release,
}: {
  release: PlatformDouyinReleaseAudit;
}) {
  return (
    <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">模板版本</dt>
      <dd className="font-medium">{release.template_version}</dd>
      <dt className="text-muted-foreground">模板编号</dt>
      <dd className="font-mono">{release.template_id}</dd>
      <dt className="text-muted-foreground">版本说明</dt>
      <dd className="break-words">{release.description}</dd>
      <dt className="text-muted-foreground">最近更新</dt>
      <dd>{formatDateTime(release.updated_at)}</dd>
    </dl>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}
