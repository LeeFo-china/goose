import type { FastifyInstance, FastifyRequest } from "fastify";

import { Errors } from "@/errors/error-factory";
import {
  CreateDouyinBudgetEstimateSchema,
  DouyinBudgetEmptyInputSchema,
} from "@/schema/douyin-budget";
import {
  getDouyinBudgetEstimatesService,
  type DouyinBudgetEstimatesService,
} from "@/services/douyin-budget/estimates";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

type BudgetService = Pick<
  DouyinBudgetEstimatesService,
  "getConfig" | "createEstimate"
>;

export class DouyinBudgetController {
  constructor(private readonly configuredService?: BudgetService) {}

  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.get("/douyin-mini/budget-config", this.getConfig);
    fastify.post("/douyin-mini/budget-estimates", this.createEstimate);
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

  private service(): BudgetService {
    return this.configuredService ?? getDouyinBudgetEstimatesService();
  }
}

function parseEmpty(value: unknown): void {
  const result = DouyinBudgetEmptyInputSchema.safeParse(value ?? {});
  if (!result.success) throw Errors.fromZod(result.error);
}

export default new DouyinBudgetController();
