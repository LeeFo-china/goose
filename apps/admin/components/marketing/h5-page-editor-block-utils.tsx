import type { CaseListItem, H5Block, H5BlockType, H5PageConfig, H5PageEditorPage } from "@/components/marketing/h5-page-editor-types";
import { LEAD_FORM_FIELD_LABELS, moduleTemplates } from "@/components/marketing/h5-page-editor-types";

export function createBlockId(type: H5BlockType) {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createBlock(type: H5BlockType): H5Block {
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
    case "floating_phone_cta":
      return {
        ...base,
        props: {
          text: "电话咨询",
          phone: "",
          side: "right",
          bottom: 96,
        },
      };
    case "footer":
      return { ...base, props: { text: "GoodCMS", logo: "" } };
  }
}

export function normalizeLeadFormFields(value: unknown) {
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

export function getLeadFormFieldLabel(field: string) {
  return LEAD_FORM_FIELD_LABELS[field] || field;
}

export function normalizeBlock(block: H5Block): H5Block {
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

export function normalizeConfig(config: H5PageConfig | null | undefined, page: H5PageEditorPage): H5PageConfig {
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

export function getString(props: Record<string, unknown>, key: string) {
  const value = props[key];
  return typeof value === "string" ? value : "";
}

export function getNumber(props: Record<string, unknown>, key: string, fallback: number) {
  const value = props[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getFloatingPhoneProps(props: Record<string, unknown>) {
  const side = props.side === "left" ? "left" : "right";
  const bottom = clampNumber(getNumber(props, "bottom", 96), 24, 520);

  return {
    text: getString(props, "text") || "电话咨询",
    phone: getString(props, "phone"),
    side,
    bottom,
  };
}

export function getActionType(props: Record<string, unknown>, key: string) {
  const value = props[key];
  if (value && typeof value === "object" && "type" in value) {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return "scroll_to_form";
}

export function getActionString(props: Record<string, unknown>, key: string, field: string) {
  const value = props[key];
  if (value && typeof value === "object" && field in value) {
    const fieldValue = (value as Record<string, unknown>)[field];
    if (typeof fieldValue === "string") return fieldValue;
  }
  return "";
}

export function previewImage(url: string, alt: string, className: string) {
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

export function normalizeCaseImageUrls(item: {
  imageUrl?: string;
  imageUrls?: string[];
}) {
  const urls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  return Array.from(new Set([
    ...urls,
    item.imageUrl || "",
  ].map((url) => url.trim()).filter(Boolean)));
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return items;
  next.splice(toIndex, 0, item);
  return next;
}

export function parseCaseItems(value: unknown) {
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
      imageUrls: Array.isArray(record.imageUrls)
        ? record.imageUrls.filter((url): url is string => typeof url === "string")
        : [],
    };
  });
}

export function moveCaseItem(items: CaseListItem[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  return moveItem(items, fromIndex, toIndex);
}
