"use client";

import type { MarketingCampaignDetail } from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { scopeLabel, statusLabel, typeLabel } from "@/components/marketing/marketing-mutation-shared";

export function CampaignDetailDialog({
  open,
  campaign,
  onOpenChange,
}: {
  open: boolean;
  campaign: MarketingCampaignDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const scopes = campaign?.scopes || [];
  const configEntries = Object.entries(campaign?.config_payload || {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{campaign?.name || "营销活动详情"}</DialogTitle>
          <DialogDescription>
            活动配置、项目范围和实例统计。
          </DialogDescription>
        </DialogHeader>
        {campaign ? (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">活动类型</div>
                <div className="mt-1 font-medium">{typeLabel[campaign.campaign_type]}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">状态</div>
                <div className="mt-1 font-medium">{statusLabel[campaign.status]}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">实例数</div>
                <div className="mt-1 font-medium">{campaign.summary?.instance_count || 0}</div>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>项目范围：{scopeLabel[campaign.target_scope_type]}</div>
              <div>启用：{campaign.enabled ? "是" : "否"}</div>
              <div>奖励标题：{campaign.reward_title || "-"}</div>
              <div>领奖渠道：{campaign.reward_claim_channel || "-"}</div>
            </div>
            <div>
              <div className="mb-2 font-medium">项目范围明细</div>
              {scopes.length ? (
                <div className="flex flex-wrap gap-2">
                  {scopes.map((scope) => (
                    <Badge key={`${scope.scope_mode}-${scope.project_id}`} variant="outline">
                      {scope.scope_mode === "include" ? "包含" : "排除"} · {scope.project_name || scope.project_id}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">无单独项目限制</div>
              )}
            </div>
            <div>
              <div className="mb-2 font-medium">配置参数</div>
              <div className="rounded-md border bg-muted/30 p-3">
                {configEntries.length ? (
                  configEntries.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[190px_1fr] gap-2 py-1">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="break-all">{String(value ?? "-")}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">无配置参数</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
