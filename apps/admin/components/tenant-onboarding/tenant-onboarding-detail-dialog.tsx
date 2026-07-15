"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Loader2, RotateCw } from "lucide-react";

import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { StatusAlert } from "@/components/admin/status-alert";
import { TenantOnboardingDecisionControls } from "@/components/tenant-onboarding/tenant-onboarding-decision-dialog";
import {
  applicationStatusMeta,
  assistStatusMeta,
  formatDateTime,
  formatRegion,
  notificationEventLabels,
  notificationStatusMeta,
  reviewDecisionLabels,
  reviewStageLabels,
  type ListData,
  type TenantOnboardingApplicationDetail,
  type TenantOnboardingApplicationListRecord,
  type TenantOnboardingNotificationRecord,
  type TenantOnboardingReviewRecord,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

const DETAIL_PAGE_SIZE = 10;

type MutationPaths = {
  start: string;
  assist: string;
  supplement: string;
  approve: string;
  reject: string;
};
type RequestMutation = (path: string, body: Record<string, unknown>) => Promise<unknown>;
type RetryError = Error & { code?: string };

export function TenantOnboardingDetailDialog({
  application,
  open,
  paths,
  requestMutation,
  onOpenChange,
  onCompleted,
}: {
  application: TenantOnboardingApplicationListRecord;
  open: boolean;
  paths: MutationPaths;
  requestMutation: RequestMutation;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const router = useRouter();
  const basePath = `/platform/tenant-onboarding/applications/${application.id}`;
  const [detail, setDetail] = useState<TenantOnboardingApplicationDetail | null>(null);
  const [reviews, setReviews] = useState<ListData<TenantOnboardingReviewRecord> | null>(null);
  const [notifications, setNotifications] = useState<ListData<TenantOnboardingNotificationRecord> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState<"reviews" | "notifications" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [license, setLicense] = useState<{ url: string; expires_at: string } | null>(null);
  const [licensePending, setLicensePending] = useState(false);
  const [retryDelivery, setRetryDelivery] = useState<TenantOnboardingNotificationRecord | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryError, setRetryError] = useState<RetryError | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setLicense(null);
    Promise.all([
      requestBackendJson<TenantOnboardingApplicationDetail>(basePath, { signal: controller.signal }),
      requestBackendJson<ListData<TenantOnboardingReviewRecord>>(
        `${basePath}/reviews?page=1&pageSize=10`,
        { signal: controller.signal },
      ),
      requestBackendJson<ListData<TenantOnboardingNotificationRecord>>(
        `${basePath}/notifications?page=1&pageSize=10`,
        { signal: controller.signal },
      ),
    ]).then(([nextDetail, nextReviews, nextNotifications]) => {
      setDetail(nextDetail);
      setReviews(nextReviews);
      setNotifications(nextNotifications);
    }).catch((caught) => {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "申请详情加载失败");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [basePath, open]);

  const loadMore = useCallback(async (kind: "reviews" | "notifications") => {
    const current = kind === "reviews" ? reviews : notifications;
    if (!current || current.pagination.page >= current.pagination.totalPages) return;
    setLoadingMore(kind);
    setError(null);
    try {
      const nextPage = current.pagination.page + 1;
      if (kind === "reviews") {
        const next = await requestBackendJson<ListData<TenantOnboardingReviewRecord>>(
          `${basePath}/reviews?page=${nextPage}&pageSize=${DETAIL_PAGE_SIZE}`,
        );
        setReviews({ ...next, list: [...(reviews?.list || []), ...next.list] });
      } else {
        const next = await requestBackendJson<ListData<TenantOnboardingNotificationRecord>>(
          `${basePath}/notifications?page=${nextPage}&pageSize=${DETAIL_PAGE_SIZE}`,
        );
        setNotifications({ ...next, list: [...(notifications?.list || []), ...next.list] });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载更多记录失败");
    } finally {
      setLoadingMore(null);
    }
  }, [basePath, notifications, reviews]);

  async function requestLicense() {
    setLicensePending(true);
    setError(null);
    try {
      setLicense(await requestBackendJson<{ url: string; expires_at: string }>(
        `${basePath}/license-access`,
        { method: "POST" },
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "营业执照访问地址获取失败");
    } finally {
      setLicensePending(false);
    }
  }

  async function retryNotification() {
    if (!retryDelivery) return;
    setRetryPending(true);
    setRetryError(null);
    try {
      await requestMutation(
        `${basePath}/notifications/${retryDelivery.id}/retry`,
        {},
      );
      const refreshed = await requestBackendJson<ListData<TenantOnboardingNotificationRecord>>(
        `${basePath}/notifications?page=1&pageSize=10`,
      );
      setNotifications(refreshed);
      setRetryDelivery(null);
    } catch (caught) {
      setRetryError(
        caught instanceof Error
          ? caught as RetryError
          : new Error("通知重试失败") as RetryError,
      );
    } finally {
      setRetryPending(false);
    }
  }

  async function refreshApplicationAfterConflict() {
    const refreshed = await requestBackendJson<TenantOnboardingApplicationDetail>(basePath);
    setDetail(refreshed);
    router.refresh();
  }

  const applicationMeta = applicationStatusMeta[detail?.status ?? application.status];
  const assistMeta = assistStatusMeta[detail?.partner_assist_status ?? application.partner_assist_status];
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[86vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{application.company_name}</DialogTitle>
              <Badge variant={applicationMeta.variant}>{applicationMeta.label}</Badge>
              <Badge variant={assistMeta.variant}>{assistMeta.label}</Badge>
            </div>
            <DialogDescription className="tabular-nums">
              申请编号 {application.application_no}，版本 {detail?.version ?? application.version}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {loading ? <DetailSkeleton /> : null}
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {!loading && detail ? (
              <div className="flex flex-col gap-5">
                <section aria-labelledby="onboarding-company-detail">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="onboarding-company-detail" className="text-base font-semibold">申请资料</h2>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" disabled={licensePending} onClick={requestLicense}>
                        {licensePending
                          ? <Loader2 className="animate-spin" data-icon="inline-start" />
                          : <FileText data-icon="inline-start" />}
                        获取营业执照
                      </Button>
                      {license ? (
                        <Button asChild variant="outline">
                          <a href={license.url} target="_blank" rel="noreferrer">
                            <ExternalLink data-icon="inline-start" />
                            打开执照
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {license ? (
                    <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                      私有链接有效至 {formatDateTime(license.expires_at)}
                    </p>
                  ) : null}
                  <DetailList detail={detail} />
                </section>

                <Separator />
                <HistorySection
                  reviews={reviews}
                  loading={loadingMore === "reviews"}
                  onLoadMore={() => loadMore("reviews")}
                />
                <Separator />
                <NotificationSection
                  notifications={notifications}
                  loading={loadingMore === "notifications"}
                  onLoadMore={() => loadMore("notifications")}
                  onRetry={(delivery) => {
                    setRetryError(null);
                    setRetryDelivery(delivery);
                  }}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t bg-muted/20 px-6 py-4">
            {detail ? (
              <TenantOnboardingDecisionControls
                application={detail}
                paths={paths}
                requestMutation={requestMutation}
                onConflictRefresh={refreshApplicationAfterConflict}
                onCompleted={onCompleted}
              />
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={retryDelivery !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !retryPending) {
            setRetryDelivery(null);
            setRetryError(null);
          }
        }}
        title="重试申请通知"
        description={`将重新发送此短信，当前已尝试 ${retryDelivery?.attempt_count || 0} 次。`}
        confirmLabel="重试发送"
        pending={retryPending}
        onConfirm={retryNotification}
      >
        {retryError ? (
          <StatusAlert>
            {retryError.code ? `${retryError.message}（${retryError.code}）` : retryError.message}
          </StatusAlert>
        ) : null}
      </ConfirmActionDialog>
    </>
  );
}

function DetailList({ detail }: { detail: TenantOnboardingApplicationDetail }) {
  const partner = detail.final_partner ?? detail.candidate_partner;
  const rows = [
    ["统一社会信用代码", detail.unified_social_credit_code],
    ["管理员", `${detail.admin_name} ${detail.admin_phone}`],
    ["公司地址", `${formatRegion(detail)} ${detail.address}`.trim()],
    ["地址区域代码", detail.address_region_code],
    ["服务区域代码", detail.service_region_codes.join("、")],
    ["城市合伙人", partner?.name || "暂未归因"],
    ["申请来源", detail.source_channel === "partner_invite" ? "合伙人邀请" : "本地服务商页"],
    ["隐私与条款", `${detail.privacy_policy_version} / ${detail.onboarding_terms_version}`],
  ];
  return (
    <dl className="mt-3 grid overflow-hidden rounded-md border sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 border-b px-3 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium tabular-nums">{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistorySection({
  reviews,
  loading,
  onLoadMore,
}: {
  reviews: ListData<TenantOnboardingReviewRecord> | null;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section aria-labelledby="onboarding-review-history" className="flex flex-col gap-3">
      <h2 id="onboarding-review-history" className="text-base font-semibold">审核记录</h2>
      <div className="overflow-hidden rounded-md border">
        {reviews?.list.length ? reviews.list.map((review) => (
          <div key={review.id} className="border-b px-3 py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{reviewStageLabels[review.review_stage]}</Badge>
                <span className="text-sm font-medium">
                  {reviewDecisionLabels[review.decision] || review.decision}
                </span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(review.created_at)}</span>
            </div>
            {review.remark ? <p className="mt-2 text-sm text-muted-foreground">{review.remark}</p> : null}
          </div>
        )) : <p className="px-3 py-5 text-sm text-muted-foreground">暂无审核记录</p>}
      </div>
      <LoadMoreButton pagination={reviews?.pagination} loading={loading} onClick={onLoadMore} />
    </section>
  );
}

function NotificationSection({
  notifications,
  loading,
  onLoadMore,
  onRetry,
}: {
  notifications: ListData<TenantOnboardingNotificationRecord> | null;
  loading: boolean;
  onLoadMore: () => void;
  onRetry: (delivery: TenantOnboardingNotificationRecord) => void;
}) {
  return (
    <section aria-labelledby="onboarding-notifications" className="flex flex-col gap-3">
      <h2 id="onboarding-notifications" className="text-base font-semibold">申请人通知</h2>
      <div className="overflow-hidden rounded-md border">
        {notifications?.list.length ? notifications.list.map((delivery) => {
          const statusMeta = notificationStatusMeta[delivery.status];
          return (
            <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 last:border-b-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  <span className="text-sm font-medium">{notificationEventLabels[delivery.event_type]}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  尝试 {delivery.attempt_count} 次，更新于 {formatDateTime(delivery.updated_at)}
                </p>
                {delivery.last_error ? <p className="mt-1 text-xs text-destructive">{delivery.last_error}</p> : null}
              </div>
              {delivery.status === "failed" ? (
                <Button type="button" size="sm" variant="outline" onClick={() => onRetry(delivery)}>
                  <RotateCw data-icon="inline-start" />
                  重试通知
                </Button>
              ) : null}
            </div>
          );
        }) : <p className="px-3 py-5 text-sm text-muted-foreground">暂无通知记录</p>}
      </div>
      <LoadMoreButton pagination={notifications?.pagination} loading={loading} onClick={onLoadMore} />
    </section>
  );
}

function LoadMoreButton({
  pagination,
  loading,
  onClick,
}: {
  pagination?: { page: number; totalPages: number };
  loading: boolean;
  onClick: () => void;
}) {
  if (!pagination || pagination.page >= pagination.totalPages) return null;
  return (
    <Button type="button" size="sm" variant="outline" className="self-start" disabled={loading} onClick={onClick}>
      {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
      加载更多
    </Button>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="正在加载申请详情">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
