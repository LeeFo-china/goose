"use client";

import { ChangeEvent } from "react";
import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AcceptanceAction, EditableItem, EditableState, ProjectAcceptance } from "@/components/projects/project-acceptance-types";
import { formatDateTime, getActionLabel, getActionOperator, getActionVariant, getRectificationItemsForAction, hasRectificationContent, isRejectAction } from "@/components/projects/project-acceptance-utils";
import {
  ActionImageGallery,
  CustomerSupplementImages,
  RectificationReplyPanel,
  RectificationSummaryPanel,
} from "@/components/projects/project-acceptance-timeline-sections";

export function AcceptanceTimeline({
  acceptance,
  actions,
  editable,
  latestRejectActionId,
  actionLoading,
  uploadingItemId,
  onSave,
  onUpdateItem,
  onUploadImages,
}: {
  acceptance: ProjectAcceptance;
  actions: AcceptanceAction[];
  editable: EditableState;
  latestRejectActionId: string | null;
  actionLoading: boolean;
  uploadingItemId: string;
  onSave: (submit?: boolean) => Promise<void>;
  onUpdateItem: (itemId: string, patch: Partial<EditableItem>) => void;
  onUploadImages: (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => void;
}) {
  if (!actions.length) {
    return null;
  }

  const orderedActions = actions
    .slice()
    .sort((left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock3 data-icon="inline-start" />
          流程记录
        </div>
        <Badge variant="secondary">{actions.length} 条</Badge>
      </div>
      <ol className="relative border-l pl-4">
        {orderedActions.map((action, index) => {
          const isLatest = index === 0;
          const referencedImages = action.referenced_images || [];
          const imageItems = action.image_items?.length
            ? action.image_items
            : (action.images || []).map((image) => ({
              path: image,
              url: image,
              thumb_url: image,
          }));
          const showRectificationReply = acceptance.status === "rejected" &&
            action.id === latestRejectActionId;
          const rectificationItems = action.id === latestRejectActionId
            ? getRectificationItemsForAction(acceptance, action)
            : [];
          const showRectificationSummary = !showRectificationReply &&
            isRejectAction(action) &&
            hasRectificationContent(rectificationItems);

          return (
            <li
              key={action.id}
              className="relative pb-4 last:pb-0"
            >
              <span
                className={`absolute -left-[21px] top-1 size-2.5 rounded-full border bg-background ${
                  isLatest ? "border-primary bg-primary" : "border-border"
                }`}
              />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getActionVariant(action.action)}>
                      {getActionLabel(action.action)}
                    </Badge>
                    {isLatest ? <Badge variant="outline">最新</Badge> : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getActionOperator(action)} · {formatDateTime(action.created_at)}
                  </div>
                </div>
                {action.action === "customer_confirm" ? (
                  <Badge variant="success">已确认</Badge>
                ) : null}
              </div>

              {action.comment ? (
                <div className="mt-3 rounded-md bg-background p-3 text-sm">
                  {action.comment}
                </div>
              ) : null}

              {action.action === "customer_dispute" ? (
                <div className="mt-3 flex flex-col gap-3">
                  {referencedImages.length ? (
                    <ActionImageGallery
                      title="客户引用的验收图片"
                      emptyText="未引用验收图片"
                      images={referencedImages}
                      showItemTitle
                    />
                  ) : null}
                  <CustomerSupplementImages images={imageItems} />
                </div>
              ) : null}

              {showRectificationReply ? (
                <RectificationReplyPanel
                  action={action}
                  items={rectificationItems}
                  editable={editable}
                  actionLoading={actionLoading}
                  uploadingItemId={uploadingItemId}
                  onSave={onSave}
                  onUpdateItem={onUpdateItem}
                  onUploadImages={onUploadImages}
                />
              ) : null}
              {showRectificationSummary ? (
                <RectificationSummaryPanel items={rectificationItems} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
