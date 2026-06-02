import { Errors } from "@/errors/error-factory";
import { aiGateway } from "@/services/ai-gateway";
import type {
  MarketingPageBlockAiFillInput,
  MarketingPageCreateAiFillInput,
  MarketingPageSettingsAiFillInput,
} from "@/schema/marketing-pages";
import { systemSettingsService } from "@/services/system-settings";

export type AiMessageRole = "system" | "user" | "assistant";

export type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export type OpenAiRequestBody = {
  model: string;
  temperature: number;
  messages: Array<{ role: AiMessageRole; content: string }>;
  response_format?: { type: "json_object" };
};

export type MarketingPageAiBillingContext = {
  tenantId?: string | null;
  source?: string | null;
  billable?: boolean;
  authUserId?: string | null;
};

export type FieldDefinition = {
  type: "string" | "text" | "select";
  label: string;
  maxLength: number;
  options?: string[];
};

export const BLOCK_AI_FIELD_DEFINITIONS: Record<string, Record<string, FieldDefinition>> = {
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

export const PAGE_SETTINGS_AI_FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  title: { type: "string", label: "页面标题", maxLength: 120 },
  slug: { type: "string", label: "页面路径", maxLength: 80 },
  description: { type: "text", label: "页面描述", maxLength: 500 },
  display_scene: {
    type: "select",
    label: "展示场景",
    maxLength: 20,
    options: ["all", "home", "customer_home", "project_detail", "marketing_list"],
  },
};

export const SYSTEM_PROMPT = `你是家装公司 H5 营销活动页配置助手。
你只负责根据页面上下文优化当前模块的可编辑文案字段。

必须遵守：
1. 只返回 JSON，禁止输出解释、markdown 或代码块。
2. 返回格式必须是 {"patch": {"字段名": "字段值"}}。
3. 只能填写 field_schema 中列出的字段，不要新增字段。
4. 不要修改图片、电话、链接、跳转动作、项目案例列表、倒计时日期。
5. 文案要简洁、适合手机屏幕，避免夸大承诺和绝对化表达。
6. 家装业务场景优先围绕装修咨询、活动权益、设计方案、施工服务和预约转化。`;

export const SETTINGS_SYSTEM_PROMPT = `你是家装公司 H5 营销活动页配置助手。
你只负责优化活动页列表配置弹窗里的基础展示信息。

必须遵守：
1. 只返回 JSON，禁止输出解释、markdown 或代码块。
2. 返回格式必须是 {"patch": {"字段名": "字段值"}}。
3. 只能填写 field_schema 中列出的字段，不要新增字段。
4. 不要修改排序、有效期、发布状态、图片或链接。
5. slug 必须是小写英文、数字、中划线组合，不能以中划线开头或结尾。
6. display_scene 只能从 field_schema.options 中选择。
7. 文案要简洁、适合小程序活动列表展示，避免夸大承诺和绝对化表达。`;

export const CREATE_SYSTEM_PROMPT = `你正在为装修公司后台生成 H5 营销活动页的新建表单内容。

业务场景：
- 装修公司获客活动。
- 用户会在微信小程序 web-view 或 H5 页面中看到。
- 目标是让客户愿意留下联系方式。

生成字段：
- title：页面标题，不超过 30 个中文字符。
- description：页面描述，不超过 80 个中文字符。

写作要求：
1. 只返回 JSON，禁止输出解释、markdown 或代码块。
2. 返回格式必须是 {"title": "string", "description": "string"}。
3. 清晰、可信、偏转化。
4. 不夸大承诺，不使用“百分百”“保证”等绝对化表达。
5. 不生成价格虚假承诺。
6. 不生成链接、手机号、二维码。
7. 不生成 slug、页面模块配置或其他字段。`;

export { Errors, aiGateway, systemSettingsService };
export type {
  MarketingPageBlockAiFillInput,
  MarketingPageCreateAiFillInput,
  MarketingPageSettingsAiFillInput,
};
