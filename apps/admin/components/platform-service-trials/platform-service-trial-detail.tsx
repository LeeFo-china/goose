"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import { PlatformServiceTrialActionDialog } from "./platform-service-trial-action-dialog";
import { PlatformServiceTrialFollowUps } from "./platform-service-trial-follow-ups";
import {
  getPlatformTrialDisabledReasons,
  resolvePlatformTrialAction,
} from "./platform-service-trial-action-state";
import {
  beginLatestTrialDetailRequest,
  invalidateTrialDetailRequests,
} from "./platform-service-trial-detail-request";
import {
  formatTrialDateTime,
  getTrialCapabilityLabel,
  getTrialSourceLabel,
  getTrialStatusMeta,
  getTrialTypeLabel,
} from "./platform-service-trial-rules";
import type {
  PlatformServiceTrialDetailData,
  PlatformServiceTrialListItem,
} from "./platform-service-trial-types";

const purchaseContractReason = "正式购买衔接尚未开放，请从技术服务套餐页独立办理";

export function PlatformServiceTrialDetail({
  trial,
  open,
  onOpenChange,
  canManage,
}: {
  trial: PlatformServiceTrialListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const [data, setData] = useState<PlatformServiceTrialDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const detailRequestCounter = useRef(0);

  const loadDetail = useCallback(async () => {
    const isCurrentRequest = beginLatestTrialDetailRequest(detailRequestCounter);
    setLoading(true);
    setError("");
    try {
      const result = await requestBackendJson<PlatformServiceTrialDetailData>(
        `/platform/billing/service-trials/${trial.id}`,
        { fallbackMessage: "技术服务试用详情加载失败" },
      );
      if (isCurrentRequest()) setData(result);
    } catch (caught) {
      if (isCurrentRequest()) {
        setError(caught instanceof Error ? caught.message : "技术服务试用详情加载失败");
      }
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [trial.id]);

  useEffect(() => {
    if (!open) {
      invalidateTrialDetailRequests(detailRequestCounter);
      return;
    }
    setData(null);
    void loadDetail();
    return () => invalidateTrialDetailRequests(detailRequestCounter);
  }, [loadDetail, open]);

  const current = data?.trial ?? trial;
  const actions = data?.available_actions ?? trial.available_actions;
  const statusMeta = getTrialStatusMeta(current.status);
  const disabledReasons = useMemo(
    () => getPlatformTrialDisabledReasons(actions)
      .map(({ key, reason }) => `${actionLabel(key)}：${reason}`),
    [actions],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{current.tenant.name}</SheetTitle>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <SheetDescription className="tabular-nums">
            试用编号 {current.id}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 flex flex-col gap-2">
              <StatusAlert>{error}</StatusAlert>
              <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => void loadDetail()}>
                <RefreshCw data-icon="inline-start" />
                重新加载详情
              </Button>
            </div>
          ) : null}
          {loading && !data ? <DetailSkeleton /> : (
            <div className="flex flex-col gap-5">
              <DetailSection title="企业概况">
                <Fact label="企业名称" value={current.tenant.name} />
                <Fact label="企业标识" value={current.tenant.slug} />
                <Fact label="装企联系人" value={current.tenant.contact_name} />
                <Fact label="装企联系电话" value={current.tenant.contact_phone} />
                <Fact label="平台跟进人" value={current.assignee?.name || "未分配"} />
              </DetailSection>
              <Separator />
              <DetailSection title="申请信息">
                <Fact label="来源" value={getTrialSourceLabel(current.source)} />
                <Fact label="类型" value={getTrialTypeLabel(current.trial_type)} />
                <Fact label="申请原因" value={current.application_reason || current.grant_reason} wide />
                <Fact label="预计人数" value={current.expected_user_count} />
                <Fact label="预计项目" value={current.expected_project_count} />
                <Fact label="申请联系人" value={current.contact_name} />
                <Fact label="申请联系电话" value={current.contact_phone} />
                <Fact label="审核意见" value={current.review_reason} wide />
              </DetailSection>
              <Separator />
              <DetailSection title="试用范围">
                <div className="col-span-full flex flex-wrap gap-2">
                  {current.scope.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline">
                      {getTrialCapabilityLabel(capability)}
                    </Badge>
                  ))}
                </div>
              </DetailSection>
              <Separator />
              <DetailSection title="试用期限">
                <Fact label="开始时间" value={formatTrialDateTime(current.starts_at)} numeric />
                <Fact label="试用截止" value={formatTrialDateTime(current.trial_ends_at)} numeric />
                <Fact label="宽限截止" value={formatTrialDateTime(current.grace_ends_at)} numeric />
                <Fact label="延期次数" value={current.extension_count} numeric />
                <Fact label="转正式时间" value={formatTrialDateTime(current.converted_at)} numeric />
                <Fact label="关联订单" value={current.converted_order_id} />
              </DetailSection>
              <Separator />
              <PlatformServiceTrialFollowUps
                trialId={current.id}
                enabled={open && Boolean(data)}
                canManage={canManage}
                onTrialRefresh={loadDetail}
              />
              <Separator />
              <section className="flex flex-col gap-3">
                <h3 className="text-base font-semibold">审计时间线</h3>
                {data?.trial.events.length ? (
                  <ol className="flex flex-col gap-3">
                    {data.trial.events.map((event) => (
                      <li key={event.id} className="grid gap-1 border-b pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[10rem_1fr]">
                        <time className="text-xs tabular-nums text-muted-foreground">
                          {formatTrialDateTime(event.occurred_at)}
                        </time>
                        <div className="min-w-0 text-sm">
                          <div className="font-medium">{eventLabel(event.event_type)}</div>
                          {event.reason ? <p className="mt-1 text-muted-foreground">{event.reason}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">暂无审计事件</p>}
              </section>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-card px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <PlatformServiceTrialActionDialog kind="approve" trial={current} action={resolvePlatformTrialAction(actions, "review")} onTrialUpdated={setData} />
            <PlatformServiceTrialActionDialog kind="reject" trial={current} action={resolvePlatformTrialAction(actions, "review")} onTrialUpdated={setData} />
            <PlatformServiceTrialActionDialog kind="extend" trial={current} action={resolvePlatformTrialAction(actions, "extend")} onTrialUpdated={setData} />
            <PlatformServiceTrialActionDialog kind="revoke" trial={current} action={resolvePlatformTrialAction(actions, "revoke")} onTrialUpdated={setData} />
            <PlatformServiceTrialActionDialog kind="assign" trial={current} action={resolvePlatformTrialAction(actions, "assign")} onTrialUpdated={setData} />
            <Button type="button" size="sm" variant="outline" disabled title={purchaseContractReason}>
              <ExternalLink data-icon="inline-start" />
              办理正式购买
            </Button>
          </div>
          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {disabledReasons.map((reason) => <span key={reason}>{reason}</span>)}
            <span>{purchaseContractReason}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-x-5 gap-y-3 sm:grid-cols-2"><h3 className="col-span-full text-base font-semibold">{title}</h3>{children}</section>;
}

function Fact({ label, value, wide, numeric }: { label: string; value: React.ReactNode; wide?: boolean; numeric?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : undefined}><div className="text-xs text-muted-foreground">{label}</div><div className={numeric ? "mt-1 break-words text-sm tabular-nums" : "mt-1 break-words text-sm"}>{value ?? "-"}</div></div>;
}

function DetailSkeleton() {
  return <div className="flex flex-col gap-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>;
}

function actionLabel(key: "review" | "extend" | "revoke" | "assign") {
  return ({ review: "审批", extend: "延期", revoke: "撤销", assign: "分配" } as const)[key];
}

function eventLabel(type: string) {
  return ({ application_submitted: "提交试用申请", application_withdrawn: "撤回试用申请", application_approved: "通过试用申请", application_rejected: "驳回试用申请", trial_granted: "开通试用", trial_activated: "试用生效", trial_grace_started: "进入宽限期", trial_expired: "试用到期", trial_extended: "延长试用", trial_revoked: "撤销试用", trial_assigned: "分配跟进人", formal_purchase_attributed: "转为正式服务", conversion_anomaly: "转化异常" } as Record<string, string>)[type] || type;
}
