"use client";

import { useMemo, useState, useTransition } from "react";
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
  Send,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

function normalizeConfig(config: H5PageConfig | null | undefined, page: H5PageEditorPage): H5PageConfig {
  return {
    schemaVersion: config?.schemaVersion || 1,
    title: config?.title || page.title,
    theme: {
      primaryColor: config?.theme?.primaryColor || "#0f766e",
      backgroundColor: config?.theme?.backgroundColor || "#f7f3ea",
      textColor: config?.theme?.textColor || "#1f2933",
    },
    blocks: Array.isArray(config?.blocks) ? config.blocks : [],
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
      title: typeof record.title === "string" ? record.title : "",
      subtitle: typeof record.subtitle === "string" ? record.subtitle : "",
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
    };
  });
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
        <div className="flex min-h-[260px] flex-col justify-end rounded-md bg-muted p-5 pt-14">
          <div className="mb-2 w-fit rounded-full border bg-background/80 px-2 py-1 text-xs">
            {getString(props, "kicker") || "GOODCMS 活动"}
          </div>
          <div className="text-3xl font-semibold leading-tight">
            {getString(props, "title") || "顶部 Banner"}
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {getString(props, "subtitle") || "首屏活动说明"}
          </div>
          {getString(props, "buttonText") ? (
            <div className="mt-4 rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">
              {getString(props, "buttonText")}
            </div>
          ) : null}
        </div>
      ) : block.type === "image" ? (
        <div className="overflow-hidden rounded-md">
          <div className="grid aspect-[16/10] place-items-center bg-muted text-sm text-muted-foreground">
            {getString(props, "imageUrl") ? "图片已配置" : "图片占位"}
          </div>
          {getString(props, "caption") ? (
            <div className="p-3 text-sm text-muted-foreground">{getString(props, "caption")}</div>
          ) : null}
        </div>
      ) : block.type === "lead_form" ? (
        <div className="p-4">
          <div className="text-xl font-semibold">{getString(props, "title") || "预约表单"}</div>
          <div className="mt-2 text-sm text-muted-foreground">{getString(props, "description") || "表单说明"}</div>
          <div className="mt-4 flex flex-col gap-2">
            {(Array.isArray(props.fields) ? props.fields : ["name", "phone"]).map((field) => (
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
          <TextField label="背景图片 URL" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
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
          <TextField label="图片 URL" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
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
          <TextField label="图片 URL" value={getString(props, "imageUrl")} onChange={(value) => update("imageUrl", value)} />
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
          <TextareaField
            label="案例 JSON"
            description="数组格式，每项包含 title、subtitle、imageUrl。"
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
            description="逗号分隔，例如 name,phone,community"
            value={(Array.isArray(props.fields) ? props.fields : []).join(",")}
            onChange={(value) => update("fields", value.split(",").map((item) => item.trim()).filter(Boolean))}
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
          <TextField label="Logo URL" value={getString(props, "logo")} onChange={(value) => update("logo", value)} />
        </>
      ) : null}
    </FieldGroup>
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
}: {
  page: H5PageEditorPage;
  draftVersion: H5PageEditorVersion;
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
        block.id === blockId ? { ...block, props } : block
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
        await requestEditor({
          path: `/marketing-pages/${page.id}/draft`,
          method: "PUT",
          payload: { config },
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
        await requestEditor({
          path: `/marketing-pages/${page.id}/draft`,
          method: "PUT",
          payload: { config },
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
          <Button type="button" variant="ghost" className="mb-2 px-0" onClick={() => router.push("/marketing")}>
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
