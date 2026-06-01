"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp, GripVertical, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { H5Block, H5PageConfig } from "@/components/marketing/h5-page-editor-types";
import { blockLabel } from "@/components/marketing/h5-page-editor-types";
import {
  clampNumber,
  getActionString,
  getActionType,
  getFloatingPhoneProps,
  getLeadFormFieldLabel,
  getNumber,
  getString,
  normalizeLeadFormFields,
  parseCaseItems,
  previewImage,
} from "@/components/marketing/h5-page-editor-block-utils";
import { CaseImageCarouselPreview } from "@/components/marketing/h5-page-case-image-carousel-preview";

export { CaseImageCarouselPreview } from "@/components/marketing/h5-page-case-image-carousel-preview";

function blockSummary(block: H5Block) {
  const props = block.props || {};
  return getString(props, "title") ||
    getString(props, "text") ||
    getString(props, "caption") ||
    blockLabel[block.type];
}

export function PreviewBlock({
  block,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDragStart,
  onDrop,
}: {
  block: H5Block;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const props = block.props || {};
  const imageUrl = getString(props, "imageUrl");
  const logoUrl = getString(props, "logo");
  const caseItems = block.type === "case_list" ? parseCaseItems(props.items) : [];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-md border bg-background transition-colors",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50",
      )}
    >
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
        <Button type="button" variant="secondary" size="icon" onClick={(event) => {
          event.stopPropagation();
          onMoveUp();
        }}>
          <ArrowUp />
        </Button>
        <Button type="button" variant="secondary" size="icon" onClick={(event) => {
          event.stopPropagation();
          onMoveDown();
        }}>
          <ArrowDown />
        </Button>
        <Button type="button" variant="secondary" size="icon" onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}>
          <Trash2 />
        </Button>
      </div>
      <div className="absolute left-2 top-2 rounded-md bg-background/90 p-1 text-muted-foreground">
        <GripVertical className="size-4" />
      </div>
      {block.type === "hero" ? (
        <div className="relative flex min-h-[260px] flex-col justify-end overflow-hidden rounded-md bg-muted p-5 pt-14">
          {previewImage(
            imageUrl,
            "Banner 预览",
            "absolute inset-0 size-full object-cover",
          )}
          {imageUrl ? (
            <div className="absolute inset-0 bg-black/35" />
          ) : null}
          <div className="mb-2 w-fit rounded-full border bg-background/80 px-2 py-1 text-xs">
            {getString(props, "kicker") || "GOODCMS 活动"}
          </div>
          <div className={cn(
            "relative text-3xl font-semibold leading-tight",
            imageUrl && "text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]",
          )}>
            {getString(props, "title") || "顶部 Banner"}
          </div>
          <div className={cn(
            "relative mt-2 text-sm leading-6",
            imageUrl ? "text-white/85" : "text-muted-foreground",
          )}>
            {getString(props, "subtitle") || "首屏活动说明"}
          </div>
          {getString(props, "buttonText") ? (
            <div className="relative mt-4 rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">
              {getString(props, "buttonText")}
            </div>
          ) : null}
        </div>
      ) : block.type === "image" ? (
        <div className="overflow-hidden rounded-md">
          <div className="grid aspect-[16/10] place-items-center overflow-hidden bg-muted text-sm text-muted-foreground">
            {imageUrl
              ? previewImage(imageUrl, "图片预览", "size-full object-cover")
              : "图片占位"}
          </div>
          {getString(props, "caption") ? (
            <div className="p-3 text-sm text-muted-foreground">{getString(props, "caption")}</div>
          ) : null}
        </div>
      ) : block.type === "image_text" ? (
        <div className="overflow-hidden rounded-md">
          <div className="grid aspect-[16/9] place-items-center overflow-hidden bg-muted text-sm text-muted-foreground">
            {imageUrl
              ? previewImage(imageUrl, "图文图片预览", "size-full object-cover")
              : "图片占位"}
          </div>
          <div className="p-4">
            <div className="font-semibold">{getString(props, "title") || "图文标题"}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {getString(props, "content") || "图文说明"}
            </div>
          </div>
        </div>
      ) : block.type === "case_list" ? (
        <div className="p-4">
          <div className="text-lg font-semibold">{getString(props, "title") || "案例列表"}</div>
          <div className="mt-3 space-y-3">
            {caseItems.length > 0 ? caseItems.slice(0, 3).map((item, index) => (
              <div
                key={`${item.projectId || item.title || "case"}-${index}`}
                className="overflow-hidden rounded-md border bg-background"
              >
                <CaseImageCarouselPreview item={item} />
                <div className="p-3">
                  <div className="truncate text-sm font-medium">{item.title || "未命名项目"}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {item.subtitle || "项目信息待补"}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                暂无案例
              </div>
            )}
          </div>
          {caseItems.length > 3 ? (
            <div className="mt-3 text-center text-xs text-muted-foreground">
              另有 {caseItems.length - 3} 个案例
            </div>
          ) : null}
        </div>
      ) : block.type === "footer" ? (
        <div className="p-4 text-center">
          {logoUrl ? (
            <div className="mx-auto mb-2 flex size-[72px] items-center justify-center overflow-hidden rounded-md bg-muted">
              {previewImage(logoUrl, "Logo 预览", "size-full object-contain")}
            </div>
          ) : null}
          <div className="text-sm text-muted-foreground">
            {getString(props, "text") || "底部信息"}
          </div>
        </div>
      ) : block.type === "lead_form" ? (
        <div className="p-4">
          <div className="text-xl font-semibold">{getString(props, "title") || "预约表单"}</div>
          <div className="mt-2 text-sm text-muted-foreground">{getString(props, "description") || "表单说明"}</div>
          <div className="mt-4 flex flex-col gap-2">
            {normalizeLeadFormFields(props.fields).map((field) => (
              <div key={String(field)} className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                {getLeadFormFieldLabel(String(field))}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">
            {getString(props, "submitText") || "提交预约"}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="text-xs text-muted-foreground">{blockLabel[block.type]}</div>
          <div className="mt-1 font-medium">{blockSummary(block)}</div>
        </div>
      )}
    </div>
  );
}

export function FloatingPhonePreview({
  block,
  phoneFrameRef,
  selected,
  onChange,
  onSelect,
}: {
  block: H5Block;
  phoneFrameRef: { current: HTMLDivElement | null };
  selected: boolean;
  onChange: (props: Record<string, unknown>) => void;
  onSelect: () => void;
}) {
  const props = getFloatingPhoneProps(block.props || {});
  const draggingRef = useRef(false);

  const updatePosition = (clientX: number, clientY: number) => {
    const frame = phoneFrameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const side = clientX < rect.left + rect.width / 2 ? "left" : "right";
    const maxBottom = Math.max(24, rect.height - 96);
    const bottom = clampNumber(rect.bottom - clientY - 22, 24, maxBottom);

    onChange({
      ...block.props,
      side,
      bottom: Math.round(bottom),
    });
  };

  return (
    <Button
      type="button"
      className={cn(
        "absolute z-30 h-11 rounded-full shadow-lg transition-shadow",
        "cursor-grab active:cursor-grabbing",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      style={{
        bottom: props.bottom,
        [props.side]: 18,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        draggingRef.current = true;
        onSelect();
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePosition(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        event.stopPropagation();
        updatePosition(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        draggingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <Phone data-icon="inline-start" />
      <span>{props.text}</span>
    </Button>
  );
}
