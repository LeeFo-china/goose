"use client";

import { ChangeEvent, useState } from "react";
import {
  CheckCircle2,
  CircleMinus,
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

const EVIDENCE_PREVIEW_LIMIT = 8;

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
  const [expanded, setExpanded] = useState(false);
  const allImages = [
    ...evidence.acceptanceImages,
    ...evidence.rectificationImages,
    ...evidence.actionImages,
  ];
  const hiddenCount = Math.max(allImages.length - EVIDENCE_PREVIEW_LIMIT, 0);
  const previewImages = expanded ? allImages : allImages.slice(0, EVIDENCE_PREVIEW_LIMIT);

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
        <>
          <div className="grid grid-cols-4 gap-2">
            {previewImages.map((image, index) => (
              <EvidenceThumb
                key={image.id || image.path || image.url || index}
                image={image}
                index={index}
              />
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {expanded ? "已展示全部图片" : <>还有 {hiddenCount} 张未展示</>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "收起" : "展开全部"}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">暂无图片证据</div>
      )}
    </section>
  );
}

export function AcceptanceItemRow({
  item,
  draft,
  editableNow,
  uploadingItemId,
  updateEditableItem,
  uploadImages,
}: {
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
  const result = draft?.result ?? item.result;
  const remark = (draft?.remark ?? item.remark ?? "").trim();

  return (
    <article
      className={cn(
        "grid gap-4 px-4 py-4",
        editableNow
          ? "lg:grid-cols-[minmax(0,1fr)_168px]"
          : "lg:grid-cols-[minmax(0,1fr)_auto]",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{item.title}</h4>
          {editableNow ? (
            <Badge variant={resultVariant(result)}>
              {resultLabel(result)}
            </Badge>
          ) : null}
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

      {editableNow ? (
        <Select
          value={result || "unset"}
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
      ) : (
        <ReadOnlyResultStamp result={result} />
      )}

      <div className="grid gap-4 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_260px]">
        {editableNow ? (
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              className="min-h-24"
              value={remark}
              onChange={(event) =>
                updateEditableItem(item.id, {
                  remark: event.target.value,
                })}
              placeholder="填写验收备注"
            />
          </div>
        ) : (
          <ReadOnlyRemarkSummary remark={remark} />
        )}

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

function ReadOnlyResultStamp({
  result,
}: {
  result: AcceptanceItemResult | null | undefined;
}) {
  const Icon = result === "pass"
    ? CheckCircle2
    : result === "fail"
      ? XCircle
      : CircleMinus;

  return (
    <div
      className={cn(
        "inline-flex h-8 w-20 shrink-0 rotate-[-2deg] items-center justify-center gap-1 justify-self-end rounded-[3px] border text-xs font-semibold shadow-none",
        result === "pass" && "border-success/55 bg-success/10 text-success",
        result === "fail" && "border-destructive/55 bg-destructive/10 text-destructive",
        result === "not_applicable" && "border-muted-foreground/35 bg-muted/60 text-muted-foreground",
        !result && "border-dashed border-muted-foreground/35 bg-muted/30 text-muted-foreground",
      )}
      aria-label={`验收结果：${resultLabel(result)}`}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="leading-none">{resultLabel(result)}</span>
    </div>
  );
}

function ReadOnlyRemarkSummary({ remark }: { remark: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquareText className="size-3.5" />
        备注
      </div>
      <p
        className={cn(
          "text-sm leading-6",
          remark ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {remark || "未填写备注"}
      </p>
    </div>
  );
}
