"use client";

import { ChangeEvent } from "react";
import {
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AcceptanceImageItem,
  AcceptanceItem,
  AcceptanceItemResult,
  EditableItem,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import {
  canEdit,
  getAcceptanceEvidenceSummary,
  getImageItemHref,
  getImageItemSrc,
  resultLabel,
  resultVariant,
} from "@/components/projects/project-acceptance-utils";
import { ImageUploadBlock } from "@/components/projects/project-acceptance-image-upload-block";
import { HoverImagePreview } from "@/components/projects/project-acceptance-image-preview";
import { cn } from "@/lib/utils";

export function nextStepLabel(acceptance: ProjectAcceptance) {
  if (acceptance.status === "draft") return "填写检查项后提交验收";
  if (acceptance.status === "rejected") return "补充整改后重新提交";
  if (acceptance.status === "submitted") return "等待主管复核";
  if (acceptance.status === "leader_approved") return "等待客户确认";
  if (acceptance.status === "customer_confirmed") return "验收已完成";
  return acceptance.status_label;
}

export function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
      {label}
      <b
        className={cn(
          "font-semibold text-foreground",
          tone === "success" ? "text-success" : null,
          tone === "danger" ? "text-destructive" : null,
        )}
      >
        {value}
      </b>
    </span>
  );
}

export function AcceptancePrimaryActions({
  selected,
  actionLoading,
  openActionDialog,
  saveAcceptance,
  notifyCustomer,
}: {
  selected: ProjectAcceptance;
  actionLoading: boolean;
  openActionDialog: (type: "approve" | "reject" | "delete") => void;
  saveAcceptance: (submit?: boolean) => Promise<void>;
  notifyCustomer: (force?: boolean) => Promise<void>;
}) {
  if (canEdit(selected.status)) {
    return (
      <>
        {selected.status === "draft" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openActionDialog("delete")}
            disabled={actionLoading}
          >
            <Trash2 />
            删除草稿
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => saveAcceptance(false)}
          disabled={actionLoading}
        >
          保存草稿
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => saveAcceptance(true)}
          disabled={actionLoading || selected.can_submit === false}
        >
          <Send />
          提交验收
        </Button>
      </>
    );
  }

  if (selected.status === "submitted") {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openActionDialog("reject")}
          disabled={actionLoading}
        >
          <XCircle />
          退回整改
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => openActionDialog("approve")}
          disabled={actionLoading}
        >
          <CheckCircle2 />
          复核通过
        </Button>
      </>
    );
  }

  if (selected.status === "leader_approved") {
    return (
      <Button
        type="button"
        size="sm"
        variant={selected.latest_customer_notification ? "outline" : "default"}
        onClick={() => notifyCustomer(Boolean(selected.latest_customer_notification))}
        disabled={actionLoading}
      >
        {actionLoading ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <MessageSquareText data-icon="inline-start" />
        )}
        {selected.latest_customer_notification ? "重发客户通知" : "发送客户通知"}
      </Button>
    );
  }

  return null;
}

function EvidenceThumb({
  image,
  index,
}: {
  image: AcceptanceImageItem;
  index: number;
}) {
  const src = getImageItemSrc(image);
  const href = getImageItemHref(image);
  const caption = image.item_title || `证据图片 ${index + 1}`;

  return (
    <HoverImagePreview src={src} href={href} alt={caption} caption={caption}>
      <a
        href={href || undefined}
        target="_blank"
        rel="noreferrer"
        className="block aspect-square overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`查看${caption}`}
      >
        {src ? (
          <img src={src} alt={caption} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
            无图
          </span>
        )}
      </a>
    </HoverImagePreview>
  );
}

export function EvidenceSummaryPanel({ acceptance }: { acceptance: ProjectAcceptance }) {
  const evidence = getAcceptanceEvidenceSummary(acceptance);
  const previewImages = [
    ...evidence.acceptanceImages,
    ...evidence.rectificationImages,
    ...evidence.actionImages,
  ].slice(0, 8);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon data-icon="inline-start" />
          图片证据
        </div>
        <Badge variant="secondary">{evidence.total} 张</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span>验收 {evidence.acceptanceImages.length}</span>
        <span>整改 {evidence.rectificationImages.length}</span>
        <span>流程 {evidence.actionImages.length}</span>
      </div>
      {previewImages.length ? (
        <div className="grid grid-cols-4 gap-2">
          {previewImages.map((image, index) => (
            <EvidenceThumb
              key={image.id || image.path || image.url || index}
              image={image}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background p-4 text-center text-xs text-muted-foreground">
          暂无图片证据
        </div>
      )}
    </section>
  );
}

export function AcceptanceItemRow({
  selected,
  item,
  draft,
  editableNow,
  uploadingItemId,
  updateEditableItem,
  uploadImages,
}: {
  selected: ProjectAcceptance;
  item: AcceptanceItem;
  draft: EditableItem | undefined;
  editableNow: boolean;
  uploadingItemId: string;
  updateEditableItem: (itemId: string, patch: Partial<EditableItem>) => void;
  uploadImages: (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => void;
}) {
  return (
    <article className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_168px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{item.title}</h4>
          <Badge variant={resultVariant(draft?.result)}>
            {resultLabel(draft?.result)}
          </Badge>
          {item.required ? <Badge variant="outline">必检</Badge> : null}
          {item.photo_required ? (
            <Badge variant="outline">
              需 {Math.max(item.photo_min_count || 1, 1)} 张照片
            </Badge>
          ) : null}
          {item.category ? <Badge variant="secondary">{item.category}</Badge> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {item.standard}
        </p>
      </div>

      <Select
        value={draft?.result || "unset"}
        disabled={!editableNow}
        onValueChange={(value) =>
          updateEditableItem(item.id, {
            result: value === "unset"
              ? null
              : value as AcceptanceItemResult,
          })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">未填写</SelectItem>
          <SelectItem value="pass">通过</SelectItem>
          <SelectItem value="fail">不通过</SelectItem>
          {item.allow_not_applicable ? (
            <SelectItem value="not_applicable">不适用</SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      <div className="grid gap-4 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-2">
          <Label>备注</Label>
          <Textarea
            className="min-h-24"
            value={draft?.remark || ""}
            disabled={!editableNow}
            onChange={(event) =>
              updateEditableItem(item.id, {
                remark: event.target.value,
              })}
            placeholder={
              canEdit(selected.status) ? "填写验收备注" : "暂无验收备注"
            }
          />
        </div>

        <ImageUploadBlock
          label="现场照片"
          images={draft?.imagePreviews || draft?.images || []}
          disabled={!editableNow}
          uploading={uploadingItemId === `${item.id}:images`}
          variant="inline"
          onUpload={(event) => uploadImages(item.id, event, "images")}
          onRemove={(index) => updateEditableItem(item.id, {
            images: (draft?.images || []).filter((_, i) => i !== index),
            imagePreviews: (draft?.imagePreviews || []).filter((_, i) => i !== index),
          })}
        />
      </div>
    </article>
  );
}
