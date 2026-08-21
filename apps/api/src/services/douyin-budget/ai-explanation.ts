import {
  DouyinBudgetAiAnalysisSchema,
  DouyinBudgetAiExplanationResponseSchema,
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  type DouyinBudgetAiAnalysis,
  type DouyinBudgetAiExplanationResponse,
  type DouyinBudgetEstimateRequest,
  type DouyinBudgetEstimateResult,
} from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import {
  DouyinBudgetAiRepository,
  douyinBudgetAiRepository,
  type DouyinBudgetAiEstimateRecord,
  type DouyinBudgetAiLease,
  type DouyinBudgetAiScope,
} from '@/repositories/douyin-budget-ai';
import { aiGateway } from '@/services/ai-gateway';
import type {
  AiGatewayChatInput,
  AiGatewayChatResult,
} from '@/services/ai-gateway';
import type { JwtPayload } from '@/utils/jwt';

import {
  resolveDouyinBudgetContext,
  type DouyinBudgetContextRepository,
} from './context';

const AI_SCENE_CODE = 'douyin_budget_explanation';
const AI_TIMEOUT_MS = 30_000;
const AI_TEMPERATURE = 0.2;
const ProviderModelSchema = z.string().trim().min(1).max(100);

type CatalogEntry = Readonly<{ meaning: string; template: string }>;
type CatalogGroup = Readonly<Record<string, CatalogEntry>>;

const AI_EXPLANATION_CATALOG = {
  summary: {
    rules_estimate_overview: {
      meaning: '规则初算概览',
      template: '本结果基于规则初算，仅用于理解预算构成，不构成正式报价。',
    },
  },
  allocationAdvice: {
    prioritize_core_work: {
      meaning: '优先确认核心施工范围',
      template: '建议优先确认基础施工与隐蔽工程范围。',
    },
    confirm_material_scope: {
      meaning: '确认材料与施工边界',
      template: '建议结合材料范围与施工边界安排预算分配。',
    },
  },
  riskFactors: {
    site_conditions: {
      meaning: '关注现场条件',
      template: '现场墙体与水电现状可能影响施工方案。',
    },
    scope_changes: {
      meaning: '关注施工范围调整',
      template: '施工范围调整可能影响规则初算的适用性。',
    },
  },
  onsiteQuestions: {
    verify_structure: {
      meaning: '确认墙体与空间结构',
      template: '量房时请确认墙体与空间结构现状。',
    },
    verify_utilities: {
      meaning: '确认水电与隐蔽工程',
      template: '量房时请确认水电与隐蔽工程现状。',
    },
  },
} as const satisfies Readonly<Record<string, CatalogGroup>>;

type CatalogCode<T extends CatalogGroup> = Extract<keyof T, string>;

function catalogCodes<const T extends CatalogGroup>(
  catalog: T,
): CatalogCode<T>[] {
  return Object.keys(catalog) as CatalogCode<T>[];
}

function catalogTemplates<const T extends CatalogGroup>(
  catalog: T,
): Array<T[CatalogCode<T>]['template']> {
  return Object.values(catalog).map(
    (entry) => entry.template,
  ) as Array<T[CatalogCode<T>]['template']>;
}

function catalogPromptOptions<const T extends CatalogGroup>(
  catalog: T,
): Array<readonly [CatalogCode<T>, string]> {
  return Object.entries(catalog).map(([code, entry]) => [
    code as CatalogCode<T>,
    entry.meaning,
  ] as const);
}

const SummaryCodes = catalogCodes(AI_EXPLANATION_CATALOG.summary);
const AllocationAdviceCodes = catalogCodes(
  AI_EXPLANATION_CATALOG.allocationAdvice,
);
const RiskFactorCodes = catalogCodes(AI_EXPLANATION_CATALOG.riskFactors);
const OnsiteQuestionCodes = catalogCodes(
  AI_EXPLANATION_CATALOG.onsiteQuestions,
);
const SummaryCodeSchema = z.enum(SummaryCodes);
const AllocationAdviceCodeSchema = z.enum(AllocationAdviceCodes);
const RiskFactorCodeSchema = z.enum(RiskFactorCodes);
const OnsiteQuestionCodeSchema = z.enum(OnsiteQuestionCodes);

function uniqueCodeList<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

const AiExplanationSelectionSchema = z.strictObject({
  summary_code: SummaryCodeSchema,
  allocation_advice_codes: z
    .array(AllocationAdviceCodeSchema)
    .min(1)
    .max(AllocationAdviceCodes.length)
    .refine(uniqueCodeList),
  risk_factor_codes: z
    .array(RiskFactorCodeSchema)
    .min(1)
    .max(RiskFactorCodes.length)
    .refine(uniqueCodeList),
  onsite_question_codes: z
    .array(OnsiteQuestionCodeSchema)
    .min(1)
    .max(OnsiteQuestionCodes.length)
    .refine(uniqueCodeList),
});
type AiExplanationSelection = z.infer<typeof AiExplanationSelectionSchema>;

const StaticAiAnalysisSchema = z.strictObject({
  summary: z.enum(catalogTemplates(AI_EXPLANATION_CATALOG.summary)),
  allocation_advice: z
    .array(z.enum(catalogTemplates(AI_EXPLANATION_CATALOG.allocationAdvice)))
    .min(1)
    .max(AllocationAdviceCodes.length)
    .refine(uniqueCodeList),
  risk_factors: z
    .array(z.enum(catalogTemplates(AI_EXPLANATION_CATALOG.riskFactors)))
    .min(1)
    .max(RiskFactorCodes.length)
    .refine(uniqueCodeList),
  onsite_questions: z
    .array(z.enum(catalogTemplates(AI_EXPLANATION_CATALOG.onsiteQuestions)))
    .min(1)
    .max(OnsiteQuestionCodes.length)
    .refine(uniqueCodeList),
});

const SYSTEM_PROMPT = [
  '你是装修预算初算选择助手。',
  '只能返回允许的选择代码，不得返回自由文本或额外字段。',
  '不得新增、删除或修改服务端规则结果。',
  '只返回符合指定结构的 JSON 对象，不要输出 Markdown。',
].join('\n');

type AiRepositoryPort = Pick<
  DouyinBudgetAiRepository,
  'claimAiAnalysis' | 'completeAiAnalysis' | 'failAiAnalysis'
>;
type AiGatewayPort = {
  chat(
    input: AiGatewayChatInput,
  ): Promise<Pick<AiGatewayChatResult, 'content' | 'provider' | 'model'>>;
};
type Dependencies = {
  readonly contextRepository?: DouyinBudgetContextRepository;
  readonly budgetRepository?: AiRepositoryPort;
  readonly aiGateway?: AiGatewayPort;
};

export class DouyinBudgetAiExplanationService {
  private readonly contextRepository?: DouyinBudgetContextRepository;
  private readonly budgetRepository: AiRepositoryPort;
  private readonly gateway: AiGatewayPort;

  constructor(dependencies: Dependencies = {}) {
    this.contextRepository = dependencies.contextRepository;
    this.budgetRepository = dependencies.budgetRepository
      ?? douyinBudgetAiRepository;
    this.gateway = dependencies.aiGateway ?? aiGateway;
  }

  async generate(
    user: JwtPayload | undefined,
    estimateId: string,
    retry: boolean,
  ): Promise<DouyinBudgetAiExplanationResponse> {
    const context = await resolveDouyinBudgetContext(
      user,
      this.contextRepository,
    );
    const scope = {
      estimateId,
      tenantId: context.tenantId,
      installationId: context.installationId,
      subjectHash: context.subjectHash,
    };
    const claim = await this.budgetRepository.claimAiAnalysis({
      ...scope,
      retry,
    });
    if (claim.action === 'saved') return toPublicResponse(claim.estimate);

    const estimate = parsePublicEstimate(claim.estimate);
    const request = parsePublicRequest(claim.estimate.request_payload);

    let generated: {
      readonly analysis: DouyinBudgetAiAnalysis;
      readonly provider: string;
      readonly model: string;
    };
    try {
      const result = await this.gateway.chat({
        sceneCode: AI_SCENE_CODE,
        tenantId: context.tenantId,
        responseFormat: 'json_object',
        temperature: AI_TEMPERATURE,
        timeoutMs: AI_TIMEOUT_MS,
        source: 'douyin_miniapp',
        billable: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(request, estimate) },
        ],
      });
      generated = {
        analysis: parseSelectionAnalysis(result.content),
        provider: parseProviderModel(result.provider),
        model: parseProviderModel(result.model),
      };
    } catch (error) {
      return this.failClaim(scope, claim.lease, aiFailureCode(error));
    }

    const current = await this.budgetRepository.completeAiAnalysis({
      ...scope,
      lease: claim.lease,
      analysis: generated.analysis,
      provider: generated.provider,
      model: generated.model,
    });
    return toPublicResponse(current);
  }

  private async failClaim(
    scope: DouyinBudgetAiScope,
    lease: DouyinBudgetAiLease,
    errorCode: string,
  ): Promise<DouyinBudgetAiExplanationResponse> {
    const current = await this.budgetRepository.failAiAnalysis({
      ...scope,
      lease,
      errorCode,
    });
    return toPublicResponse(current);
  }
}

function parsePublicRequest(input: unknown): DouyinBudgetEstimateRequest {
  const parsed = DouyinBudgetEstimateRequestSchema.safeParse(input);
  if (!parsed.success) throw invalidPersistedResult();
  return parsed.data;
}

function parsePublicEstimate(
  record: DouyinBudgetAiEstimateRecord,
): DouyinBudgetEstimateResult {
  if (!isRecord(record.result_payload)) throw invalidPersistedResult();
  const parsed = DouyinBudgetEstimateResultSchema.safeParse({
    ...record.result_payload,
    id: record.id,
    estimate_no: record.estimate_no,
    ai_status: record.ai_status,
  });
  if (!parsed.success) throw invalidPersistedResult();
  return parsed.data;
}

function toPublicResponse(
  record: DouyinBudgetAiEstimateRecord,
): DouyinBudgetAiExplanationResponse {
  const parsed = DouyinBudgetAiExplanationResponseSchema.safeParse({
    estimate: parsePublicEstimate(record),
    ai_analysis: record.ai_status === 'succeeded'
      ? parsePersistedAiAnalysis(record.ai_analysis)
      : null,
  });
  if (!parsed.success) throw invalidPersistedResult();
  return parsed.data;
}

function parseSelectionAnalysis(content: string): DouyinBudgetAiAnalysis {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw invalidAiOutput();
  }
  const selection = AiExplanationSelectionSchema.safeParse(raw);
  if (!selection.success) throw invalidAiOutput();
  return mapSelectionToAnalysis(selection.data, invalidAiOutput);
}

function parsePersistedAiAnalysis(input: unknown): DouyinBudgetAiAnalysis {
  const allowed = StaticAiAnalysisSchema.safeParse(input);
  if (!allowed.success) throw invalidPersistedResult();
  const parsed = DouyinBudgetAiAnalysisSchema.safeParse(allowed.data);
  if (!parsed.success) throw invalidPersistedResult();
  return parsed.data;
}

function mapSelectionToAnalysis(
  selection: AiExplanationSelection,
  invalid: () => Error,
): DouyinBudgetAiAnalysis {
  const parsed = DouyinBudgetAiAnalysisSchema.safeParse({
    summary: AI_EXPLANATION_CATALOG.summary[selection.summary_code].template,
    allocation_advice: selection.allocation_advice_codes.map(
      (code) => AI_EXPLANATION_CATALOG.allocationAdvice[code].template,
    ),
    risk_factors: selection.risk_factor_codes.map(
      (code) => AI_EXPLANATION_CATALOG.riskFactors[code].template,
    ),
    onsite_questions: selection.onsite_question_codes.map(
      (code) => AI_EXPLANATION_CATALOG.onsiteQuestions[code].template,
    ),
  });
  if (!parsed.success) throw invalid();
  return parsed.data;
}

function parseProviderModel(value: string): string {
  const parsed = ProviderModelSchema.safeParse(value);
  if (!parsed.success) throw invalidAiOutput();
  return parsed.data;
}

function buildUserPrompt(
  request: DouyinBudgetEstimateRequest,
  estimate: DouyinBudgetEstimateResult,
): string {
  const summaryOptions = catalogPromptOptions(AI_EXPLANATION_CATALOG.summary);
  return JSON.stringify({
    instruction: '根据规则初算结果选择适用代码。',
    selection_schema: {
      summary_code: {
        allowed: summaryOptions.map(([code]) => code),
        meaning: summaryOptions.map(([, meaning]) => meaning).join(''),
      },
      allocation_advice_codes: {
        allowed: catalogPromptOptions(AI_EXPLANATION_CATALOG.allocationAdvice),
        rule: '至少选择一个且不得重复',
      },
      risk_factor_codes: {
        allowed: catalogPromptOptions(AI_EXPLANATION_CATALOG.riskFactors),
        rule: '至少选择一个且不得重复',
      },
      onsite_question_codes: {
        allowed: catalogPromptOptions(AI_EXPLANATION_CATALOG.onsiteQuestions),
        rule: '至少选择一个且不得重复',
      },
    },
    request: promptRequestSnapshot(request),
    estimate: promptEstimateSnapshot(estimate),
  });
}

function promptRequestSnapshot(request: DouyinBudgetEstimateRequest) {
  return {
    area: request.area,
    property_condition: request.property_condition,
    decoration_tier: request.decoration_tier,
    decoration_scope: request.decoration_scope,
    option_codes: request.option_codes,
  };
}

function promptEstimateSnapshot(estimate: DouyinBudgetEstimateResult) {
  return {
    minimum_total: estimate.minimum_total,
    maximum_total: estimate.maximum_total,
    categories: estimate.categories.map((category) => ({
      category_code: category.category_code,
      minimum_amount: category.minimum_amount,
      maximum_amount: category.maximum_amount,
    })),
  };
}

function aiFailureCode(error: unknown): string {
  if (isRecord(error) && error.code === 'DOUYIN_BUDGET_AI_INVALID_RESPONSE') {
    return 'DOUYIN_BUDGET_AI_INVALID_RESPONSE';
  }
  if (isRecord(error) && error.code === 'AI_GATEWAY_TIMEOUT') {
    return 'DOUYIN_BUDGET_AI_TIMEOUT';
  }
  return 'DOUYIN_BUDGET_AI_GATEWAY_FAILED';
}

function invalidAiOutput() {
  return Errors.business(
    500,
    '预算 AI 响应无效',
    'DOUYIN_BUDGET_AI_INVALID_RESPONSE',
  );
}

function invalidPersistedResult() {
  return Errors.business(
    500,
    '预算结果无效',
    'DOUYIN_BUDGET_PUBLIC_RESULT_INVALID',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

let defaultService: DouyinBudgetAiExplanationService | undefined;

export function getDouyinBudgetAiExplanationService():
  DouyinBudgetAiExplanationService {
  defaultService ??= new DouyinBudgetAiExplanationService();
  return defaultService;
}
