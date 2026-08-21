import type { FastifyInstance, FastifyRequest } from "fastify";

import { Errors } from "@/errors/error-factory";
import {
  CreateDouyinBudgetEstimateSchema,
  DouyinBudgetAiAnalysisBodySchema,
  DouyinBudgetAiAnalysisParamsSchema,
  DouyinBudgetEmptyInputSchema,
} from "@/schema/douyin-budget";
import {
  getDouyinBudgetEstimatesService,
  type DouyinBudgetEstimatesService,
} from "@/services/douyin-budget/estimates";
import {
  getDouyinBudgetAiExplanationService,
  type DouyinBudgetAiExplanationService,
} from "@/services/douyin-budget/ai-explanation";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

type BudgetService = Pick<
  DouyinBudgetEstimatesService,
  "getConfig" | "createEstimate"
> & {
  generateAiAnalysis: DouyinBudgetAiExplanationService["generate"];
};

export class DouyinBudgetController {
  constructor(private readonly configuredService?: BudgetService) {}

  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.get("/douyin-mini/budget-config", this.getConfig);
    fastify.post("/douyin-mini/budget-estimates", this.createEstimate);
    fastify.post(
      "/douyin-mini/budget-estimates/:id/ai-analysis",
      this.generateAiAnalysis,
    );
  }

  getConfig = async (request: FastifyRequest) => {
    parseEmpty(request.params);
    parseEmpty(request.query);
    return ResponseHandler.success(
      await this.service().getConfig(request.user),
    );
  };

  createEstimate = async (request: FastifyRequest) => {
    parseEmpty(request.params);
    parseEmpty(request.query);
    const input = CreateDouyinBudgetEstimateSchema.safeParse(request.body);
    if (!input.success) throw Errors.fromZod(input.error);
    const requestIp = resolveTrustedClientIp(request);
    return ResponseHandler.success(
      await this.service().createEstimate(request.user, input.data, requestIp),
    );
  };

  generateAiAnalysis = async (request: FastifyRequest) => {
    parseEmpty(request.query);
    const params = DouyinBudgetAiAnalysisParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const rawBody = request.body === undefined ? {} : request.body;
    const body = DouyinBudgetAiAnalysisBodySchema.safeParse(rawBody);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(
      await this.service().generateAiAnalysis(
        request.user,
        params.data.id,
        body.data.retry,
      ),
    );
  };

  private service(): BudgetService {
    if (this.configuredService) return this.configuredService;
    return {
      getConfig: (...args) => getDouyinBudgetEstimatesService().getConfig(...args),
      createEstimate: (...args) =>
        getDouyinBudgetEstimatesService().createEstimate(...args),
      generateAiAnalysis: (...args) =>
        getDouyinBudgetAiExplanationService().generate(...args),
    };
  }
}

function parseEmpty(value: unknown): void {
  const result = DouyinBudgetEmptyInputSchema.safeParse(value ?? {});
  if (!result.success) throw Errors.fromZod(result.error);
}

export default new DouyinBudgetController();
