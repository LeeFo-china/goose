import { createHash, randomInt as cryptoRandomInt } from "node:crypto";
import { isIP } from "node:net";

import {
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
  type DouyinBudgetEstimateRequest,
  type DouyinBudgetEstimateResult,
  type DouyinBudgetPublicConfig,
} from "@gooes/domain";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DouyinBudgetRepository,
  douyinBudgetRepository,
  type DouyinBudgetInsertedEstimate,
} from "@/repositories/douyin-budget";
import {
  douyinMiniappContentRepository,
} from "@/repositories/douyin-miniapp-content";
import type { JwtPayload } from "@/utils/jwt";

import {
  calculateDouyinBudget,
  DouyinBudgetCalculationError,
  projectDouyinBudgetToPublicYuan,
  type DouyinBudgetPricingRules,
} from "./calculator";
import {
  resolveDouyinBudgetContext,
  type DouyinBudgetContextRepository,
} from "./context";
import {
  buildDouyinBudgetCalculationBasis,
  buildDouyinBudgetPublicConfig,
  douyinBudgetCategoryLabel,
  douyinBudgetPublicPricingMetadata,
  toDouyinBudgetCalculatorRules,
  type ActiveDouyinBudgetPricing,
} from "./pricing-rules";

type BudgetRepository = Pick<
  DouyinBudgetRepository,
  "loadActivePricing" | "createEstimateAtomic"
>;
type Dependencies = {
  readonly contextRepository?: DouyinBudgetContextRepository;
  readonly budgetRepository?: BudgetRepository;
  readonly now?: () => Date;
  readonly randomInt?: (maxExclusive: number) => number;
};
const ESTIMATE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const ESTIMATE_NUMBER_ATTEMPTS = 5;
const ESTIMATE_NUMBER_SPACE = 1_000_000;

export class DouyinBudgetEstimatesService {
  private readonly contextRepository: DouyinBudgetContextRepository;
  private readonly budgetRepository: BudgetRepository;
  private readonly now: () => Date;
  private readonly randomInt: (maxExclusive: number) => number;

  constructor(dependencies: Dependencies = {}) {
    this.contextRepository = dependencies.contextRepository
      ?? douyinMiniappContentRepository;
    this.budgetRepository = dependencies.budgetRepository
      ?? douyinBudgetRepository;
    this.now = dependencies.now ?? (() => new Date());
    this.randomInt = dependencies.randomInt ?? cryptoRandomInt;
  }

  async getConfig(user?: JwtPayload): Promise<DouyinBudgetPublicConfig> {
    const context = await resolveDouyinBudgetContext(
      user,
      this.contextRepository,
    );
    const pricing = requireActivePricing(await this.budgetRepository.loadActivePricing({
      tenantId: context.tenantId,
      now: this.now().toISOString(),
    }));
    return mapRuleErrors(() => buildDouyinBudgetPublicConfig(pricing));
  }

  async createEstimate(
    user: JwtPayload | undefined,
    rawInput: DouyinBudgetEstimateRequest,
    requestIp: string | null,
  ): Promise<DouyinBudgetEstimateResult> {
    const parsedInput = DouyinBudgetEstimateRequestSchema.safeParse(rawInput);
    if (!parsedInput.success) throw Errors.fromZod(parsedInput.error);
    const input = parsedInput.data;
    const context = await resolveDouyinBudgetContext(
      user,
      this.contextRepository,
    );
    const currentTime = this.now();
    const createdAt = currentTime.toISOString();
    const requestIpHash = hashRequestIp(context.tenantId, requestIp);
    const pricing = requireActivePricing(
      await this.budgetRepository.loadActivePricing({
        tenantId: context.tenantId,
        now: createdAt,
      }),
    );
    const rules = mapRuleErrors(() => toDouyinBudgetCalculatorRules(pricing));
    const projected = calculatePublicProjection(rules, input);
    const requestPayload = strictRequestSnapshot(input);
    const expiresAt = new Date(
      currentTime.getTime() + ESTIMATE_RETENTION_MS,
    ).toISOString();

    for (let attempt = 0; attempt < ESTIMATE_NUMBER_ATTEMPTS; attempt += 1) {
      const estimateNo = createEstimateNumber(currentTime, this.randomInt);
      const resultPayload = strictResultSnapshot(estimateNo, {
        minimum_total: projected.minimum_total,
        maximum_total: projected.maximum_total,
        categories: projected.categories.map((category) => ({
          ...category,
          label: douyinBudgetCategoryLabel(category.category_code),
        })),
        calculation_basis: buildDouyinBudgetCalculationBasis(input, rules),
        included_items: [...projected.included_items],
        excluded_items: [...projected.excluded_items],
        ...mapRuleErrors(() => douyinBudgetPublicPricingMetadata(pricing.version)),
        ai_status: "pending",
      });
      try {
        const inserted = await this.budgetRepository.createEstimateAtomic({
          tenantId: context.tenantId,
          installationId: context.installationId,
          subjectHash: context.subjectHash,
          requestIpHash,
          pricingVersionId: pricing.version.id,
          estimateNo,
          requestPayload,
          resultPayload,
          expiresAt,
        });
        assertInsertedEstimate(inserted, {
          estimateNo,
          tenantId: context.tenantId,
          installationId: context.installationId,
          pricingVersionId: pricing.version.id,
        });
        return parsePublicResult({
          id: inserted.id,
          estimate_no: inserted.estimate_no,
          ...resultPayload,
        });
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT"
        ) {
          continue;
        }
        throw error;
      }
    }
    throw Errors.business(
      503,
      "预算编号生成失败，请稍后再试",
      "DOUYIN_BUDGET_ESTIMATE_NUMBER_ALLOCATION_FAILED",
    );
  }

}

function calculatePublicProjection(
  rules: DouyinBudgetPricingRules,
  input: DouyinBudgetEstimateRequest,
) {
  return mapRuleErrors(() =>
    projectDouyinBudgetToPublicYuan(calculateDouyinBudget(rules, input))
  );
}

function mapRuleErrors<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof DouyinBudgetCalculationError) {
      throw Errors.business(422, error.message, error.code);
    }
    throw error;
  }
}

function strictRequestSnapshot(input: DouyinBudgetEstimateRequest) {
  return {
    area: input.area,
    property_condition: input.property_condition,
    decoration_tier: input.decoration_tier,
    decoration_scope: input.decoration_scope,
    ...(input.layout_code !== undefined ? { layout_code: input.layout_code } : {}),
    ...(input.layout !== undefined ? { layout: input.layout } : {}),
    ...(input.style_code !== undefined ? { style_code: input.style_code } : {}),
    ...(input.style !== undefined ? { style: input.style } : {}),
    option_codes: [...input.option_codes],
    ...(input.demand !== undefined ? { demand: input.demand } : {}),
  };
}

function parsePublicResult(input: unknown): DouyinBudgetEstimateResult {
  const parsed = DouyinBudgetEstimateResultSchema.safeParse(input);
  if (!parsed.success) {
    throw Errors.business(
      500,
      "预算结果无效",
      "DOUYIN_BUDGET_PUBLIC_RESULT_INVALID",
    );
  }
  return parsed.data;
}

function strictResultSnapshot(
  estimateNo: string,
  input: Omit<DouyinBudgetEstimateResult, "id" | "estimate_no">,
): Omit<DouyinBudgetEstimateResult, "id" | "estimate_no"> {
  const validationId = "00000000-0000-4000-8000-000000000000";
  const parsed = parsePublicResult({
    id: validationId,
    estimate_no: estimateNo,
    ...input,
  });
  const { id, estimate_no: parsedEstimateNo, ...snapshot } = parsed;
  if (id !== validationId || parsedEstimateNo !== estimateNo) {
    throw Errors.business(
      500,
      "预算结果无效",
      "DOUYIN_BUDGET_PUBLIC_RESULT_INVALID",
    );
  }
  return snapshot;
}

function hashRequestIp(tenantId: string, requestIp: string | null): string {
  const normalized = normalizeIp(requestIp);
  if (!normalized) {
    throw Errors.business(
      400,
      "客户端 IP 无效",
      "DOUYIN_BUDGET_CLIENT_IP_INVALID",
    );
  }
  return createHash("sha256").update(`${tenantId}:${normalized}`).digest("hex");
}

function normalizeIp(value: string | null): string | null {
  const candidate = value?.trim().toLowerCase();
  if (!candidate) return null;
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(candidate)?.[1];
  if (mappedIpv4 && isIP(mappedIpv4) === 4) return mappedIpv4;
  return isIP(candidate) === 0 ? null : candidate;
}

function createEstimateNumber(
  now: Date,
  random: (maxExclusive: number) => number,
): string {
  const suffix = random(ESTIMATE_NUMBER_SPACE);
  if (!Number.isSafeInteger(suffix) || suffix < 0 || suffix >= ESTIMATE_NUMBER_SPACE) {
    throw Errors.business(
      500,
      "预算编号生成器无效",
      "DOUYIN_BUDGET_ESTIMATE_NUMBER_GENERATOR_INVALID",
    );
  }
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `DYYS-${date}-${String(suffix).padStart(6, "0")}`;
}

function assertInsertedEstimate(
  inserted: DouyinBudgetInsertedEstimate,
  expected: {
    readonly estimateNo: string;
    readonly tenantId: string;
    readonly installationId: string;
    readonly pricingVersionId: string;
  },
): void {
  if (
    inserted.estimate_no !== expected.estimateNo ||
    inserted.tenant_id !== expected.tenantId ||
    inserted.douyin_miniapp_installation_id !== expected.installationId ||
    inserted.pricing_version_id !== expected.pricingVersionId ||
    inserted.ai_status !== "pending"
  ) {
    throw Errors.business(
      500,
      "预算数据响应无效",
      "DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID",
    );
  }
}

function requireActivePricing(
  value: ActiveDouyinBudgetPricing | null,
): ActiveDouyinBudgetPricing {
  if (!value) {
    throw Errors.business(
      404,
      "预算报价暂未配置",
      "DOUYIN_BUDGET_NOT_CONFIGURED",
    );
  }
  return value;
}

let defaultService: DouyinBudgetEstimatesService | undefined;

export function getDouyinBudgetEstimatesService(): DouyinBudgetEstimatesService {
  defaultService ??= new DouyinBudgetEstimatesService();
  return defaultService;
}
