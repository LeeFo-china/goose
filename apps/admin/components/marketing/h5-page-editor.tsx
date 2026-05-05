"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  ExternalLink,
  GripVertical,
  Image,
  Layers,
  Loader2,
  Megaphone,
  MousePointerClick,
  Phone,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const H5_MARKETING_RETURN_HREF = "/marketing?tab=h5";
const EDITOR_IMAGE_DIRECT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const EDITOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const EDITOR_IMAGE_OUTPUT_MAX_WIDTH = 1200;
const EDITOR_IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type ImageUsage = "hero" | "content" | "logo";

type LoadedImageFile = {
  element: HTMLImageElement;
  file: File;
  height: number;
  objectUrl: string;
  width: number;
};

type ImageRepairState = LoadedImageFile & {
  issues: string[];
  usage: ImageUsage;
};

type ProjectCaseOption = {
  id: string;
  projectId?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  status?: string | null;
};

type CaseListItem = {
  projectId?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
};

type H5BlockType =
  | "hero"
  | "image"
  | "text"
  | "button"
  | "image_text"
  | "case_list"
  | "countdown"
  | "lead_form"
  | "phone_cta"
  | "footer";

type H5Block = {
  id: string;
  type: H5BlockType;
  props: Record<string, unknown>;
};

export type H5PageConfig = {
  schemaVersion: number;
  title?: string;
  theme?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  blocks: H5Block[];
};

type H5PageEditorPage = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

type H5PageEditorVersion = {
  id: string;
  config: H5PageConfig;
};

const moduleTemplates: Array<{
  type: H5BlockType;
  label: string;
  description: string;
  icon: typeof Megaphone;
}> = [
  { type: "hero", label: "顶部 Banner", description: "首屏主视觉和行动按钮", icon: Megaphone },
  { type: "image", label: "图片", description: "单张活动图或长图切片", icon: Image },
  { type: "text", label: "文本", description: "标题、正文和活动说明", icon: Type },
  { type: "button", label: "按钮", description: "跳转、滚动或拨号动作", icon: MousePointerClick },
  { type: "image_text", label: "图文卡片", description: "图片加文字卖点", icon: Layers },
  { type: "case_list", label: "案例列表", description: "装修案例或项目展示", icon: Layers },
  { type: "countdown", label: "倒计时", description: "活动截止提醒", icon: Megaphone },
  { type: "lead_form", label: "预约表单", description: "收集姓名、手机号、小区", icon: Send },
  { type: "phone_cta", label: "电话按钮", description: "一键拨打咨询电话", icon: Phone },
  { type: "footer", label: "底部信息", description: "品牌、门店或备案信息", icon: Type },
];

const blockLabel = Object.fromEntries(
  moduleTemplates.map((item) => [item.type, item.label]),
) as Record<H5BlockType, string>;

function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestEditor<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PUT";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data as T;
}

function getImageRequirement(usage: ImageUsage) {
  if (usage === "hero") {
    return {
      label: "Banner",
      minWidth: 750,
      ratios: [
        { value: "16:9", label: "16:9", ratio: 16 / 9 },
        { value: "3:1", label: "3:1", ratio: 3 },
      ],
    };
  }

  if (usage === "logo") {
    return {
      label: "Logo",
      minWidth: 200,
      ratios: [
        { value: "1:1", label: "1:1", ratio: 1 },
      ],
    };
  }

  return {
    label: "图片",
    minWidth: 750,
    ratios: [
      { value: "16:9", label: "16:9", ratio: 16 / 9 },
      { value: "3:1", label: "3:1", ratio: 3 },
      { value: "free", label: "自由", ratio: null },
    ],
  };
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.ceil(bytes / 1024)}KB`;
}

function getImageValidationIssues(
  image: LoadedImageFile,
  usage: ImageUsage,
  options: { skipRatio?: boolean } = {},
) {
  const requirement = getImageRequirement(usage);
  const issues: string[] = [];

  if (!EDITOR_IMAGE_ALLOWED_TYPES.has(image.file.type)) {
    issues.push("格式不符合要求，将转为 WebP");
  }

  if (image.file.size > EDITOR_IMAGE_MAX_BYTES) {
    issues.push(`图片大小 ${formatFileSize(image.file.size)}，超过 5MB`);
  } else if (image.file.size > EDITOR_IMAGE_DIRECT_UPLOAD_MAX_BYTES) {
    issues.push(`图片大小 ${formatFileSize(image.file.size)}，建议压缩后上传`);
  }

  if (image.width < requirement.minWidth) {
    issues.push(`图片宽度 ${image.width}px，低于 ${requirement.minWidth}px`);
  }

  const fixedRatios = options.skipRatio
    ? []
    : requirement.ratios.filter((item) => item.ratio);
  if (fixedRatios.length > 0) {
    const currentRatio = image.width / image.height;
    const ratioMatched = fixedRatios.some((item) =>
      item.ratio ? Math.abs(currentRatio - item.ratio) / item.ratio <= 0.08 : true
    );
    if (!ratioMatched) {
      issues.push(`当前比例 ${currentRatio.toFixed(2)}，不适合 ${requirement.label}`);
    }
  }

  return issues;
}

function loadImageFile(file: File) {
  return new Promise<LoadedImageFile>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({
        element: image,
        file,
        height: image.naturalHeight,
        objectUrl,
        width: image.naturalWidth,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片无法读取，请重新选择"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片修正失败"));
        return;
      }
      resolve(blob);
    }, "image/webp", quality);
  });
}

async function repairImageFile(input: {
  file: File;
  quality: number;
  ratio: number | null;
}) {
  const image = await loadImageFile(input.file);
  try {
    const sourceRatio = image.width / image.height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;

    if (input.ratio && Math.abs(sourceRatio - input.ratio) > 0.01) {
      if (sourceRatio > input.ratio) {
        sw = Math.round(image.height * input.ratio);
        sx = Math.round((image.width - sw) / 2);
      } else {
        sh = Math.round(image.width / input.ratio);
        sy = Math.round((image.height - sh) / 2);
      }
    }

    const outputWidth = Math.min(sw, EDITOR_IMAGE_OUTPUT_MAX_WIDTH);
    const outputHeight = Math.round(outputWidth / (sw / sh));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持图片修正");
    }

    context.drawImage(image.element, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    const blob = await canvasToBlob(canvas, input.quality);
    return new File(
      [blob],
      `${input.file.name.replace(/\.[^.]+$/, "") || "h5-image"}.webp`,
      { type: "image/webp" },
    );
  } finally {
    URL.revokeObjectURL(image.objectUrl);
  }
}

async function uploadEditorImage(file: File) {
  const formData = new FormData();
  formData.append("scene", "h5_marketing_page");
  formData.append("file", file);

  const response = await fetch("/api/backend/uploads/images", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "图片上传失败"));
  }

  const url = payload?.data?.list?.[0]?.url;
  if (typeof url !== "string" || !url) {
    throw new Error("图片上传成功但未返回地址");
  }

  return url;
}

async function fetchProjectCaseOptions(keyword: string) {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "8",
  });
  if (keyword.trim()) {
    query.set("keyword", keyword.trim());
  }

  const response = await fetch(`/api/backend/marketing-pages/project-options?${query}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "项目案例加载失败"));
  }

  return (payload?.data?.list || []) as ProjectCaseOption[];
}

function createBlockId(type: H5BlockType) {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createBlock(type: H5BlockType): H5Block {
  const base = { id: createBlockId(type), type };
  switch (type) {
    case "hero":
      return {
        ...base,
        props: {
          kicker: "GOODCMS 活动",
          title: "限时活动",
          subtitle: "预约咨询，获取专属活动权益。",
          imageUrl: "",
          buttonText: "立即预约",
          buttonAction: { type: "scroll_to_form" },
        },
      };
    case "image":
      return { ...base, props: { imageUrl: "", caption: "" } };
    case "text":
      return { ...base, props: { title: "活动说明", content: "填写活动内容", align: "left" } };
    case "button":
      return { ...base, props: { text: "立即咨询", action: { type: "scroll_to_form" } } };
    case "image_text":
      return {
        ...base,
        props: {
          imageUrl: "",
          title: "服务亮点",
          content: "补充图文说明",
          buttonText: "",
          buttonAction: { type: "scroll_to_form" },
        },
      };
    case "case_list":
      return {
        ...base,
        props: {
          title: "精选案例",
          items: [
            { title: "现代简约案例", subtitle: "三室两厅 · 全案设计", imageUrl: "" },
          ],
        },
      };
    case "countdown":
      return { ...base, props: { title: "活动倒计时", endAt: new Date(Date.now() + 7 * 86400000).toISOString() } };
    case "lead_form":
      return {
        ...base,
        props: {
          title: "预约咨询",
          description: "留下联系方式，我们会尽快与您确认活动权益。",
          fields: ["name", "phone", "community"],
          submitText: "提交预约",
        },
      };
    case "phone_cta":
      return { ...base, props: { text: "电话咨询", phone: "" } };
    case "footer":
      return { ...base, props: { text: "GoodCMS", logo: "" } };
  }
}

function normalizeLeadFormFields(value: unknown) {
  const rawFields = Array.isArray(value) && value.length
    ? value
    : ["name", "phone", "community"];
  const fields = rawFields
    .map((field) => String(field || "").trim())
    .filter(Boolean);

  if (!fields.includes("phone")) {
    fields.splice(Math.min(fields.length, 1), 0, "phone");
  }

  return Array.from(new Set(fields));
}

function normalizeBlock(block: H5Block): H5Block {
  if (block.type !== "lead_form") {
    return block;
  }

  return {
    ...block,
    props: {
      ...block.props,
      fields: normalizeLeadFormFields(block.props.fields),
    },
  };
}

function normalizeConfig(config: H5PageConfig | null | undefined, page: H5PageEditorPage): H5PageConfig {
  return {
    schemaVersion: config?.schemaVersion || 1,
    title: config?.title || page.title,
    theme: {
      primaryColor: config?.theme?.primaryColor || "#0f766e",
      backgroundColor: config?.theme?.backgroundColor || "#f7f3ea",
      textColor: config?.theme?.textColor || "#1f2933",
    },
    blocks: Array.isArray(config?.blocks) ? config.blocks.map(normalizeBlock) : [],
  };
}

function getString(props: Record<string, unknown>, key: string) {
  const value = props[key];
  return typeof value === "string" ? value : "";
}

function getActionType(props: Record<string, unknown>, key: string) {
  const value = props[key];
  if (value && typeof value === "object" && "type" in value) {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return "scroll_to_form";
}

function getActionString(props: Record<string, unknown>, key: string, field: string) {
  const value = props[key];
  if (value && typeof value === "object" && field in value) {
    const fieldValue = (value as Record<string, unknown>)[field];
    if (typeof fieldValue === "string") return fieldValue;
  }
  return "";
}

function previewImage(url: string, alt: string, className: string) {
  if (!url) return null;

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return items;
  next.splice(toIndex, 0, item);
  return next;
}

function parseCaseItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return { title: "", subtitle: "", imageUrl: "" };
    }

    const record = item as Record<string, unknown>;
    return {
      projectId: typeof record.projectId === "string" ? record.projectId : "",
      title: typeof record.title === "string" ? record.title : "",
      subtitle: typeof record.subtitle === "string" ? record.subtitle : "",
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
    };
  });
}

function moveCaseItem(items: CaseListItem[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  return moveItem(items, fromIndex, toIndex);
}

function blockSummary(block: H5Block) {
  const props = block.props || {};
  return getString(props, "title") ||
    getString(props, "text") ||
    getString(props, "caption") ||
    blockLabel[block.type];
}

function PreviewBlock({
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
      ) : block.type === "footer" ? (
        <div className="flex items-center gap-3 p-4">
          {logoUrl ? (
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
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
                {String(field)}
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

function PropertyPanel({
  block,
  onChange,
}: {
  block: H5Block | null;
  onChange: (props: Record<string, unknown>) => void;
}) {
  if (!block) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        请选择中间预览中的一个模块，或从左侧添加新模块。
      </div>
    );
  }

  const props = block.props || {};
  const update = (key: string, value: unknown) => onChange({ ...props, [key]: value });
  const updateAction = (key: string, type: string) => update(key, { type });
  const updateActionValue = (key: string, field: string, value: string) => {
    const current = props[key];
    const currentAction = current && typeof current === "object"
      ? current as Record<string, unknown>
      : { type: "scroll_to_form" };
    update(key, { ...currentAction, [field]: value });
  };

  return (
    <FieldGroup>
      <div>
        <div className="text-sm font-medium">{blockLabel[block.type]}</div>
        <div className="mt-1 text-xs text-muted-foreground">{block.id}</div>
      </div>

      {block.type === "hero" ? (
        <>
          <TextField label="角标" value={getString(props, "kicker")} onChange={(value) => update("kicker", value)} />
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="副标题" value={getString(props, "subtitle")} onChange={(value) => update("subtitle", value)} />
          <ImageUploadField label="背景图片" usage="hero" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
          <TextField label="按钮文案" value={getString(props, "buttonText")} onChange={(value) => update("buttonText", value)} />
          <ActionField label="按钮动作" value={getActionType(props, "buttonAction")} onChange={(value) => updateAction("buttonAction", value)} />
          <ActionDetailFields
            type={getActionType(props, "buttonAction")}
            url={getActionString(props, "buttonAction", "url")}
            phone={getActionString(props, "buttonAction", "phone")}
            onUrlChange={(value) => updateActionValue("buttonAction", "url", value)}
            onPhoneChange={(value) => updateActionValue("buttonAction", "phone", value)}
          />
        </>
      ) : null}

      {block.type === "image" ? (
        <>
          <ImageUploadField label="图片" usage="content" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
          <TextField label="图片说明" value={getString(props, "caption")} onChange={(value) => update("caption", value)} />
        </>
      ) : null}

      {block.type === "text" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="正文" value={getString(props, "content")} onChange={(value) => update("content", value)} />
          <SelectField
            label="对齐"
            value={getString(props, "align") || "left"}
            options={[
              { value: "left", label: "左对齐" },
              { value: "center", label: "居中" },
              { value: "right", label: "右对齐" },
            ]}
            onChange={(value) => update("align", value)}
          />
        </>
      ) : null}

      {block.type === "button" ? (
        <>
          <TextField label="按钮文案" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <ActionField label="按钮动作" value={getActionType(props, "action")} onChange={(value) => updateAction("action", value)} />
          <ActionDetailFields
            type={getActionType(props, "action")}
            url={getActionString(props, "action", "url")}
            phone={getActionString(props, "action", "phone")}
            onUrlChange={(value) => updateActionValue("action", "url", value)}
            onPhoneChange={(value) => updateActionValue("action", "phone", value)}
          />
        </>
      ) : null}

      {block.type === "image_text" ? (
        <>
          <ImageUploadField label="图片" usage="content" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="正文" value={getString(props, "content")} onChange={(value) => update("content", value)} />
          <TextField label="按钮文案" value={getString(props, "buttonText")} onChange={(value) => update("buttonText", value)} />
          <ActionField label="按钮动作" value={getActionType(props, "buttonAction")} onChange={(value) => updateAction("buttonAction", value)} />
          <ActionDetailFields
            type={getActionType(props, "buttonAction")}
            url={getActionString(props, "buttonAction", "url")}
            phone={getActionString(props, "buttonAction", "phone")}
            onUrlChange={(value) => updateActionValue("buttonAction", "url", value)}
            onPhoneChange={(value) => updateActionValue("buttonAction", "phone", value)}
          />
        </>
      ) : null}

      {block.type === "case_list" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <ProjectCaseSelector
            items={parseCaseItems(props.items)}
            onChange={(items) => update("items", items)}
          />
          <TextareaField
            label="案例 JSON"
            description="兜底编辑。数组格式，每项包含 projectId、title、subtitle、imageUrl。"
            value={JSON.stringify(parseCaseItems(props.items), null, 2)}
            onChange={(value) => {
              try {
                const parsed = JSON.parse(value);
                update("items", Array.isArray(parsed) ? parsed : []);
              } catch {
                update("items", []);
              }
            }}
          />
        </>
      ) : null}

      {block.type === "countdown" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextField label="截止时间 ISO" value={getString(props, "endAt")} onChange={(value) => update("endAt", value)} />
        </>
      ) : null}

      {block.type === "lead_form" ? (
        <>
          <TextField label="标题" value={getString(props, "title")} onChange={(value) => update("title", value)} />
          <TextareaField label="说明" value={getString(props, "description")} onChange={(value) => update("description", value)} />
          <TextField
            label="字段"
            description="逗号分隔，例如 name,phone,community。手机号 phone 为必填字段，保存时会自动保留。"
            value={normalizeLeadFormFields(props.fields).join(",")}
            onChange={(value) => update("fields", normalizeLeadFormFields(value.split(",")))}
          />
          <TextField label="提交按钮" value={getString(props, "submitText")} onChange={(value) => update("submitText", value)} />
        </>
      ) : null}

      {block.type === "phone_cta" ? (
        <>
          <TextField label="按钮文案" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <TextField label="电话号码" value={getString(props, "phone")} onChange={(value) => update("phone", value)} />
        </>
      ) : null}

      {block.type === "footer" ? (
        <>
          <TextField label="底部文字" value={getString(props, "text")} onChange={(value) => update("text", value)} />
          <ImageUploadField label="Logo" usage="logo" value={getString(props, "logo")} onChange={(value) => update("logo", value)} />
        </>
      ) : null}
    </FieldGroup>
  );
}

function ProjectCaseSelector({
  items,
  onChange,
}: {
  items: CaseListItem[];
  onChange: (items: CaseListItem[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<ProjectCaseOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    fetchProjectCaseOptions("")
      .then((list) => {
        if (!cancelled) setOptions(list);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "项目案例加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const searchOptions = async () => {
    setLoading(true);
    try {
      setOptions(await fetchProjectCaseOptions(keyword));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "项目案例加载失败");
    } finally {
      setLoading(false);
    }
  };

  const addOption = (option: ProjectCaseOption) => {
    const projectId = option.projectId || option.id;
    if (projectId && items.some((item) => item.projectId === projectId)) {
      toast.error("该项目已在案例列表");
      return;
    }

    onChange([
      ...items,
      {
        projectId,
        title: option.title || "未命名项目",
        subtitle: option.subtitle || "",
        imageUrl: option.imageUrl || "",
      },
    ]);
  };

  return (
    <Field>
      <FieldLabel>项目案例</FieldLabel>
      <div className="flex gap-2">
        <Input
          value={keyword}
          placeholder="搜索项目名称或地址"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void searchOptions();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={loading} onClick={() => void searchOptions()}>
          {loading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Search data-icon="inline-start" />
          )}
          搜索
        </Button>
      </div>
      <FieldDescription>
        从项目库选择后会写入当前活动页配置，后续页面展示使用这份快照。
      </FieldDescription>

      <div className="space-y-2 rounded-md border bg-muted/20 p-2">
        {options.length > 0 ? options.map((option) => {
          const projectId = option.projectId || option.id;
          const selected = Boolean(projectId && items.some((item) => item.projectId === projectId));

          return (
            <div
              key={option.id}
              className="flex items-center gap-3 rounded-md border bg-background p-2"
            >
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-xs text-muted-foreground">
                {option.imageUrl
                  ? previewImage(option.imageUrl, option.title, "size-full object-cover")
                  : "无图"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{option.title || "未命名项目"}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {option.subtitle || option.status || "项目信息待补"}
                </div>
              </div>
              <Button
                type="button"
                variant={selected ? "secondary" : "outline"}
                size="sm"
                disabled={selected}
                onClick={() => addOption(option)}
              >
                <Plus data-icon="inline-start" />
                {selected ? "已添加" : "添加"}
              </Button>
            </div>
          );
        }) : (
          <div className="rounded-md border border-dashed bg-background px-3 py-6 text-center text-sm text-muted-foreground">
            {loading ? "项目加载中" : "暂无可选项目"}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">已选案例</div>
          {items.map((item, index) => (
            <div
              key={`${item.projectId || item.title || "case"}-${index}`}
              className="flex items-center gap-3 rounded-md border bg-background p-2"
            >
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-xs text-muted-foreground">
                {item.imageUrl
                  ? previewImage(item.imageUrl, item.title, "size-full object-cover")
                  : "无图"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.title || "未命名项目"}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {item.subtitle || "项目信息待补"}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  onClick={() => onChange(moveCaseItem(items, index, index - 1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === items.length - 1}
                  onClick={() => onChange(moveCaseItem(items, index, index + 1))}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Field>
  );
}

function ImageUploadField({
  label,
  value,
  usage,
  onChange,
}: {
  label: string;
  value: string;
  usage: ImageUsage;
  onChange: (value: string) => void;
}) {
  const requirement = getImageRequirement(usage);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [repairState, setRepairState] = useState<ImageRepairState | null>(null);
  const [repairRatio, setRepairRatio] = useState(requirement.ratios[0]?.value || "free");
  const [quality, setQuality] = useState(0.82);
  const [uploading, setUploading] = useState(false);
  const cannotRepair = Boolean(repairState && repairState.width < requirement.minWidth);

  const closeRepair = () => {
    if (repairState?.objectUrl) {
      URL.revokeObjectURL(repairState.objectUrl);
    }
    setRepairState(null);
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const image = await loadImageFile(file);
      const issues = getImageValidationIssues(image, usage);
      if (issues.length > 0) {
        setRepairRatio(requirement.ratios[0]?.value || "free");
        setQuality(0.82);
        setRepairState({ ...image, issues, usage });
        return;
      }

      try {
        const url = await uploadEditorImage(file);
        onChange(url);
        toast.success("图片已上传");
        URL.revokeObjectURL(image.objectUrl);
      } catch (uploadError) {
        setRepairRatio(requirement.ratios[0]?.value || "free");
        setQuality(0.82);
        setRepairState({
          ...image,
          issues: [
            uploadError instanceof Error ? uploadError.message : "图片上传失败",
            "可尝试压缩并转为 WebP 后重新上传",
          ],
          usage,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const applyRepair = async () => {
    if (!repairState || cannotRepair) return;
    setUploading(true);
    try {
      const ratioConfig = requirement.ratios.find((item) => item.value === repairRatio);
      const repairedFile = await repairImageFile({
        file: repairState.file,
        quality,
        ratio: ratioConfig?.ratio ?? null,
      });
      const repairedImage = await loadImageFile(repairedFile);
      const issues = getImageValidationIssues(repairedImage, usage, {
        skipRatio: usage === "content" && repairRatio === "free",
      });
      URL.revokeObjectURL(repairedImage.objectUrl);
      if (issues.length > 0) {
        throw new Error(issues[0]);
      }

      const url = await uploadEditorImage(repairedFile);
      onChange(url);
      toast.success("图片已修正并上传");
      closeRepair();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片修正失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder="https://..."
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          上传
        </Button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          onChange={(event) => {
            void selectFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
      <FieldDescription>
        {requirement.label} 建议宽度不低于 {requirement.minWidth}px，单张不超过 5MB，比例建议 {requirement.ratios.filter((item) => item.ratio).map((item) => item.label).join(" / ") || "自由"}。
      </FieldDescription>
      {value ? (
        <div className="overflow-hidden rounded-md border bg-muted/40">
          <div className="relative">
            <img src={value} alt={label} className="max-h-32 w-full object-cover" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-2 top-2 bg-background/90"
              onClick={() => onChange("")}
            >
              <Trash2 data-icon="inline-start" />
              删除
            </Button>
          </div>
          <div className="border-t bg-background px-3 py-2 text-xs text-muted-foreground">
            图片已写入当前模块配置，保存草稿或发布后生效。
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(repairState)} onOpenChange={(open) => {
        if (!open) closeRepair();
      }}>
        <DialogContent className="max-h-[90vh] max-w-[760px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>图片修正</DialogTitle>
            <DialogDescription>
              当前图片不符合 {requirement.label} 要求，可在线裁剪、压缩并转为 WebP。
            </DialogDescription>
          </DialogHeader>

          {repairState ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="overflow-hidden rounded-lg border bg-black/5">
                <img
                  src={repairState.objectUrl}
                  alt="待修正图片"
                  className="max-h-[420px] w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border bg-[#fffdf6] p-3">
                  <div className="text-sm font-semibold">不符合原因</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {repairState.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs text-muted-foreground">
                    原图 {repairState.width} x {repairState.height}，{formatFileSize(repairState.file.size)}
                  </div>
                </div>

                <Field>
                  <FieldLabel>裁剪比例</FieldLabel>
                  <Select value={repairRatio} onValueChange={setRepairRatio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {requirement.ratios.map((ratio) => (
                          <SelectItem key={ratio.value} value={ratio.value}>
                            {ratio.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>输出质量：{Math.round(quality * 100)}%</FieldLabel>
                  <Input
                    type="range"
                    min={60}
                    max={92}
                    step={2}
                    value={Math.round(quality * 100)}
                    onChange={(event) => setQuality(Number(event.target.value) / 100)}
                  />
                  <FieldDescription>默认输出 WebP，通常可以压到 5MB 以内。</FieldDescription>
                </Field>

                {cannotRepair ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    图片宽度过低，在线工具不做强行放大。请重新选择更清晰的素材。
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRepair}>
              重新选择
            </Button>
            <Button type="button" disabled={uploading || cannotRepair} onClick={applyRepair}>
              {uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              应用并上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}

function TextField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function TextareaField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function ActionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      options={[
        { value: "scroll_to_form", label: "滚动到表单" },
        { value: "phone", label: "拨打电话" },
        { value: "link", label: "跳转链接" },
      ]}
      onChange={onChange}
    />
  );
}

function ActionDetailFields({
  type,
  url,
  phone,
  onUrlChange,
  onPhoneChange,
}: {
  type: string;
  url: string;
  phone: string;
  onUrlChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
}) {
  if (type === "link") {
    return (
      <TextField
        label="跳转 URL"
        value={url}
        description="建议使用 https 地址。"
        onChange={onUrlChange}
      />
    );
  }

  if (type === "phone") {
    return (
      <TextField
        label="电话号码"
        value={phone}
        description="点击按钮后会唤起手机拨号。"
        onChange={onPhoneChange}
      />
    );
  }

  return null;
}

export function H5PageEditor({
  page,
  draftVersion,
  returnHref = H5_MARKETING_RETURN_HREF,
}: {
  page: H5PageEditorPage;
  draftVersion: H5PageEditorVersion;
  returnHref?: string;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(() => normalizeConfig(draftVersion.config, page));
  const [selectedBlockId, setSelectedBlockId] = useState(config.blocks[0]?.id || "");
  const [dragBlockId, setDragBlockId] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedBlock = useMemo(
    () => config.blocks.find((block) => block.id === selectedBlockId) || null,
    [config.blocks, selectedBlockId],
  );
  const pageUrl = `${getH5BaseUrl()}/p/${page.slug}`;

  function updateConfig(next: Partial<H5PageConfig>) {
    setConfig((current) => ({ ...current, ...next }));
  }

  function addBlock(type: H5BlockType) {
    const block = createBlock(type);
    setConfig((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setSelectedBlockId(block.id);
  }

  function updateBlockProps(blockId: string, props: Record<string, unknown>) {
    setConfig((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId ? normalizeBlock({ ...block, props }) : block
      ),
    }));
  }

  function duplicateBlock(blockId: string) {
    const target = config.blocks.find((block) => block.id === blockId);
    if (!target) return;
    const copy = {
      ...target,
      id: createBlockId(target.type),
      props: { ...target.props },
    };
    const index = config.blocks.findIndex((block) => block.id === blockId);
    setConfig((current) => ({
      ...current,
      blocks: [
        ...current.blocks.slice(0, index + 1),
        copy,
        ...current.blocks.slice(index + 1),
      ],
    }));
    setSelectedBlockId(copy.id);
  }

  function deleteBlock(blockId: string) {
    setConfig((current) => {
      const nextBlocks = current.blocks.filter((block) => block.id !== blockId);
      if (selectedBlockId === blockId) {
        setSelectedBlockId(nextBlocks[0]?.id || "");
      }
      return { ...current, blocks: nextBlocks };
    });
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    const index = config.blocks.findIndex((block) => block.id === blockId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= config.blocks.length) return;
    setConfig((current) => ({
      ...current,
      blocks: moveItem(current.blocks, index, nextIndex),
    }));
  }

  function dropBlock(targetBlockId: string) {
    if (!dragBlockId || dragBlockId === targetBlockId) return;
    const fromIndex = config.blocks.findIndex((block) => block.id === dragBlockId);
    const toIndex = config.blocks.findIndex((block) => block.id === targetBlockId);
    if (fromIndex < 0 || toIndex < 0) return;
    setConfig((current) => ({
      ...current,
      blocks: moveItem(current.blocks, fromIndex, toIndex),
    }));
    setDragBlockId("");
  }

  function saveDraft() {
    startTransition(async () => {
      try {
        const normalizedConfig = normalizeConfig(config, page);
        setConfig(normalizedConfig);
        await requestEditor({
          path: `/marketing-pages/${page.id}/draft`,
          method: "PUT",
          payload: { config: normalizedConfig },
        });
        toast.success("草稿已保存");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  function publishPage() {
    startTransition(async () => {
      try {
        const normalizedConfig = normalizeConfig(config, page);
        setConfig(normalizedConfig);
        await requestEditor({
          path: `/marketing-pages/${page.id}/draft`,
          method: "PUT",
          payload: { config: normalizedConfig },
        });
        await requestEditor({
          path: `/marketing-pages/${page.id}/publish`,
          method: "POST",
        });
        toast.success("H5 活动页已发布");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发布失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Button type="button" variant="ghost" className="mb-2 px-0" onClick={() => router.push(returnHref)}>
            <ArrowLeft data-icon="inline-start" />
            返回营销活动
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal">{page.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pageUrl}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => window.open(pageUrl, "_blank")}>
            <ExternalLink data-icon="inline-start" />
            预览
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={saveDraft}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            保存草稿
          </Button>
          <Button type="button" disabled={pending} onClick={publishPage}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            发布
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(360px,1fr)_340px]">
        <aside className="rounded-md border bg-background p-4">
          <div className="text-sm font-medium">模块库</div>
          <div className="mt-3 flex flex-col gap-2">
            {moduleTemplates.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:bg-accent"
                  onClick={() => addBlock(item.type)}
                >
                  <Icon className="mt-0.5 size-4 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </span>
                  <Plus className="ml-auto size-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-md border bg-muted/30 p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Field>
              <FieldLabel>页面标题</FieldLabel>
              <Input value={config.title || ""} onChange={(event) => updateConfig({ title: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>主色</FieldLabel>
              <Input
                type="color"
                value={config.theme?.primaryColor || "#0f766e"}
                onChange={(event) => updateConfig({
                  theme: { ...config.theme, primaryColor: event.target.value },
                })}
              />
            </Field>
            <Field>
              <FieldLabel>背景色</FieldLabel>
              <Input
                type="color"
                value={config.theme?.backgroundColor || "#f7f3ea"}
                onChange={(event) => updateConfig({
                  theme: { ...config.theme, backgroundColor: event.target.value },
                })}
              />
            </Field>
          </div>

          <div className="mx-auto min-h-[680px] w-full max-w-[390px] rounded-[24px] border bg-background p-3 shadow-sm">
            <div className="mb-3 h-5 rounded-full bg-muted" />
            <div className="flex min-h-[620px] flex-col gap-3 rounded-md bg-muted/40 p-2">
              {config.blocks.length ? config.blocks.map((block, index) => (
                <PreviewBlock
                  key={block.id}
                  block={block}
                  selected={block.id === selectedBlockId}
                  onSelect={() => setSelectedBlockId(block.id)}
                  onMoveUp={() => moveBlock(block.id, -1)}
                  onMoveDown={() => moveBlock(block.id, 1)}
                  onDelete={() => deleteBlock(block.id)}
                  onDragStart={() => setDragBlockId(block.id)}
                  onDrop={() => dropBlock(block.id)}
                />
              )) : (
                <div className="grid min-h-[360px] place-items-center rounded-md border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
                  从左侧添加模块开始搭建页面
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-md border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">属性面板</div>
            {selectedBlock ? (
              <Button type="button" variant="outline" size="sm" onClick={() => duplicateBlock(selectedBlock.id)}>
                <Copy data-icon="inline-start" />
                复制
              </Button>
            ) : null}
          </div>
          <PropertyPanel
            block={selectedBlock}
            onChange={(props) => {
              if (selectedBlock) updateBlockProps(selectedBlock.id, props);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
