"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  buildVirtualChannelPatch,
  buildVirtualPaymentSettingsPatch,
  virtualPaymentEnvironmentLabels,
  virtualPaymentModeLabels,
  type VirtualPaymentChannelDraft,
} from "@/components/settings/platform-virtual-payment-settings-data";
import {
  createVirtualPaymentUiError,
  toSafeVirtualPaymentMutationMessage,
} from "@/components/settings/platform-virtual-payment-errors";
import { PlatformVirtualPaymentChannelCard } from
  "@/components/settings/platform-virtual-payment-channel-card";
import { VirtualPaymentModeCard } from "@/components/settings/platform-virtual-payment-mode-card";
import { createLatestRefreshCoordinator } from "@/components/settings/platform-virtual-payment-refresh-coordinator";
import { PlatformVirtualPaymentSecretForm } from "@/components/settings/platform-virtual-payment-secret-form";
import type {
  PlatformVirtualPaymentProductSummary,
  PlatformVirtualPaymentSettingsPatch,
  PlatformVirtualPaymentSettingsView,
} from "@/components/settings/platform-virtual-payment-settings-types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";
import type {
  BrandingPurchaseMode,
  BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

const SETTINGS_PATH = "/platform/payment/wechat-virtual/branding-entitlement";
const MUTATION_REFRESH_ERROR =
  "已提交，但最新状态刷新失败，请重新加载。";

export function PlatformVirtualPaymentSettings({
  environment,
  onEnvironmentChange,
}: {
  environment: BrandingVirtualPaymentEnvironment;
  onEnvironmentChange: (environment: BrandingVirtualPaymentEnvironment) => void;
}) {
  const [snapshot, setSnapshot] =
    useState<PlatformVirtualPaymentSettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [modeError, setModeError] = useState("");
  const [modePending, setModePending] = useState(false);
  const refreshCoordinator = useRef(createLatestRefreshCoordinator());
  const activeSummary = snapshot?.virtual_products.find((item) =>
    item.environment === environment
  );

  const refreshSnapshot = useCallback(
    async function refreshSnapshot(): Promise<boolean> {
      setLoading(true);
      setLoadError("");
      return refreshCoordinator.current.run(
        () =>
          requestBackendJson<PlatformVirtualPaymentSettingsView>(
            "/platform/payment/wechat-virtual/branding-entitlement",
            { fallbackMessage: "微信虚拟支付配置加载失败" },
          ),
        {
          onSuccess: (result) => {
            setSnapshot(result);
            setLoading(false);
          },
          onError: () => {
            setLoadError("微信虚拟支付配置加载失败，请稍后重试。");
            setLoading(false);
          },
        },
      );
    },
    [],
  );

  useEffect(() => {
    void refreshSnapshot();
    return () => {
      refreshCoordinator.current.invalidate();
    };
  }, [refreshSnapshot]);

  async function ensureSnapshotRefreshed() {
    const refreshed = await refreshSnapshot();
    if (!refreshed) throw createVirtualPaymentUiError(MUTATION_REFRESH_ERROR);
  }

  async function patchSettings(
    payload: PlatformVirtualPaymentSettingsPatch,
    successMessage: string,
  ) {
    setNotice("");
    await requestBackendJson(SETTINGS_PATH, {
      method: "PATCH",
      body: JSON.stringify(payload),
      fallbackMessage: "微信虚拟支付配置保存失败",
    });
    await ensureSnapshotRefreshed();
    setNotice(successMessage);
  }

  async function saveChannel(
    summary: PlatformVirtualPaymentProductSummary,
    draft: VirtualPaymentChannelDraft,
  ) {
    if (!snapshot) return;
    const patchResult = buildVirtualChannelPatch({ summary, draft });
    if (!patchResult.ok) throw createVirtualPaymentUiError(patchResult.message);
    setNotice("");
    await requestBackendJson(
      `/platform/payment/wechat-virtual/channels/${environment}`,
      {
        method: "PUT",
        body: JSON.stringify(patchResult.patch),
        fallbackMessage: "虚拟支付渠道配置保存失败",
      },
    );
    await ensureSnapshotRefreshed();
    setNotice(`${virtualPaymentEnvironmentLabels[environment]}渠道配置已保存。`);
  }

  async function saveSecret(input: { appKey: string; revision: number }) {
    setNotice("");
    await requestBackendJson(
      `${SETTINGS_PATH}/${environment}/secret-bundle`,
      {
        method: "PUT",
        body: JSON.stringify({ app_key: input.appKey, revision: input.revision }),
        fallbackMessage: "AppKey 保存失败",
      },
    );
    await ensureSnapshotRefreshed();
    setNotice(`${virtualPaymentEnvironmentLabels[environment]} AppKey 已更新。`);
  }

  async function saveMessageToken(messageToken: string) {
    setNotice("");
    await requestBackendJson(
      "/platform/payment/wechat-virtual/message-token",
      {
        method: "PUT",
        body: JSON.stringify({ message_token: messageToken }),
        fallbackMessage: "支付消息令牌保存失败",
      },
    );
    await ensureSnapshotRefreshed();
    setNotice("支付消息令牌已更新。");
  }

  async function changeMode(nextMode: BrandingPurchaseMode) {
    if (!snapshot || modePending || !snapshot.can_manage) return;
    setModeError("");
    setModePending(true);
    const result = buildVirtualPaymentSettingsPatch({
      currentMode: snapshot.product.purchase_mode,
      nextMode,
      version: snapshot.product.version,
    });
    if (!result.ok) {
      setModeError(result.message);
      setModePending(false);
      return;
    }
    try {
      await patchSettings(result.patch, `购买通道已切换为${virtualPaymentModeLabels[nextMode]}。`);
    } catch (caught) {
      setModeError(toSafeVirtualPaymentMutationMessage(
        caught,
        "购买通道切换失败，请刷新后重试。",
      ));
    } finally {
      setModePending(false);
    }
  }

  if (loading && !snapshot) return <VirtualPaymentSettingsSkeleton />;
  if (!snapshot) {
    return (
      <Empty className="min-h-80">
        <EmptyHeader>
          <EmptyMedia variant="icon"><RefreshCw /></EmptyMedia>
          <EmptyTitle>配置暂时无法加载</EmptyTitle>
          <EmptyDescription>{loadError}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => void refreshSnapshot()}>
            <RefreshCw data-icon="inline-start" />
            重新加载
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const summary = activeSummary;
  return (
    <div className="flex min-h-0 flex-col gap-4">
      {loadError ? <StatusAlert>{loadError}</StatusAlert> : null}
      {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}
      {!snapshot.can_manage ? (
        <StatusAlert tone="warning">
          当前账号只有查看权限，不能修改、校验或启用虚拟支付配置。
        </StatusAlert>
      ) : null}

      <VirtualPaymentModeCard
        snapshot={snapshot}
        modePending={modePending}
        modeError={modeError}
        onChangeMode={changeMode}
      />

      <Tabs
        value={environment}
        onValueChange={(value) =>
          onEnvironmentChange(value as BrandingVirtualPaymentEnvironment)
        }
        className="flex flex-col gap-4"
      >
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList>
            <TabsTrigger value="sandbox">沙箱环境</TabsTrigger>
            <TabsTrigger value="production">生产环境</TabsTrigger>
          </TabsList>
        </div>
        {summary ? (
          <TabsContent value={environment} className="m-0">
            <div className="flex flex-col gap-4">
              <div className="rounded-md border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    商品事实、价格、渠道标识和微信上传发布流程已统一迁移到虚拟商品管理。
                  </span>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/platform/virtual-products">
                      <ExternalLink data-icon="inline-start" />
                      去管理虚拟商品
                    </Link>
                  </Button>
                </div>
              </div>
              <PlatformVirtualPaymentChannelCard
                key={`${environment}:${summary.mapping?.version ?? 0}`}
                summary={summary}
                readonly={!snapshot.can_manage}
                onSave={saveChannel}
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <PlatformVirtualPaymentSecretForm
                  key={`${environment}:${summary.secret.revision ?? 0}:${snapshot.message_auth.message_token.valid}`}
                  environment={environment}
                  summary={summary}
                  secretSource={snapshot.virtual_secret_sources[environment]}
                  messageAuth={snapshot.message_auth}
                  readonly={!snapshot.can_manage}
                  onSaveSecret={saveSecret}
                  onSaveMessageToken={saveMessageToken}
                />
              </div>
            </div>
          </TabsContent>
        ) : (
          <TabsContent value={environment} className="m-0">
            <Empty className="min-h-64">
              <EmptyHeader>
                <EmptyTitle>当前环境尚无配置</EmptyTitle>
                <EmptyDescription>
                  刷新统一快照后再继续配置虚拟支付渠道。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void refreshSnapshot()}>
                  <RefreshCw data-icon="inline-start" />
                  刷新配置
                </Button>
              </EmptyContent>
            </Empty>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function VirtualPaymentSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="虚拟支付配置加载中">
      {["mode", "channel"].map((key) => (
        <VirtualPaymentCardSkeleton
          key={key}
          detailCount={key === "mode" ? 3 : 2}
          showHeaderMeta={key === "channel"}
        />
      ))}
      <div className="grid gap-4 xl:grid-cols-2">
        {["secret", "message-token"].map((key) => (
          <VirtualPaymentCardSkeleton key={key} />
        ))}
      </div>
    </div>
  );
}

function VirtualPaymentCardSkeleton({
  detailCount = 2,
  showHeaderMeta = false,
}: {
  detailCount?: number;
  showHeaderMeta?: boolean;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
        {showHeaderMeta ? <Skeleton className="h-3 w-36" /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div
          className={cn(
            "grid gap-4",
            detailCount === 3 ? "sm:grid-cols-3" : "md:grid-cols-2",
          )}
        >
          {Array.from({ length: detailCount }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-5">
        <Skeleton className="h-9 w-28" />
      </CardFooter>
    </Card>
  );
}
