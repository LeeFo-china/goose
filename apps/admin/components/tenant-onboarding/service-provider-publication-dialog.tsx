"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PauseCircle, RefreshCw, RotateCcw } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  formatDateTime,
  formatRegion,
  publicationStatusMeta,
  type ListData,
  type ServiceProviderArea,
  type ServiceProviderProfile,
  type ServiceProviderPublicationListRecord,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

const AREA_PAGE_SIZE = 10;
type PublicationAction = "publish" | "returnDraft" | "suspend";
type MutationPaths = Record<PublicationAction, string>;
type RequestMutation = (path: string, body: Record<string, unknown>) => Promise<unknown>;

export function ServiceProviderPublicationDialog({
  publication,
  open,
  paths,
  requestMutation,
  onOpenChange,
  onCompleted,
}: {
  publication: ServiceProviderPublicationListRecord;
  open: boolean;
  paths: MutationPaths;
  requestMutation: RequestMutation;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const router = useRouter();
  const basePath = `/platform/service-provider-publications/${publication.tenant_id}`;
  const [profile, setProfile] = useState<ServiceProviderProfile | null>(null);
  const [areas, setAreas] = useState<ListData<ServiceProviderArea> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<PublicationAction | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      requestBackendJson<ServiceProviderProfile>(basePath, { signal: controller.signal }),
      requestBackendJson<ListData<ServiceProviderArea>>(
        `${basePath}/areas?page=1&pageSize=10`,
        { signal: controller.signal },
      ),
    ]).then(([nextProfile, nextAreas]) => {
      setProfile(nextProfile);
      setAreas(nextAreas);
    }).catch((caught) => {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "发布资料加载失败");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [basePath, open]);

  async function loadMoreAreas() {
    if (!areas || areas.pagination.page >= areas.pagination.totalPages) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = areas.pagination.page + 1;
      const next = await requestBackendJson<ListData<ServiceProviderArea>>(
        `${basePath}/areas?page=${page}&pageSize=${AREA_PAGE_SIZE}`,
      );
      setAreas({ ...next, list: [...areas.list, ...next.list] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "服务区域加载失败");
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshProfileAfterConflict() {
    const refreshed = await requestBackendJson<ServiceProviderProfile>(basePath);
    setProfile(refreshed);
    router.refresh();
  }

  const currentStatus = profile?.status ?? publication.status;
  const statusMeta = publicationStatusMeta[currentStatus];
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[86vh] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{publication.tenant_name}</DialogTitle>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            </div>
            <DialogDescription>
              核对公开资料和服务区域后，再决定是否允许在小程序本地服务商页展示。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {loading ? <PublicationSkeleton /> : null}
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {!loading && profile ? (
              <div className="flex flex-col gap-5">
                <section aria-labelledby="service-provider-profile-heading">
                  <h2 id="service-provider-profile-heading" className="text-base font-semibold">公开资料</h2>
                  <ProfileDetail profile={profile} />
                </section>
                <Separator />
                <section aria-labelledby="service-provider-areas-heading" className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="service-provider-areas-heading" className="text-base font-semibold">服务区域</h2>
                    <Badge variant="outline" className="tabular-nums">共 {areas?.pagination.total || 0} 个</Badge>
                  </div>
                  <AreaTable areas={areas?.list || []} />
                  {areas && areas.pagination.page < areas.pagination.totalPages ? (
                    <Button type="button" size="sm" variant="outline" className="self-start" disabled={loadingMore} onClick={loadMoreAreas}>
                      {loadingMore ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                      加载更多
                    </Button>
                  ) : null}
                </section>
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 border-t bg-muted/20 px-6 py-4">
            {profile?.status === "pending_review" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setAction("returnDraft")}>
                  <RotateCcw data-icon="inline-start" />
                  退回修改
                </Button>
                <Button type="button" onClick={() => setAction("publish")}>
                  <Check data-icon="inline-start" />
                  发布展示
                </Button>
              </>
            ) : null}
            {profile?.status === "published" ? (
              <Button type="button" variant="destructive" onClick={() => setAction("suspend")}>
                <PauseCircle data-icon="inline-start" />
                暂停展示
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {profile ? (
        <PublicationDecisionDialog
          action={action}
          profile={profile}
          paths={paths}
          requestMutation={requestMutation}
          onConflictRefresh={refreshProfileAfterConflict}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setAction(null);
          }}
          onCompleted={() => {
            setAction(null);
            onCompleted();
          }}
        />
      ) : null}
    </>
  );
}

function ProfileDetail({ profile }: { profile: ServiceProviderProfile }) {
  const rows = [
    ["公开名称", profile.public_name],
    ["公开电话", profile.public_phone],
    ["公司地址", `${formatRegion(profile)} ${profile.address || ""}`.trim()],
    ["地址区域代码", profile.address_region_code],
    ["提交时间", formatDateTime(profile.submitted_at)],
    ["上次审核", formatDateTime(profile.reviewed_at)],
  ];
  return (
    <div className="mt-3 flex flex-col gap-3">
      <dl className="grid overflow-hidden rounded-md border sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 border-b px-3 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium tabular-nums">{value || "-"}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-md border px-3 py-2">
        <div className="text-xs text-muted-foreground">公司简介</div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{profile.introduction || "未填写"}</p>
      </div>
    </div>
  );
}

function AreaTable({ areas }: { areas: ServiceProviderArea[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>区域</TableHead>
          <TableHead>行政区划代码</TableHead>
          <TableHead>优先级</TableHead>
          <TableHead>展示状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {areas.length ? areas.map((area) => (
          <TableRow key={area.id}>
            <TableCell className="font-medium">{[area.province, area.city, area.district].filter(Boolean).join(" ")}</TableCell>
            <TableCell className="tabular-nums">{area.adcode}</TableCell>
            <TableCell className="tabular-nums">{area.priority}</TableCell>
            <TableCell><Badge variant={area.status === "active" ? "success" : "outline"}>{area.status === "active" ? "展示中" : "未展示"}</Badge></TableCell>
          </TableRow>
        )) : (
          <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">暂无服务区域</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function PublicationDecisionDialog({
  action,
  profile,
  paths,
  requestMutation,
  onConflictRefresh,
  onOpenChange,
  onCompleted,
}: {
  action: PublicationAction | null;
  profile: ServiceProviderProfile;
  paths: MutationPaths;
  requestMutation: RequestMutation;
  onConflictRefresh: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const [remark, setRemark] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const config = action ? decisionConfig[action] : null;

  async function submit() {
    if (!action || !remark.trim()) return;
    setPending(true);
    setError(null);
    try {
      await requestMutation(paths[action], {
        version: profile.version,
        review_remark: remark.trim(),
      });
      onCompleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught as RequestError : new Error("发布操作失败"));
    } finally {
      setPending(false);
    }
  }

  async function refreshConflict() {
    setRefreshPending(true);
    try {
      await onConflictRefresh();
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught as RequestError : new Error("发布资料刷新失败"));
    } finally {
      setRefreshPending(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (pending || refreshPending)) return;
    if (!nextOpen) {
      setRemark("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={action !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config?.title || "发布操作"}</DialogTitle>
          <DialogDescription>{config?.description}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={!remark.trim()}>
            <FieldLabel htmlFor="publication-review-remark">审核意见</FieldLabel>
            <Textarea
              id="publication-review-remark"
              value={remark}
              maxLength={500}
              rows={4}
              disabled={pending}
              aria-invalid={!remark.trim()}
              placeholder={config?.placeholder}
              onChange={(event) => setRemark(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {error ? <StatusAlert>{error.code ? `${error.message}（${error.code}）` : error.message}</StatusAlert> : null}
        <DialogFooter>
          {error && (error.status === 409 || error.code === "SERVICE_PROVIDER_STATE_CONFLICT") ? (
            <Button type="button" variant="outline" disabled={refreshPending} onClick={refreshConflict}>
              <RefreshCw className={refreshPending ? "animate-spin" : undefined} data-icon="inline-start" />
              刷新后重试
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={pending || refreshPending} onClick={() => handleOpenChange(false)}>取消</Button>
          <Button type="button" variant={action === "suspend" ? "destructive" : "default"} disabled={pending || refreshPending || !remark.trim()} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {config?.submitLabel || "提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const decisionConfig: Record<PublicationAction, {
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
}> = {
  publish: { title: "发布服务商资料", description: "发布后仅在服务区域覆盖访客定位时展示。", placeholder: "填写资料与区域审核结论", submitLabel: "确认发布" },
  returnDraft: { title: "退回服务商资料", description: "所有服务区域将保持未展示，装修公司可继续修改。", placeholder: "填写需要修改的内容", submitLabel: "退回修改" },
  suspend: { title: "暂停服务商展示", description: "暂停后该公司不会出现在访客本地服务商列表。", placeholder: "填写暂停原因", submitLabel: "确认暂停" },
};

type RequestError = Error & { code?: string; status?: number };

function PublicationSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="正在加载发布资料">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
