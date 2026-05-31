"use client";

import { ChangeEvent } from "react";
import { CornerDownRight, Image as ImageIcon, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AcceptanceAction, AcceptanceImageItem, AcceptanceItem, EditableItem, EditableState, ProjectAcceptance } from "@/components/projects/project-acceptance-types";
import { formatDateTime, getActionLabel, getActionOperator, getActionVariant, getImageItemHref, getImageItemSrc, getRectificationItemsForAction, hasRectificationContent, isRejectAction } from "@/components/projects/project-acceptance-utils";
import { ImageUploadBlock } from "@/components/projects/project-acceptance-image-upload-block";

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
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">流程记录</div>
        <Badge variant="secondary">最新在前 · {actions.length} 条</Badge>
      </div>
      <div className="mt-4 flex flex-col gap-3">
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
            <div
              key={action.id}
              className={`rounded-md border p-3 ${
                isLatest ? "bg-muted/40" : "bg-card"
              }`}
            >
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
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RectificationReplyPanel({
  action,
  items,
  editable,
  actionLoading,
  uploadingItemId,
  onSave,
  onUpdateItem,
  onUploadImages,
}: {
  action: AcceptanceAction;
  items: AcceptanceItem[];
  editable: EditableState;
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
  const replyTarget = action.action === "customer_dispute" ? "业主疑问" : "领导驳回";
  const targetItem = items[0];
  const targetDraft = targetItem ? editable.items[targetItem.id] : null;

  if (!targetItem) {
    return null;
  }

  return (
    <div className="mt-3 border-l-2 border-warning pl-3">
      <div className="rounded-md border bg-background">
        <div className="border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <CornerDownRight data-icon="inline-start" />
            <div className="min-w-0">
              <div className="text-sm font-medium">回复{replyTarget}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <Textarea
            className="min-h-24 bg-card"
            value={targetDraft?.rectification_remark || ""}
            disabled={actionLoading}
            aria-label="整改说明"
            onChange={(event) =>
              onUpdateItem(targetItem.id, {
                rectification_remark: event.target.value,
              })}
            placeholder="填写整改说明"
          />
          <ImageUploadBlock
            label="上传整改图片"
            images={targetDraft?.rectificationImagePreviews || targetDraft?.rectification_images || []}
            disabled={actionLoading}
            uploading={uploadingItemId === `${targetItem.id}:rectification_images`}
            onUpload={(event) =>
              onUploadImages(targetItem.id, event, "rectification_images")}
            onRemove={(index) => onUpdateItem(targetItem.id, {
              rectification_images: (targetDraft?.rectification_images || [])
                .filter((_, i) => i !== index),
              rectificationImagePreviews: (targetDraft?.rectificationImagePreviews || [])
                .filter((_, i) => i !== index),
            })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
          <div className="text-xs text-muted-foreground">保存草稿或提交整改复核</div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => void onSave(false)}
            >
              保存草稿
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={actionLoading}
              onClick={() => void onSave(true)}
            >
              {actionLoading
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <Send data-icon="inline-start" />}
              提交整改
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RectificationSummaryPanel({ items }: { items: AcceptanceItem[] }) {
  const contentItems = items.filter((item) =>
    item.rectification_remark?.trim() ||
    item.rectification_images?.length ||
    item.rectification_image_items?.length
  );

  if (contentItems.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-l-2 border-success pl-3">
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CornerDownRight data-icon="inline-start" />
          员工整改回复
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {contentItems.map((item) => {
            const imageItems = item.rectification_image_items?.length
              ? item.rectification_image_items
              : (item.rectification_images || []).map((image) => ({
                path: image,
                url: image,
                thumb_url: image,
                source: "rectification_item",
                item_title: item.title,
              }));

            return (
              <div key={item.id} className="flex flex-col gap-2">
                {item.rectification_remark?.trim() ? (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    {item.rectification_remark}
                  </div>
                ) : null}
                {imageItems.length ? (
                  <ActionImageGallery
                    title="整改图片"
                    emptyText="暂无整改图片"
                    images={imageItems}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionImageGallery({
  title,
  emptyText,
  images,
  showItemTitle = false,
}: {
  title: string;
  emptyText: string;
  images: AcceptanceImageItem[];
  showItemTitle?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon data-icon="inline-start" />
          {title}
        </div>
        <Badge variant="secondary">{images.length}</Badge>
      </div>
      {images.length ? (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
          {images.map((image, index) => {
            const src = getImageItemSrc(image);
            const href = getImageItemHref(image);
            const sourceLabel = image.source === "rectification_item"
              ? "整改图"
              : image.source === "acceptance_item"
              ? "验收图"
              : "图片";
            return (
              <a
                key={image.id || image.path || image.url || index}
                href={href || undefined}
                target="_blank"
                rel="noreferrer"
                className="group min-w-0 rounded-md border bg-card p-2 transition-colors hover:bg-accent"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-muted">
                  {src ? (
                    <img
                      src={src}
                      alt={title}
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      无图片
                    </div>
                  )}
                </div>
                <div className="mt-2 flex min-w-0 flex-col gap-1">
                  {showItemTitle ? (
                    <div className="truncate text-xs font-medium">
                      {image.item_title || "未关联验收项"}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    {sourceLabel}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function CustomerSupplementImages({ images }: { images: AcceptanceImageItem[] }) {
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon data-icon="inline-start" />
          <span>客户补充了 {images.length} 张现场图片</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => {
            const src = getImageItemSrc(image);
            const href = getImageItemHref(image);
            return (
              <a
                key={image.id || image.path || image.url || index}
                href={href || undefined}
                target="_blank"
                rel="noreferrer"
                className="block size-12 overflow-hidden rounded-md border bg-card"
                aria-label={`查看客户补充图片 ${index + 1}`}
              >
                {src ? (
                  <img
                    src={src}
                    alt="客户补充图片"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                    无图
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
