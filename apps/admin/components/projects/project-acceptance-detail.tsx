"use client";

import { ChangeEvent } from "react";
import { Clock3 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  AcceptanceAction,
  AcceptanceSection,
  EditableItem,
  EditableState,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import {
  canEdit,
  formatDateTime,
  getAcceptanceDisplayTitle,
  isFinalAcceptance,
  statusVariant,
} from "@/components/projects/project-acceptance-utils";
import { CustomerNotificationPanel } from "@/components/projects/project-acceptance-customer-notification-panel";
import { AcceptanceTimeline } from "@/components/projects/project-acceptance-timeline";
import {
  AcceptanceItemRow,
  AcceptancePrimaryActions,
  EvidenceSummaryPanel,
  nextStepLabel,
  StatPill,
} from "@/components/projects/project-acceptance-detail-parts";
import { cn } from "@/lib/utils";

type ProjectAcceptanceDetailProps = {
  selected: ProjectAcceptance | null;
  selectedStats: { total: number; pass: number; fail: number; pending: number };
  selectedSections: AcceptanceSection[];
  latestCustomerDispute: AcceptanceAction | null;
  latestRejectAction: AcceptanceAction | null;
  editable: EditableState;
  actionLoading: boolean;
  uploadingItemId: string;
  setEditable: (updater: (current: EditableState) => EditableState) => void;
  openActionDialog: (type: "approve" | "reject" | "delete") => void;
  saveAcceptance: (submit?: boolean) => Promise<void>;
  notifyCustomer: (force?: boolean) => Promise<void>;
  updateEditableItem: (itemId: string, patch: Partial<EditableItem>) => void;
  uploadImages: (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => void;
};

export function ProjectAcceptanceDetail({
  selected,
  selectedStats,
  selectedSections,
  latestCustomerDispute,
  latestRejectAction,
  editable,
  actionLoading,
  uploadingItemId,
  setEditable,
  openActionDialog,
  saveAcceptance,
  notifyCustomer,
  updateEditableItem,
  uploadImages,
}: ProjectAcceptanceDetailProps) {
  if (!selected) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        从左侧发起工序验收或竣工交付验收后，在这里填写验收内容。
      </section>
    );
  }

  const editableNow = canEdit(selected.status);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-col gap-3 min-[1700px]:flex-row min-[1700px]:items-start min-[1700px]:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-base font-semibold">
                {getAcceptanceDisplayTitle(selected)}
              </h3>
              {isFinalAcceptance(selected) ? (
                <Badge variant="outline" className="shrink-0">
                  竣工报告
                </Badge>
              ) : null}
              <Badge variant={statusVariant(selected.status)} className="shrink-0">
                {selected.status_label}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>下一步：{nextStepLabel(selected)}</span>
              <span>发起：{selected.initiator?.name || "-"}</span>
              <span>复核：{selected.reviewer?.name || "-"}</span>
              <span>更新：{formatDateTime(selected.updated_at || selected.created_at)}</span>
            </div>
            {selected.reject_reason ? (
              <div className="mt-2 text-xs text-destructive">
                {selected.reject_source === "customer" ? "业主疑问" : "驳回原因"}：
                {selected.reject_reason}
              </div>
            ) : null}
            {selected.reject_source === "customer" && latestCustomerDispute ? (
              <div className="mt-2 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock3 data-icon="inline-start" />
                <span className="truncate">
                  最近疑问：{formatDateTime(latestCustomerDispute.created_at)}
                  {latestCustomerDispute.comment ? `，${latestCustomerDispute.comment}` : ""}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <AcceptancePrimaryActions
              selected={selected}
              actionLoading={actionLoading}
              openActionDialog={openActionDialog}
              saveAcceptance={saveAcceptance}
              notifyCustomer={notifyCustomer}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <StatPill label="全部" value={selectedStats.total} />
          <StatPill label="通过" value={selectedStats.pass} tone="success" />
          <StatPill label="问题" value={selectedStats.fail} tone="danger" />
          <StatPill label="待填" value={selectedStats.pending} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-hidden min-[1700px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-y-auto p-4 [scrollbar-gutter:stable]">
          {selected.can_submit === false && selected.blocked_reason ? (
            <StatusAlert>{selected.blocked_reason}</StatusAlert>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-md border bg-background">
            {selectedSections.map((section, sectionIndex) => (
              <section
                key={section.id || `flat-items-${sectionIndex}`}
                className={cn(sectionIndex > 0 ? "border-t" : null)}
              >
                {isFinalAcceptance(selected) ? (
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold">
                        {section.title}
                      </h4>
                      {section.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {section.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="secondary">{section.items.length} 项</Badge>
                  </div>
                ) : null}

                <div className="divide-y">
                  {section.items.map((item) => (
                    <AcceptanceItemRow
                      key={item.id}
                      selected={selected}
                      item={item}
                      draft={editable.items[item.id]}
                      editableNow={editableNow}
                      uploadingItemId={uploadingItemId}
                      updateEditableItem={updateEditableItem}
                      uploadImages={uploadImages}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="min-h-0 border-t bg-muted/20 min-[1700px]:border-l min-[1700px]:border-t-0">
          <div className="flex max-h-full min-h-0 flex-col gap-5 overflow-y-auto p-4 [scrollbar-gutter:stable]">
            {(selected.status === "leader_approved" ||
              selected.latest_customer_notification) ? (
              <CustomerNotificationPanel
                notification={selected.latest_customer_notification || null}
                onSend={() => notifyCustomer(false)}
                onResend={() => notifyCustomer(true)}
                disabled={actionLoading || selected.status !== "leader_approved"}
              />
            ) : null}

            <section className="space-y-2">
              <Label>整体验收说明</Label>
              <Textarea
                value={editable.summary}
                onChange={(event) =>
                  setEditable((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))}
                disabled={!editableNow}
                placeholder={editableNow ? "填写现场整体情况" : "暂无整体验收说明"}
              />
            </section>

            <EvidenceSummaryPanel acceptance={selected} />

            <AcceptanceTimeline
              acceptance={selected}
              actions={selected.actions || []}
              editable={editable}
              latestRejectActionId={latestRejectAction?.id || null}
              actionLoading={actionLoading}
              uploadingItemId={uploadingItemId}
              onSave={saveAcceptance}
              onUpdateItem={updateEditableItem}
              onUploadImages={uploadImages}
            />
          </div>
        </aside>
      </div>
    </section>
  );
}
