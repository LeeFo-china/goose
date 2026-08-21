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
const PhonePattern =
  /(?<!\d)(?:(?:\+?86[- \u3000]?)?1[3-9]\d(?:[- \u3000]?\d{4}){2}|(?:0\d{2,3}[- \u3000]?)?\d{7,8})(?!\d)/g;
const RoadAddressPattern = new RegExp(
  String.raw`([\p{Script=Han}]{2,20})(大道|路|街|巷|弄)[ \u3000]*\d{1,6}(?![ \u3000]*(?:[VvＶｖ]|伏|版))(?:[ \u3000]*(?:号楼|号|栋|幢|单元|室|楼)|(?=[ \u3000]*(?:$|[，,。；;、!?！？])))`,
  'gu',
);
const NonAddressRoadCompoundPattern = /(?:电路|思路)$/u;
const StandaloneDetailedAddressPattern = new RegExp([
  String.raw`[\p{Script=Han}]{2,20}(?:小区|村)(?=$|[\s，,。；;、]|\d)`,
  String.raw`门牌(?:号)?\s*\d{1,6}`,
  String.raw`(?<!\d)\d{1,6}(?:号楼|号|栋|幢|单元|楼)(?![A-Za-z])`,
  String.raw`(?<!\d)\d{3,6}室(?!\d*[厅房])`,
].join('|'), 'u');
const ProviderModelSchema = z.string().trim().min(1).max(100);

const SYSTEM_PROMPT = [
  '你是装修预算初算解释助手。',
  '只能解释服务端已经计算完成的规则结果，不得新增、删除或修改任何金额。',
  '不得把初算描述为正式报价，不得承诺最终价格、工期、材料或施工结果。',
  '不得返回联系方式或详细地址。',
  '只返回符合指定结构的 JSON 对象，不要输出 Markdown 或额外字段。',
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
        analysis: parseAiAnalysis(result.content),
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

function parseAiAnalysis(content: string): DouyinBudgetAiAnalysis {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw invalidAiOutput();
  }
  const parsed = DouyinBudgetAiAnalysisSchema.safeParse(raw);
  if (!parsed.success) throw invalidAiOutput();
  return sanitizeAiAnalysis(parsed.data, invalidAiOutput);
}

function parsePersistedAiAnalysis(input: unknown): DouyinBudgetAiAnalysis {
  const parsed = DouyinBudgetAiAnalysisSchema.safeParse(input);
  if (!parsed.success) throw invalidPersistedResult();
  return sanitizeAiAnalysis(parsed.data, invalidPersistedResult);
}

function sanitizeAiAnalysis(
  analysis: DouyinBudgetAiAnalysis,
  invalid: () => Error,
): DouyinBudgetAiAnalysis {
  const sanitized = DouyinBudgetAiAnalysisSchema.safeParse({
    summary: sanitizeText(analysis.summary),
    allocation_advice: sanitizeTextList(analysis.allocation_advice),
    risk_factors: sanitizeTextList(analysis.risk_factors),
    onsite_questions: sanitizeTextList(analysis.onsite_questions),
  });
  if (!sanitized.success) throw invalid();
  return sanitized.data;
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
  return JSON.stringify({
    instruction: '解释规则预算结果，给出分配建议、风险因素和量房问题。',
    output_schema: {
      summary: '不超过1000字的规则结果说明，不得给出新的金额',
      allocation_advice: ['每项不超过300字，不得给出新的金额'],
      risk_factors: ['每项不超过300字，不得作价格或结果承诺'],
      onsite_questions: ['每项不超过300字，仅列量房需确认的问题'],
    },
    request: promptRequestSnapshot(request),
    estimate: promptEstimateSnapshot(estimate),
  });
}

function promptRequestSnapshot(request: DouyinBudgetEstimateRequest) {
  return {
    area: request.area,
    property_condition: sanitizeText(request.property_condition),
    decoration_tier: sanitizeText(request.decoration_tier),
    decoration_scope: sanitizeText(request.decoration_scope),
    ...(request.layout !== undefined
      ? { layout: sanitizeText(request.layout) }
      : {}),
    ...(request.style !== undefined
      ? { style: sanitizeText(request.style) }
      : {}),
    option_codes: sanitizeTextList(request.option_codes),
    ...(request.demand !== undefined
      ? { demand: sanitizeText(request.demand) }
      : {}),
  };
}

function promptEstimateSnapshot(estimate: DouyinBudgetEstimateResult) {
  return {
    minimum_total: estimate.minimum_total,
    maximum_total: estimate.maximum_total,
    categories: estimate.categories.map((category) => ({
      category_code: sanitizeText(category.category_code),
      label: sanitizeText(category.label),
      minimum_amount: category.minimum_amount,
      maximum_amount: category.maximum_amount,
    })),
    calculation_basis: sanitizeTextList(estimate.calculation_basis),
    included_items: sanitizeTextList(estimate.included_items),
    excluded_items: sanitizeTextList(estimate.excluded_items),
    pricing_version: sanitizeText(estimate.pricing_version),
    pricing_effective_from: sanitizeText(estimate.pricing_effective_from),
    pricing_effective_to: estimate.pricing_effective_to === null
      ? null
      : sanitizeText(estimate.pricing_effective_to),
    disclaimer: sanitizeText(estimate.disclaimer),
  };
}

function sanitizeTextList(values: readonly string[]): string[] {
  return values.map(sanitizeText);
}

function sanitizeText(value: string): string {
  if (containsDetailedAddress(value)) return '[已脱敏]';
  return value.replace(PhonePattern, '[已脱敏]');
}

function containsDetailedAddress(value: string): boolean {
  if (StandaloneDetailedAddressPattern.test(value)) return true;
  for (const match of value.matchAll(RoadAddressPattern)) {
    const roadName = match[1] ?? '';
    const roadSuffix = match[2] ?? '';
    if (!NonAddressRoadCompoundPattern.test(`${roadName}${roadSuffix}`)) {
      return true;
    }
  }
  return false;
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
