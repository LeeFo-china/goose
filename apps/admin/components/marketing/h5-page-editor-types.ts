import { Image, Layers, Megaphone, MousePointerClick, Phone, Send, Type } from "lucide-react";

export const H5_MARKETING_RETURN_HREF = "/marketing?tab=h5";
export const EDITOR_IMAGE_DIRECT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const EDITOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EDITOR_IMAGE_OUTPUT_MAX_WIDTH = 1200;
export const PROJECT_CASE_SELECTOR_PAGE_SIZE = 5;
export const IMAGE_VIEWER_SLIDE_GAP = 22;
export const EDITOR_IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const LEAD_FORM_FIELD_LABELS: Record<string, string> = {
  name: "姓名",
  phone: "手机号",
  community: "小区",
};

export type ImageUsage = "hero" | "content" | "logo";

export type LoadedImageFile = {
  element: HTMLImageElement;
  file: File;
  height: number;
  objectUrl: string;
  width: number;
};

export type ImageRepairState = LoadedImageFile & {
  issues: string[];
  usage: ImageUsage;
};

export type ProjectCaseOption = {
  id: string;
  projectId?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageUrls?: string[];
  status?: string | null;
};

export type ProjectCaseOptionPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DirectUploadInitResult = {
  object_key: string;
  storage_path?: string;
  upload_url: string;
  method?: "PUT";
  headers?: Record<string, string>;
};

export type DirectUploadCompleteResult = {
  url?: string;
  public_url?: string;
  object_key?: string;
  storage_path?: string;
};

export type CaseListItem = {
  projectId?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageUrls?: string[];
};

export type H5BlockType =
  | "hero"
  | "image"
  | "text"
  | "button"
  | "image_text"
  | "case_list"
  | "countdown"
  | "lead_form"
  | "phone_cta"
  | "floating_phone_cta"
  | "footer";

export type H5Block = {
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

export type H5PageEditorPage = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

export type H5PageEditorVersion = {
  id: string;
  config: H5PageConfig;
};

export type AiFieldDefinition = {
  type: "string" | "text" | "select";
  label: string;
  maxLength: number;
  options?: string[];
};

export type AiFillBlockResponse = {
  patch: Record<string, string>;
  fields: string[];
};

export const moduleTemplates: Array<{
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
  { type: "floating_phone_cta", label: "悬浮电话", description: "固定在屏幕上的拨号按钮", icon: Phone },
  { type: "footer", label: "底部信息", description: "品牌、门店或备案信息", icon: Type },
];

export const blockLabel = Object.fromEntries(
  moduleTemplates.map((item) => [item.type, item.label]),
) as Record<H5BlockType, string>;

export const blockAiFieldSchema: Record<H5BlockType, Record<string, AiFieldDefinition>> = {
  hero: {
    kicker: { type: "string", label: "角标", maxLength: 12 },
    title: { type: "string", label: "标题", maxLength: 24 },
    subtitle: { type: "text", label: "副标题", maxLength: 90 },
    buttonText: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  image: {
    caption: { type: "string", label: "图片说明", maxLength: 60 },
  },
  text: {
    title: { type: "string", label: "标题", maxLength: 24 },
    content: { type: "text", label: "正文", maxLength: 360 },
    align: { type: "select", label: "对齐", maxLength: 10, options: ["left", "center", "right"] },
  },
  button: {
    text: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  image_text: {
    title: { type: "string", label: "标题", maxLength: 24 },
    content: { type: "text", label: "正文", maxLength: 220 },
    buttonText: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  case_list: {
    title: { type: "string", label: "标题", maxLength: 24 },
  },
  countdown: {
    title: { type: "string", label: "标题", maxLength: 24 },
  },
  lead_form: {
    title: { type: "string", label: "标题", maxLength: 24 },
    description: { type: "text", label: "说明", maxLength: 90 },
    submitText: { type: "string", label: "提交按钮", maxLength: 8 },
  },
  phone_cta: {
    text: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  floating_phone_cta: {
    text: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  footer: {
    text: { type: "string", label: "底部文字", maxLength: 60 },
  },
};
