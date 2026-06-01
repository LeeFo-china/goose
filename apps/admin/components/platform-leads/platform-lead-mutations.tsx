"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2, Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  getPlatformLeadDedupeLabel,
  getPlatformLeadStatusMeta,
  type PlatformLeadDetail,
  type PlatformLeadRecord,
} from "@/components/platform-leads/platform-lead-types";
import type {
  PlatformTenantListData,
  PlatformTenantRecord,
} from "@/components/platform-tenants/platform-tenant-types";
import { requestBackendJson } from "@/lib/backend-client";

async function requestJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function formatArea(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}㎡` : "-";
}

function leadStatusBadge(status: string | null | undefined) {
  const meta = getPlatformLeadStatusMeta(status);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function AssignLeadPanel({
  lead,
  onAssigned,
}: {
  lead: PlatformLeadRecord;
  onAssigned: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [tenantKeyword, setTenantKeyword] = useState("");
  const [tenantOptions, setTenantOptions] = useState<PlatformTenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("__none");
  const [error, setError] = useState("");

  const options = useMemo(() => [
    { value: "__none", label: tenantOptions.length ? "请选择目标租户" : "先搜索可用租户" },
    ...tenantOptions.map((tenant) => ({
      value: tenant.id,
      label: `${tenant.name}${tenant.slug ? ` (${tenant.slug})` : ""}`,
    })),
  ], [tenantOptions]);

  function searchTenants() {
    setError("");
    startTransition(async () => {
      try {
        const query = new URLSearchParams();
        query.set("page", "1");
        query.set("pageSize", "20");
        query.set("status", "active");
        const keyword = tenantKeyword.trim();
        if (keyword) query.set("keyword", keyword);
        const data = await requestJson<PlatformTenantListData>(`/api/backend/platform/tenants?${query.toString()}`);
        setTenantOptions(data.list || []);
        const selectedStillVisible = data.list?.some((tenant) => tenant.id === selectedTenantId);
        if (!selectedStillVisible) setSelectedTenantId("__none");
      } catch (err) {
        setError(err instanceof Error ? err.message : "租户搜索失败");
      }
    });
  }

  useEffect(() => {
    searchTenants();
    // 初次打开时加载一批正常租户，后续由用户主动搜索。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTenantId === "__none") {
      setError("请选择目标租户");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const assignedNote = String(formData.get("assigned_note") || "").trim();

    setError("");
    startTransition(async () => {
      try {
        await requestJson(`/api/backend/platform/leads/${lead.id}/assign`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tenant_id: selectedTenantId,
            assigned_note: assignedNote || undefined,
          }),
        });
        onAssigned();
      } catch (err) {
        setError(err instanceof Error ? err.message : "分配线索失败");
      }
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-[1fr_104px]">
        <InputGroup>
          <InputGroupAddon>
            <Search data-icon="inline-start" />
          </InputGroupAddon>
          <InputGroupInput
            value={tenantKeyword}
            placeholder="搜索公司名称或 slug"
            disabled={pending}
            onChange={(event) => setTenantKeyword(event.target.value)}
          />
        </InputGroup>
        <Button type="button" variant="outline" disabled={pending} onClick={searchTenants}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          搜索
        </Button>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`assign-tenant-${lead.id}`}>目标租户</FieldLabel>
          <FormSelect
            id={`assign-tenant-${lead.id}`}
            value={selectedTenantId}
            options={options}
            disabled={pending}
            onChange={setSelectedTenantId}
          />
          <FieldDescription>
            只展示正常状态租户。分配后后端会按手机号在目标租户内去重，命中则关联老客户。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`assign-note-${lead.id}`}>分配备注</FieldLabel>
          <Textarea
            id={`assign-note-${lead.id}`}
            name="assigned_note"
            rows={3}
            maxLength={500}
            placeholder="可填写分配原因、客户需求摘要或跟进提示"
            disabled={pending}
          />
        </Field>
      </FieldGroup>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <DialogFooter>
        <Button type="submit" disabled={pending || selectedTenantId === "__none"}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ArrowRightLeft data-icon="inline-start" />}
          分配线索
        </Button>
      </DialogFooter>
    </form>
  );
}

function DetailGrid({ detail }: { detail: PlatformLeadDetail }) {
  const rows = [
    ["客户姓名", detail.name || "-"],
    ["手机号", detail.phone || "-"],
    ["城市", detail.city || "-"],
    ["小区", detail.community || "-"],
    ["面积", formatArea(detail.area)],
    ["预算", detail.budget || "-"],
    ["来源", detail.source || "-"],
    ["提交时间", formatDate(detail.created_at)],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border bg-muted/30 px-3 py-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 break-words text-sm font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}

function AssignmentInfo({ detail }: { detail: PlatformLeadDetail }) {
  if (detail.status !== "assigned") return null;

  return (
    <div className="rounded-md border border-success/30 bg-success/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">已分配</Badge>
        <span className="text-sm font-medium">
          {detail.assigned_tenant?.name || "目标租户待补"}
        </span>
        {detail.assigned_customer ? (
          <Badge variant="outline">
            关联客户：{detail.assigned_customer.name || detail.assigned_customer.phone || detail.assigned_customer.id}
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        分配时间：{formatDate(detail.assigned_at)}；分配人：{detail.assigned_by?.name || detail.assigned_by?.phone || "-"}
      </div>
      {detail.assigned_note ? (
        <div className="mt-2 text-sm">备注：{detail.assigned_note}</div>
      ) : null}
    </div>
  );
}

function AssignLogs({ detail }: { detail: PlatformLeadDetail }) {
  const logs = detail.assign_logs || [];
  if (!logs.length) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        暂无分配日志
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {logs.map((log) => (
        <div key={log.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{log.action}</Badge>
              <Badge variant={log.dedupe_result === "existing_customer" ? "warning" : "secondary"}>
                {getPlatformLeadDedupeLabel(log.dedupe_result)}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
          </div>
          <div className="mt-2 text-sm">
            目标租户：{log.target_tenant?.name || log.target_tenant_id || "-"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            关联客户：{log.assigned_customer?.name || log.assigned_customer?.phone || log.assigned_customer_id || "-"}
            ；操作人：{log.operator?.name || log.operator?.phone || "-"}
          </div>
          {log.note ? <div className="mt-2 text-sm">备注：{log.note}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function PlatformLeadDetailButton({ lead }: { lead: PlatformLeadRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<PlatformLeadDetail | null>(null);

  async function loadDetail() {
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<PlatformLeadDetail>(`/api/backend/platform/leads/${lead.id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "线索详情加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id]);

  function handleAssigned() {
    void loadDetail();
    refreshAfterDialogClose(router);
  }

  const current = detail || lead;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        查看
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[86vh] max-w-[880px] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <DialogTitle>平台线索详情</DialogTitle>
                <DialogDescription>
                  查看装修需求、分配目标租户，并核对分配审计记录。
                </DialogDescription>
              </div>
              {leadStatusBadge(current.status)}
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-md border p-8 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" data-icon="inline-start" />
              正在加载线索详情
            </div>
          ) : null}

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          {!loading && detail ? (
            <div className="flex flex-col gap-5">
              <DetailGrid detail={detail} />

              {detail.description ? (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">装修需求</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm">{detail.description}</div>
                </div>
              ) : null}

              <AssignmentInfo detail={detail} />

              {detail.status === "new" ? (
                <>
                  <Separator />
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-sm font-medium">手动分配</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        分配会在目标租户内按手机号查重。已存在客户会追加来源时间线，不重复创建客户。
                      </div>
                    </div>
                    <AssignLeadPanel lead={detail} onAssigned={handleAssigned} />
                  </div>
                </>
              ) : null}

              <Separator />
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">分配日志</div>
                <AssignLogs detail={detail} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
