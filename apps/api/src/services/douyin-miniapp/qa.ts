import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  DouyinMiniappContentRepository,
  douyinMiniappContentRepository,
  type DouyinContentInstallation,
} from "@/repositories/douyin-miniapp-content";
import type { DouyinMiniappQaRequest } from "@/schema/douyin-miniapp";
import { DouyinRuntimeConfigSchema } from "@/schema/platform-douyin-miniapps";
import {
  aiGateway,
  type AiGatewayChatInput,
  type AiGatewayChatResult,
} from "@/services/ai-gateway";
import type { JwtPayload } from "@/utils/jwt";

const AI_SCENE_CODE = "decoration_qa";
const AI_TIMEOUT_MS = 30_000;
const DISCLAIMER = "以上内容仅供装修沟通参考，具体方案以现场量房为准。";
const MAX_TEXT_LENGTH = 120;

const ANSWER_CATALOG = {
  assistant_intro: {
    meaning: "装修助手能力说明",
    points: [
      "我是装修问题助手，可以围绕预算、旧房翻新、局部改造和量房准备给出参考。",
      "如果问题不够明确，可以补充房屋现状、装修范围或想解决的具体问题。",
    ],
    question: "装修预算前要先准备哪些信息？",
  },
  budget_prepare: {
    meaning: "装修预算准备",
    points: [
      "预算沟通前建议先确认面积、房屋现状、装修范围和期望档位。",
      "同一面积下，旧房翻新、局部改造和材料档位都会影响预算区间。",
      "初步预算只适合做规划参考，正式方案需要结合现场量房确认。",
    ],
    question: "装修预算前要先准备哪些信息？",
  },
  old_house_check: {
    meaning: "旧房翻新现场检查",
    points: [
      "旧房翻新建议先看墙地面、水电线路、门窗和厨卫防水现状。",
      "如果计划局部改造，优先确认保留区域和需要拆改的边界。",
      "现场情况会影响施工方案，建议预约量房后再确认细节。",
    ],
    question: "旧房翻新要先看哪些地方？",
  },
  partial_plan: {
    meaning: "局部装修规划",
    points: [
      "局部装修建议先明确改造空间、保留区域和是否影响日常居住。",
      "厨房、卫生间和水电相关改造通常需要提前确认施工边界。",
      "如果不确定范围，可以先提交量房需求再让工作人员沟通。",
    ],
    question: "局部装修适合先确认什么？",
  },
  measurement_prepare: {
    meaning: "量房前准备",
    points: [
      "量房前可以准备户型、面积、期望风格和计划开工时间。",
      "如果有现房照片或重点问题，可在沟通时一并说明。",
      "量房后再确认设计方案、施工范围和正式报价会更准确。",
    ],
    question: "量房前需要准备什么？",
  },
} as const;

type AnswerCode = keyof typeof ANSWER_CATALOG;

const AnswerCodes = Object.keys(ANSWER_CATALOG) as AnswerCode[];
const AnswerCodeSchema = z.enum(AnswerCodes);
const SelectionSchema = z.strictObject({
  answer_code: AnswerCodeSchema,
  suggested_question_codes: z.array(AnswerCodeSchema).min(1)
    .max(2)
    .refine((values) => new Set(values).size === values.length),
});
type Selection = z.infer<typeof SelectionSchema>;
const AiAnswerSchema = z.strictObject({
  answer_points: z.array(z.string().trim().min(4).max(MAX_TEXT_LENGTH)).min(1).max(3),
  suggested_questions: z.array(z.string().trim().min(2).max(60)).min(1)
    .max(3)
    .refine((values) => new Set(values).size === values.length),
});
type AiAnswer = z.infer<typeof AiAnswerSchema>;

export type DouyinMiniappQaAnswer = {
  answer_points: string[];
  suggested_questions: string[];
  disclaimer: string;
};

type AiGatewayPort = {
  chat(
    input: AiGatewayChatInput,
  ): Promise<Pick<AiGatewayChatResult, "content" | "provider" | "model">>;
};
type ContextRepository = Pick<DouyinMiniappContentRepository, "findActiveInstallation">;

type Dependencies = {
  readonly contextRepository?: ContextRepository;
  readonly aiGateway?: AiGatewayPort;
};

export class DouyinMiniappQaService {
  private readonly contextRepository: ContextRepository;
  private readonly gateway: AiGatewayPort;

  constructor(dependencies: Dependencies = {}) {
    this.contextRepository = dependencies.contextRepository ?? douyinMiniappContentRepository;
    this.gateway = dependencies.aiGateway ?? aiGateway;
  }

  async ask(
    user: JwtPayload | undefined,
    input: DouyinMiniappQaRequest,
  ): Promise<DouyinMiniappQaAnswer> {
    const tenantId = await this.requireActiveContext(user);
    ensureSafeQuestion(input.question);

    try {
      const result = await this.gateway.chat({
        sceneCode: AI_SCENE_CODE,
        tenantId,
        responseFormat: "json_object",
        timeoutMs: AI_TIMEOUT_MS,
        source: "douyin_miniapp",
        billable: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(input.question) },
        ],
      });
      return parseAnswer(result.content) ?? fallbackAnswer(input.question);
    } catch {
      return fallbackAnswer(input.question);
    }
  }

  private async requireActiveContext(user: JwtPayload | undefined): Promise<string> {
    const session = requireDouyinSession(user);
    const installation = await this.contextRepository.findActiveInstallation({
      installationId: session.douyin_installation_id,
      tenantId: session.tenant_id,
      appId: session.douyin_app_id,
    });
    if (!isActiveInstallation(session, installation)) {
      throw Errors.business(
        403,
        "抖音小程序服务暂不可用",
        "DOUYIN_MINIAPP_DISABLED",
      );
    }
    const runtime = DouyinRuntimeConfigSchema.safeParse(installation.runtime_config);
    if (!runtime.success) {
      throw Errors.business(
        403,
        "抖音小程序服务暂不可用",
        "DOUYIN_MINIAPP_DISABLED",
      );
    }
    return session.tenant_id;
  }
}

const SYSTEM_PROMPT = [
  "你是装修问题助手。",
  "必须直接回答用户当前问题，不要套用固定问题或预设问法。",
  "只给装修沟通参考，不做报价承诺、合同结论或法律结论。",
  "不要输出手机号、微信、详细地址、门牌号或联系引导。",
  "只返回 JSON 对象，不要输出 Markdown。",
].join("\n");

function buildPrompt(question: string): string {
  return JSON.stringify({
    instruction: "直接回答用户当前问题。若问题不是装修相关或语义不完整，请说明你只能回答装修问题，并请用户补充房屋现状、装修范围或想解决的具体问题。",
    question,
    schema: {
      answer_points: "1 到 3 条中文短句，每条不超过 120 字，必须围绕用户当前问题",
      suggested_questions: "1 到 3 个可继续追问的装修问题，每个不超过 60 字，不得重复",
    },
  });
}

function parseAnswer(content: string): DouyinMiniappQaAnswer | null {
  try {
    const parsed = AiAnswerSchema.safeParse(JSON.parse(content));
    if (!parsed.success || hasUnsafeText(parsed.data)) return null;
    return mapAnswer(parsed.data);
  } catch {
    return null;
  }
}

function fallbackSelection(question: string): Selection {
  if (/你是|你能|做什么|助手|功能/.test(question)) {
    return {
      answer_code: "assistant_intro",
      suggested_question_codes: ["budget_prepare", "partial_plan"],
    };
  }
  if (/旧房|翻新|二手房|老房/.test(question)) {
    return {
      answer_code: "old_house_check",
      suggested_question_codes: ["budget_prepare", "measurement_prepare"],
    };
  }
  if (/局部|厨房|卫生间|厨卫|水电/.test(question)) {
    return {
      answer_code: "partial_plan",
      suggested_question_codes: ["budget_prepare", "measurement_prepare"],
    };
  }
  if (/量房|上门|测量/.test(question)) {
    return {
      answer_code: "measurement_prepare",
      suggested_question_codes: ["budget_prepare", "partial_plan"],
    };
  }
  return {
    answer_code: "budget_prepare",
    suggested_question_codes: ["measurement_prepare", "partial_plan"],
  };
}

function fallbackAnswer(question: string): DouyinMiniappQaAnswer {
  return mapSelection(fallbackSelection(question));
}

function mapSelection(selection: Selection): DouyinMiniappQaAnswer {
  if (selection.answer_code === "assistant_intro") {
    return {
      answer_points: [
        "我是装修问题助手，可以围绕预算、旧房翻新、局部改造和量房准备给出参考。",
        "如果问题不够明确，可以补充房屋现状、装修范围或想解决的具体问题。",
      ],
      suggested_questions: selection.suggested_question_codes.map(
        (code) => ANSWER_CATALOG[code].question,
      ),
      disclaimer: DISCLAIMER,
    };
  }
  return {
    answer_points: [...ANSWER_CATALOG[selection.answer_code].points],
    suggested_questions: selection.suggested_question_codes.map(
      (code) => ANSWER_CATALOG[code].question,
    ),
    disclaimer: DISCLAIMER,
  };
}

function mapAnswer(answer: AiAnswer): DouyinMiniappQaAnswer {
  return {
    answer_points: [...answer.answer_points],
    suggested_questions: [...answer.suggested_questions],
    disclaimer: DISCLAIMER,
  };
}

function hasUnsafeText(answer: AiAnswer): boolean {
  return [...answer.answer_points, ...answer.suggested_questions].some((text) =>
    hasPhone(text)
    || hasAddress(text)
    || hasContactMarker(text)
    || hasMoneyCommitment(text),
  );
}

type RequiredDouyinSession = {
  tenant_id: string;
  douyin_installation_id: string;
  douyin_app_id: string;
};

function requireDouyinSession(user: JwtPayload | undefined): RequiredDouyinSession {
  if (
    user?.token_type !== "douyin_miniapp"
    || !user.tenant_id
    || !user.douyin_installation_id
    || !user.douyin_app_id
  ) {
    throw Errors.unauthorized("请使用抖音小程序会话");
  }
  return {
    tenant_id: user.tenant_id,
    douyin_installation_id: user.douyin_installation_id,
    douyin_app_id: user.douyin_app_id,
  };
}

function isActiveInstallation(
  session: RequiredDouyinSession,
  installation: DouyinContentInstallation | null,
): installation is DouyinContentInstallation {
  return Boolean(
    installation
      && installation.id === session.douyin_installation_id
      && installation.tenant_id === session.tenant_id
      && installation.authorizer_appid === session.douyin_app_id
      && installation.authorization_status === "active"
      && installation.tenant.id === session.tenant_id
      && installation.tenant.status === "active",
  );
}

function ensureSafeQuestion(question: string): void {
  if (hasPhone(question) || hasAddress(question) || hasContactMarker(question)) {
    throw Errors.business(
      400,
      "请勿在问题中填写手机号、门牌号或微信等个人联系方式",
      "DOUYIN_QA_INPUT_UNSAFE",
    );
  }
}

function hasPhone(value: string): boolean {
  return /1[3-9][0-9][\s\-·　]?[0-9]{4}[\s\-·　]?[0-9]{4}/.test(value);
}

function hasAddress(value: string): boolean {
  return /[\u4e00-\u9fa5]{2,}(?:大道|路|街|巷|弄)[0-9一二三四五六七八九十百]+(?:号|号楼|栋|幢|单元|室)?/.test(value);
}

function hasContactMarker(value: string): boolean {
  return /(?:微信|加微|联系方式|手机号|联系我|电话\s*[:：]?\s*1[3-9])/.test(value);
}

function hasMoneyCommitment(value: string): boolean {
  return /(?:报价|价格|费用|预算|收费|单价)[^。；，,]{0,12}(?:[0-9一二三四五六七八九十百千万]+)\s*(?:元|万|块)/.test(value);
}

let defaultService: DouyinMiniappQaService | undefined;

export function getDouyinMiniappQaService(): DouyinMiniappQaService {
  defaultService ??= new DouyinMiniappQaService();
  return defaultService;
}
