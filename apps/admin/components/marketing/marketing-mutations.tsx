"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, PauseCircle, Pencil, PlayCircle, Plus, XCircle } from "lucide-react";
import type { MarketingCampaignDetail, MarketingCampaignRecord, MarketingCampaignStatus, MarketingProjectOption } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { CampaignDetailDialog } from "@/components/marketing/marketing-campaign-detail-dialog";
import { CampaignFormDialog } from "@/components/marketing/marketing-campaign-form-dialog";
import { requestMarketing } from "@/components/marketing/marketing-mutation-shared";

export function CreateMarketingCampaignButton({
  projects,
}: {
  projects: MarketingProjectOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新建活动
      </Button>
      <CampaignFormDialog
        open={open}
        mode="create"
        projects={projects}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function MarketingRowActions({
  campaign,
  projects,
}: {
  campaign: MarketingCampaignRecord;
  projects: MarketingProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<MarketingCampaignDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");

  const nextStatus = useMemo<MarketingCampaignStatus | null>(() => {
    if (campaign.status === "active") return "paused";
    if (campaign.status === "draft" || campaign.status === "paused") return "active";
    return null;
  }, [campaign.status]);

  async function loadDetail() {
    if (detail) return detail;
    const data = await requestMarketing<MarketingCampaignDetail>({
      path: `/employee/marketing-center/campaigns/${campaign.id}`,
    });
    setDetail(data);
    return data;
  }

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        await loadDetail();
        setDetailOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function openEdit() {
    setError("");
    startTransition(async () => {
      try {
        await loadDetail();
        setEditOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function updateStatus(status: MarketingCampaignStatus) {
    setError("");
    startTransition(async () => {
      try {
        await requestMarketing({
          path: `/employee/marketing-center/campaigns/${campaign.id}/status`,
          method: "POST",
          payload: { status },
        });
        setDetail(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "状态更新失败");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={openDetail}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
          详情
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={openEdit}>
          <Pencil data-icon="inline-start" />
          编辑
        </Button>
        {nextStatus ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => updateStatus(nextStatus)}
          >
            {nextStatus === "active" ? <PlayCircle data-icon="inline-start" /> : <PauseCircle data-icon="inline-start" />}
            {nextStatus === "active" ? "启用" : "暂停"}
          </Button>
        ) : null}
        {campaign.status !== "closed" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => updateStatus("closed")}
          >
            <XCircle data-icon="inline-start" />
            关闭
          </Button>
        ) : null}
      </div>
      <CampaignDetailDialog
        open={detailOpen}
        campaign={detail}
        onOpenChange={setDetailOpen}
      />
      <CampaignFormDialog
        open={editOpen}
        mode="edit"
        campaign={detail}
        projects={projects}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
