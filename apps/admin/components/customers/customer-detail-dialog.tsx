"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, MessageSquareText, Share2, Tags } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerFollowUpRecord, CustomerRecord, CustomerSourceRecord } from "@/components/customers/customer-mutation-types";
import { formatDate, formatDateTime, getSourceBadges, ownerName, requestCustomer, sourceActorName, sourceOptions, SourceTags } from "@/components/customers/customer-mutation-shared";
import { CustomerStatusPanel } from "@/components/customers/customer-status-panel";

export function CustomerDetailDialog({
  customer: initialCustomer,
  onClose,
}: {
  customer: CustomerRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState(initialCustomer);
  const initialActivity = initialCustomer.detail_activity;
  const [followUps, setFollowUps] = useState<CustomerFollowUpRecord[]>(
    initialActivity?.follow_ups?.list || [],
  );
  const [sources, setSources] = useState<CustomerSourceRecord[]>(
    initialActivity?.sources?.list || [],
  );
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [followUpsError, setFollowUpsError] = useState("");
  const [sourcesError, setSourcesError] = useState("");

  useEffect(() => {
    setCustomer(initialCustomer);
    setFollowUps(initialCustomer.detail_activity?.follow_ups?.list || []);
    setSources(initialCustomer.detail_activity?.sources?.list || []);
  }, [initialCustomer]);

  async function refreshCustomer() {
    const data = await requestCustomer({
      path: `/customers/${customer.id}/detail?include_activity=1`,
    });
    setCustomer(data as CustomerRecord);
    router.refresh();
  }

  useEffect(() => {
    const activity = customer.detail_activity;
    if (activity) {
      setFollowUps(activity.follow_ups?.list || []);
      setSources(activity.sources?.list || []);
      setFollowUpsLoading(false);
      setSourcesLoading(false);
      setFollowUpsError("");
      setSourcesError("");
      return;
    }

    let cancelled = false;
    setFollowUpsLoading(true);
    setSourcesLoading(true);
    setFollowUpsError("");
    setSourcesError("");
    requestCustomer({ path: `/customers/${customer.id}/follow_ups?page=1&pageSize=10` })
      .then((data) => {
        if (!cancelled) setFollowUps(data?.list || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setFollowUpsError(err instanceof Error ? err.message : "跟进记录加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setFollowUpsLoading(false);
      });
    requestCustomer({ path: `/customers/${customer.id}/sources?page=1&pageSize=20` })
      .then((data) => {
        if (!cancelled) setSources(data?.list || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setSourcesError(err instanceof Error ? err.message : "来源时间线加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer.id, customer.detail_activity]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[820px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5 text-left">
          <div>
            <DialogTitle>{customer.name || "未命名客户"}</DialogTitle>
            <DialogDescription>{customer.id}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex max-h-[calc(88vh-82px)] flex-col gap-5 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <InfoItem label="手机号" value={customer.phone || customer.phone_masked || "-"} />
            <InfoItem label="负责人" value={ownerName(customer.owner)} />
            <InfoItem label="来源" value={sourceOptions.find(([value]) => value === customer.source)?.[1] || customer.source || "-"} />
            <InfoItem label="创建时间" value={formatDate(customer.created_at)} />
            <InfoItem label="最近跟进" value={formatDateTime(customer.last_follow_at)} />
            <InfoItem label="下次跟进" value={formatDateTime(customer.next_follow_at)} />
            <InfoItem label="主小区" value={customer.community || "-"} />
            <InfoItem label="楼栋门牌" value={customer.building_info || "-"} />
            <InfoItem label="面积" value={customer.area != null ? `${customer.area}㎡` : "-"} />
            <InfoItem label="户型" value={customer.layout || "-"} />
          </div>
          <CustomerStatusPanel
            customer={customer}
            initialActionsData={customer.detail_activity?.status_actions}
            initialTransitions={customer.detail_activity?.status_transitions?.rows}
            onChanged={refreshCustomer}
          />
          {customer.latest_source || getSourceBadges(customer).length > 0 ? (
            <section className="rounded-md border bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Tags />
                  线索来源
                </div>
                <SourceTags customer={customer} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoItem
                  label="最近来源"
                  value={customer.latest_source?.display_label || customer.source_summary?.latest_source?.display_label || "-"}
                />
                <InfoItem
                  label="来源时间"
                  value={formatDateTime(customer.latest_source?.created_at || customer.source_summary?.latest_source?.created_at)}
                />
                <InfoItem
                  label="来源总数"
                  value={String(customer.source_summary?.total ?? sources.length ?? 0)}
                />
              </div>
            </section>
          ) : null}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">来源时间线</h3>
              <Badge variant="outline">最近 20 条</Badge>
            </div>
            {sourcesError ? <StatusAlert>{sourcesError}</StatusAlert> : null}
            {sourcesLoading ? (
              <div className="flex h-24 items-center justify-center rounded-md border text-sm text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" />
                正在加载来源记录
              </div>
            ) : sources.length > 0 ? (
              <div className="relative ml-3 flex flex-col gap-4 border-l pl-5">
                {sources.map((item) => (
                  <div key={item.id} className="relative rounded-md border bg-background p-3">
                    <span className="absolute -left-[27px] top-4 flex size-4 rounded-full border-2 border-background bg-secondary" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Share2 />
                        {item.display_label || item.source}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.is_old_customer_new_lead ? <Badge variant="warning">老客户新线索</Badge> : null}
                      {item.is_platform_new_lead ? <Badge variant="default">平台新线索</Badge> : null}
                      {item.is_employee_share ? <Badge variant="secondary">员工分享</Badge> : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <div>操作人：{sourceActorName(item)}</div>
                      <div>去重：{item.dedupe_result || "-"}</div>
                      <div>平台线索：{item.platform_lead?.name || item.platform_lead?.phone || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                暂无来源记录。
              </div>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">跟进记录</h3>
              <Badge variant="outline">最近 10 条</Badge>
            </div>
            {followUpsError ? <StatusAlert>{followUpsError}</StatusAlert> : null}
            {followUpsLoading ? (
              <div className="flex h-28 items-center justify-center rounded-md border text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在加载跟进记录
              </div>
            ) : followUps.length > 0 ? (
              <div className="relative ml-3 flex flex-col gap-4 border-l pl-5">
                {followUps.map((item) => (
                  <div key={item.id} className="relative rounded-md border bg-background p-3">
                    <span className="absolute -left-[27px] top-4 flex size-4 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquareText className="size-4 text-primary" />
                        {item.employee_name || ownerName(item.employee) || "未知员工"}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {item.content}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      下次跟进 {formatDateTime(item.next_follow_at)}
                      {item.comment_count ? (
                        <Badge variant="outline">评论 {item.comment_count}</Badge>
                      ) : null}
                    </div>
                    {item.latest_comment_preview ? (
                      <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                        最新评论：{item.latest_comment_preview.author_employee_name || "员工"}：
                        {item.latest_comment_preview.content}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                暂无跟进记录。
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold">房产列表</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {(customer.properties || []).map((property) => (
              <div key={property.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{property.community || "-"}</div>
                    {property.is_primary ? <Badge variant="success">主房产</Badge> : null}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[property.building_info, property.layout, property.area != null ? `${property.area}㎡` : null]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </div>
                </div>
              ))}
              {(customer.properties || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无房产
                </div>
              ) : null}
            </div>
          </section>
          {customer.douyin_screenshot_images?.length ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold">抖音截图</h3>
              <div className="flex flex-col gap-2">
                {customer.douyin_screenshot_images.map((image) => (
                  <a
                    key={image}
                    href={image}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate rounded-md border p-3 text-sm text-primary"
                  >
                    {image}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
