import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  DecorationQaRequestInput,
  DecorationQaStreamRequestInput,
  DecorationQaSuggestionQueryInput,
} from "@/schema/ai";
import type { Tables } from "@/types/database";
import { authorizationService } from "@/services/authorization";
import { aiGateway } from "@/services/ai-gateway";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { decorationQaSuggestionCacheRepository } from "@/repositories/decoration-qa-suggestion-cache";
import { projectMemberService } from "@/services/project-members";
import { systemSettingsService } from "@/services/system-settings";
import {
  type AiMessageRole,
  isEmployeeOperableStatus,
  isProjectLogStageCode,
  isProjectStatus,
  PROJECT_LOG_STAGE_CONFIG,
  type ProjectConstructionStageStatus,
  type ProjectLogStageCode,
  ProjectStatusConfig,
} from "@gooes/domain";

export type DecorationQaResult = {
  answer: string;
  suggestions: string[];
};

export type DecorationQaSuggestionScene = DecorationQaSuggestionQueryInput["scene"];

export type DecorationQaSuggestionResult = {
  list: string[];
  source: "cache" | "ai" | "fallback";
  cache_key: string;
  expires_at: string | null;
};

export const SUGGESTION_MEMORY_CACHE_TTL_MS = 5 * 60_000;
export const suggestionMemoryCache = new Map<string, {
  expiresAt: number;
  result: DecorationQaSuggestionResult;
}>();
export const suggestionInFlight = new Map<string, Promise<DecorationQaSuggestionResult>>();

export type DecorationQaStreamEvent =
  | {
    type: "start";
    conversation_id: string;
  }
  | {
    type: "delta";
    content: string;
  }
  | {
    type: "done";
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  }
  | {
    type: "error";
    message: string;
  };

export type OpenAiChatResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

export type OpenAiChatStreamChunk = {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

export type OpenAiRequestBody = {
  model: string;
  temperature: number;
  messages: Array<{ role: AiMessageRole | "system"; content: string }>;
  response_format?: { type: "json_object" };
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
};

export const DEFAULT_SYSTEM_PROMPT =
  `你是一个专业的家装顾问，隶属于“字节跳动固始网络科技”。
你的任务是解答用户关于装修预算、材料选择、工期安排、施工流程、家装避坑等问题。

回答要求：
1. 态度专业、热情、客观。
2. 语言简洁明了，尽量使用分点列表（1. 2. 3.）进行说明。
3. 不要夸大承诺，不要替代专业的结构安全判断。
4. 涉及承重墙拆改、复杂水电改造等高风险施工时，必须提醒用户“具体以现场专业评估为准”。
5. 每次回答结束时，可以根据当前话题，给出 1-2 个相关的延伸问题建议。`;

export const JSON_OUTPUT_PROMPT = `

你必须严格以 JSON 返回，禁止输出 JSON 之外的解释文字，格式如下：
{
  "answer": "回答正文",
  "suggestions": ["追问1", "追问2"]
}

要求：
1. answer 必须是字符串。
2. suggestions 必须是字符串数组，没有追问时返回空数组 []。
3. 不要使用 markdown 代码块。
4. 不要输出多余前缀、后缀或说明。`;

export const STREAM_OUTPUT_PROMPT = `

你必须直接输出自然语言答案正文，不要输出 JSON，不要输出 markdown 代码块，不要输出多余前缀。
回答结束时不要再补“如需我继续”等收尾套话。`;

export const SUGGESTION_SYSTEM_PROMPT =
  `你是装修公司小程序里的装修知识问答推荐问题生成器。
请生成 4 个用户可能会点击的问题。
要求：
1. 每个问题 8 到 22 个中文字符左右。
2. 必须是装修相关问题。
3. 表达具体，不要空泛。
4. 不要输出答案。
5. 不要输出编号。
6. 不要包含 markdown。
7. 不要承诺价格、工期或法律责任。
8. 返回 JSON 数组字符串。`;

export const FALLBACK_VISITOR = [
  "装修预算怎么控制？",
  "水电改造要注意什么？",
  "全包和半包怎么选？",
  "装修工期一般多久？",
  "瓷砖验收看哪些细节？",
  "旧房翻新先做什么？",
  "环保材料怎么选择？",
  "装修合同重点看哪里？",
];

export const FALLBACK_CUSTOMER = [
  "当前阶段要注意什么？",
  "验收时重点看哪些地方？",
  "施工延期该怎么处理？",
  "增项费用怎么确认？",
  "材料进场要核对什么？",
  "水电验收怎么判断合格？",
];

export const FALLBACK_EMPLOYEE = [
  "客户问预算怎么解释？",
  "水电工艺如何说明？",
  "延期原因怎么沟通？",
  "验收标准怎么讲清楚？",
  "材料差异怎么解释？",
  "增项确认怎么提醒？",
];

export type CustomerContextRow = Pick<
  Tables<"customers">,
  "id" | "name" | "user_id" | "tenant_id"
>;

export type ProjectQaProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  address: string | null;
  start_date: string | null;
  style_tags: unknown;
  property: {
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
  } | {
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
  }[] | null;
  designer?: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
  supervisor?: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
};

export type ProjectQaLogRow = {
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  created_at: string | null;
};

export type CustomerProjectQaConstructionStageItem = {
  stage_code: ProjectLogStageCode;
  stage_label: string;
  status: ProjectConstructionStageStatus;
  is_required: boolean;
  is_completion: boolean;
  acceptance_status: string | null;
  latest_log: {
    node_name: string | null;
    content: string | null;
    created_at: string | null;
  } | null;
  blocked_reason: string | null;
};

export type CustomerProjectQaConstructionStageContext = {
  current_stage: CustomerProjectQaConstructionStageItem | null;
  next_stage: CustomerProjectQaConstructionStageItem | null;
  required_completed: boolean;
  required_stage_codes: ProjectLogStageCode[];
  missing_required_stages: Array<{
    stage_code: ProjectLogStageCode;
    stage_label: string;
  }>;
  stages: CustomerProjectQaConstructionStageItem[];
};

export type CustomerProjectQaContext = {
  customer_id: string;
  customer_name: string | null;
  tenant_id: string | null;
  project_id: string;
  project_name: string | null;
  status: string | null;
  status_label: string | null;
  address: string | null;
  start_date: string | null;
  style_tags: string[];
  property: {
    community: string | null;
    building_info: string | null;
    layout: string | null;
    area: number | null;
  } | null;
  designer_name: string | null;
  supervisor_name: string | null;
  construction_stages: CustomerProjectQaConstructionStageContext | null;
  recent_logs: Array<{
    stage_code: ProjectLogStageCode | null;
    stage_label: string | null;
    node_name: string | null;
    content: string | null;
    created_at: string | null;
  }>;
};

export type ProjectQaProjectRowWithTenant = ProjectQaProjectRow & {
  tenant_id: string | null;
};

export type ProjectConstructionStagesResult = Awaited<
  ReturnType<
    typeof constructionStageStatusService.listProjectConstructionStagesForProject
  >
>;

export type DecorationQaUsageSource =
  | "customer_miniprogram"
  | "employee_miniprogram"
  | "visitor"
  | "admin";

export type DecorationQaUsageContext = {
  authUserId?: string | null;
  tenantId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
  source: DecorationQaUsageSource;
  billable: boolean;
};

export type DecorationQaAuthInput = {
  authUserId?: string | null;
  tenantId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  roles?: string[];
};

export const PROJECT_STAGE_REMINDER_PROMPTS: Partial<
  Record<ProjectLogStageCode, string[]>
> = {
  measure: [
    "提醒客户确认量房尺寸、功能需求和预算边界，避免后续频繁改方案。",
    "提醒客户尽快确认平面布局和核心设备需求，减少设计返工。",
  ],
  demolition: [
    "提醒客户关注拆改范围是否与方案一致，承重墙和高风险结构改动必须以现场专业评估为准。",
    "提醒客户提前确认垃圾清运、邻里沟通和施工时间安排。",
  ],
  plumbing_electrical: [
    "提醒客户尽快确认插座、开关、灯位和水路点位，后期改动成本会明显上升。",
    "提醒客户保留好水电施工照片和验收记录，方便后续维护。",
  ],
  tiling: [
    "提醒客户确认瓷砖铺贴方向、对缝方式、地漏坡度和门槛石细节。",
    "提醒客户关注空鼓、阴阳角和排水顺畅情况，必要时安排现场复核。",
  ],
  woodwork: [
    "提醒客户确认柜体尺寸、收口方式、五金和插座避让细节。",
    "提醒客户尽量在封板前完成隐蔽位置复核，避免后续拆改。",
  ],
  painting: [
    "提醒客户确认色号、墙面找平效果和成品保护，避免后续补漆色差。",
    "提醒客户关注通风时间和干燥周期，不要急于安排后续安装。",
  ],
  installation: [
    "提醒客户确认灯具、洁具、开关面板和定制成品的到场顺序，避免安装冲突。",
    "提醒客户在安装阶段重点检查成品保护和设备调试情况。",
  ],
  completion: [
    "提醒客户整理竣工验收清单，逐项确认功能、观感和遗留问题。",
    "提醒客户保留水电图、设备说明书和售后联系方式，方便后续使用维护。",
  ],
};

export const PROJECT_STATUS_REMINDER_PROMPTS: Partial<Record<string, string[]>> = {
  designing: [
    "提醒客户尽快确认平面方案、主材方向和预算边界，减少进入施工后的变更成本。",
  ],
  proposal_confirmed: [
    "提醒客户在签约前复核平面方案和预算范围，避免合同后再大幅调整。",
  ],
  design_finalized: [
    "提醒客户确认施工图、节点图和主材清单已经定稿，开工前变更要重新评估工期。",
  ],
  pending_start: [
    "提醒客户确认开工日期、材料到场计划和现场交底时间。",
  ],
  started: [
    "提醒客户关注正式进场前的成品保护、物业报备和施工告知。",
  ],
  constructing: [
    "提醒客户关注当前施工节点的验收和材料到场衔接，避免因为确认不及时影响工期。",
  ],
  acceptance: [
    "提醒客户按验收清单逐项确认，并把遗留问题记录清楚后再安排收尾。",
  ],
};

export {
  Errors,
  SupabaseDB,
  authorizationService,
  aiGateway,
  constructionStageStatusService,
  decorationQaSuggestionCacheRepository,
  projectMemberService,
  systemSettingsService,
  isEmployeeOperableStatus,
  isProjectLogStageCode,
  isProjectStatus,
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
};
export type {
  DecorationQaRequestInput,
  DecorationQaStreamRequestInput,
  DecorationQaSuggestionQueryInput,
  Tables,
  AiMessageRole,
  ProjectConstructionStageStatus,
  ProjectLogStageCode,
};
