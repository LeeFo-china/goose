import { z } from "zod";
import { h5PageDisplaySceneOptions } from "@/components/marketing/marketing-constants";

export const H5PageFormSchema = z.object({
  title: z.string().trim().min(1, "页面标题不能为空").max(120, "页面标题不能超过 120 个字符"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "页面路径不能为空")
    .max(80, "页面路径不能超过 80 个字符")
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/,
      "页面路径只能包含小写字母、数字和中划线",
    ),
  description: z.string().trim().max(500, "页面描述不能超过 500 个字符").optional(),
  display_scene: z.enum(["all", "home", "customer_home", "project_detail", "marketing_list"]),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
});

export type H5PageFormValues = z.infer<typeof H5PageFormSchema>;

export type AiFieldDefinition = {
  type: "string" | "text" | "select";
  label: string;
  maxLength: number;
  options?: string[];
};

export type AiFillSettingsResponse = {
  patch: Partial<Record<keyof H5PageFormValues, string>>;
  fields: string[];
};

export type AiFillCreateResponse = {
  title: string;
  description: string;
};

export type AiSettingsSnapshot = Pick<
  H5PageFormValues,
  "title" | "slug" | "description" | "display_scene"
>;

export type AiCreateSnapshot = Pick<H5PageFormValues, "title" | "description">;

export const settingsAiFieldSchema: Record<string, AiFieldDefinition> = {
  title: { type: "string", label: "页面标题", maxLength: 120 },
  slug: { type: "string", label: "页面路径", maxLength: 80 },
  description: { type: "text", label: "页面描述", maxLength: 500 },
  display_scene: {
    type: "select",
    label: "展示场景",
    maxLength: 20,
    options: h5PageDisplaySceneOptions.map(([value]) => value),
  },
};

export function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

export type H5MarketingPageRouteOptions = {
  apiBasePath?: string;
  editBasePath?: string;
  returnTo?: string;
  tenantSlug?: string | null;
  activePageCount?: number;
};

export const DEFAULT_H5_PAGE_API_BASE_PATH = "/marketing-pages";
export const DEFAULT_H5_PAGE_EDIT_BASE_PATH = "/marketing/h5-pages";
export const DEFAULT_H5_PAGE_RETURN_TO = "/marketing?tab=h5";

export function buildH5PageEditHref(
  pageId: string,
  editBasePath = DEFAULT_H5_PAGE_EDIT_BASE_PATH,
  returnTo = DEFAULT_H5_PAGE_RETURN_TO,
) {
  const query = new URLSearchParams({
    returnTo,
  });
  return `${editBasePath}/${pageId}/edit?${query}`;
}

export function buildPageUrl(slug: string, tenantSlug?: string | null) {
  const encodedSlug = encodeURIComponent(slug);
  return tenantSlug
    ? `${getH5BaseUrl()}/t/${encodeURIComponent(tenantSlug)}/p/${encodedSlug}`
    : `${getH5BaseUrl()}/p/${encodedSlug}`;
}

export function toApiDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function toDateTimeLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function buildPagePayload(values: H5PageFormValues) {
  return {
    title: values.title,
    slug: values.slug,
    description: values.description || null,
    display_scene: values.display_scene,
    start_at: toApiDateTime(values.start_at),
    end_at: toApiDateTime(values.end_at),
  };
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestH5Page<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
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

export function buildDefaultConfig(values: H5PageFormValues) {
  return {
    schemaVersion: 1,
    title: values.title,
    theme: {
      primaryColor: "#0f766e",
      backgroundColor: "#f7f3ea",
      textColor: "#1f2933",
    },
    blocks: [
      {
        id: "hero_001",
        type: "hero",
        props: {
          kicker: "GOODCMS 活动",
          title: values.title,
          subtitle: values.description || "填写信息，获取专属活动咨询。",
          buttonText: "立即预约",
          buttonAction: {
            type: "scroll_to_form",
          },
        },
      },
      {
        id: "form_001",
        type: "lead_form",
        props: {
          title: "预约咨询",
          description: "留下联系方式，我们会尽快与您确认活动权益。",
          fields: ["name", "phone", "community"],
          submitText: "提交预约",
        },
      },
      {
        id: "footer_001",
        type: "footer",
        props: {
          text: "GoodCMS",
        },
      },
    ],
  };
}

export function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function buildRandomSlug() {
  const date = new Date();
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `h5-${datePart}-${randomPart}`;
}

export function createDefaultH5PageValues(slug = ""): H5PageFormValues {
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    title: "",
    slug,
    description: "",
    display_scene: "all",
    start_at: toDateTimeLocalInputValue(startAt),
    end_at: toDateTimeLocalInputValue(endAt),
  };
}
