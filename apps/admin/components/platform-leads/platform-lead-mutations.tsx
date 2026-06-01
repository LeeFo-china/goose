"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import {
  AssignLeadPanel,
  AssignmentInfo,
  AssignLogs,
  DetailGrid,
} from "@/components/platform-leads/platform-lead-detail-sections";
import {
  getPlatformLeadStatusMeta,
  type PlatformLeadDetail,
  type PlatformLeadRecord,
} from "@/components/platform-leads/platform-lead-types";
import { requestBackendJson } from "@/lib/backend-client";

async function requestJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

function leadStatusBadge(status: string | null | undefined) {
  const meta = getPlatformLeadStatusMeta(status);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
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
