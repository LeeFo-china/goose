"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, QrCode, UploadCloud } from
  "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { requestBackendJson } from "@/lib/backend-client";
import {
  getDouyinReleasePageOptions,
  type PlatformDouyinInstallation,
} from "./platform-douyin-release-rules";

type DouyinTestRelease = {
  id: string;
  template_id: string;
  template_version: string;
  description: string;
  status: string;
  test_qr_url: string | null;
};

export function PlatformDouyinReleasePanel({
  installations,
  initialError,
  merchantPagination,
  templateAppId,
}: {
  installations: PlatformDouyinInstallation[];
  initialError: string | null;
  merchantPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  templateAppId: string | null;
}) {
  const options = getDouyinReleasePageOptions(installations);
  const [merchantId, setMerchantId] = useState(options.defaultMerchantId);
  const [release, setRelease] = useState<DouyinTestRelease | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const canPromote = Boolean(templateAppId && merchantId && !pending);

  async function promoteLatestTemplate() {
    if (!canPromote) return;
    setPending(true);
    setError(null);
    setRelease(null);
    try {
      const nextRelease = await requestBackendJson<DouyinTestRelease>(
        `/platform/douyin-miniapps/${encodeURIComponent(merchantId)}`
          + "/releases/promote-latest-template",
        {
          method: "POST",
          body: JSON.stringify({ channel: "default" }),
          fallbackMessage: "生成抖音体验版失败",
        },
      );
      setRelease(nextRelease);
      toast.success("商家体验版已生成");
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "生成抖音体验版失败";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-normal">抖音小程序发布</h1>
        <p className="text-sm text-muted-foreground">
          模板草稿转体验版
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="max-w-4xl shadow-none">
        <CardHeader className="border-b">
          <CardTitle>生成商家体验版</CardTitle>
          <CardDescription>默认通道，提审与正式发布单独执行。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label>模板源</Label>
              <div className="flex h-9 items-center justify-between rounded-md border bg-muted/40 px-3 text-sm">
                <span className="truncate font-mono">
                  {templateAppId ?? "未配置"}
                </span>
                <Badge variant={templateAppId ? "secondary" : "danger"}>
                  {templateAppId ? "已固定" : "不可用"}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="douyin-merchant">目标商家</Label>
              <Select value={merchantId} onValueChange={setMerchantId}>
                <SelectTrigger id="douyin-merchant">
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

            <Button onClick={promoteLatestTemplate} disabled={!canPromote}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud aria-hidden="true" />
              )}
              {pending ? "正在生成" : "生成体验版"}
            </Button>
          </div>

          {!templateAppId || options.merchants.length === 0 ? (
            <Alert>
              <AlertCircle aria-hidden="true" />
              <AlertTitle>发布条件不完整</AlertTitle>
              <AlertDescription>
                {!templateAppId
                  ? "未找到启用中的模板开发小程序。"
                  : "没有具备开发权限的已授权商家。"}
              </AlertDescription>
            </Alert>
          ) : null}

          {release ? (
            <>
              <Separator />
              <section className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <div className="flex aspect-square items-center justify-center rounded-md border bg-white p-2">
                  {release.test_qr_url ? (
                    // Provider QR URLs are dynamic and cannot be declared in next/image config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={release.test_qr_url}
                      alt="抖音小程序体验二维码"
                      className="size-full object-contain"
                    />
                  ) : (
                    <QrCode className="size-10 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    体验版已生成
                  </div>
                  <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <dt className="text-muted-foreground">模板 ID</dt>
                    <dd className="font-mono">{release.template_id}</dd>
                    <dt className="text-muted-foreground">版本</dt>
                    <dd>{release.template_version}</dd>
                    <dt className="text-muted-foreground">版本说明</dt>
                    <dd className="break-words">{release.description}</dd>
                  </dl>
                </div>
              </section>
            </>
          ) : null}

          {merchantPagination.totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
              <span className="text-muted-foreground">
                商家 {merchantPagination.total} 个，第 {merchantPagination.page}
                /{merchantPagination.totalPages} 页
              </span>
              <div className="flex gap-2">
                {merchantPagination.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/platform/douyin-miniapps?merchantPage=${merchantPagination.page - 1}`}>
                      上一页
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>上一页</Button>
                )}
                {merchantPagination.page < merchantPagination.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/platform/douyin-miniapps?merchantPage=${merchantPagination.page + 1}`}>
                      下一页
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>下一页</Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
