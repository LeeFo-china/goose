import type { FastifyRequest } from "fastify";
import type { z } from "zod";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinBudgetCreateDraftSchema,
  TenantDouyinBudgetListQuerySchema,
  TenantDouyinBudgetOptimisticActionSchema,
  TenantDouyinBudgetReplaceItemsSchema,
  TenantDouyinBudgetUpdateFactorsSchema,
  TenantDouyinBudgetVersionParamsSchema,
} from "@/schema/tenant-douyin-budget";
import {
  tenantDouyinBudgetService,
  type TenantDouyinBudgetService,
} from "@/services/tenant-douyin-budget";
import { Get, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

type ServicePort = Pick<TenantDouyinBudgetService,
  "list" | "createDraft" | "replaceItems" | "updateFactors" |
  "activate" | "archive">;

export class TenantDouyinBudgetController extends TenantBaseController {
  constructor(private readonly service: ServicePort = tenantDouyinBudgetService) {
    super("tenant-douyin-budget");
  }

  @Get("/tenant/douyin-miniapp/budget/pricing-versions")
  async listVersions(request: FastifyRequest) {
    const query = parse(TenantDouyinBudgetListQuerySchema, request.query || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.list(authContext, query));
  }

  @Post("/tenant/douyin-miniapp/budget/pricing-versions")
  async createDraft(request: FastifyRequest) {
    const body = parse(TenantDouyinBudgetCreateDraftSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.createDraft(authContext, body),
    );
  }

  @Put("/tenant/douyin-miniapp/budget/pricing-versions/:id/items")
  async replaceItems(request: FastifyRequest) {
    const params = parse(
      TenantDouyinBudgetVersionParamsSchema,
      request.params || {},
    );
    const body = parse(TenantDouyinBudgetReplaceItemsSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.replaceItems(authContext, params.id, body),
    );
  }

  @Put("/tenant/douyin-miniapp/budget/pricing-versions/:id/factors")
  async updateFactors(request: FastifyRequest) {
    const params = parse(
      TenantDouyinBudgetVersionParamsSchema,
      request.params || {},
    );
    const body = parse(
      TenantDouyinBudgetUpdateFactorsSchema,
      request.body || {},
    );
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.updateFactors(authContext, params.id, body),
    );
  }

  @Post("/tenant/douyin-miniapp/budget/pricing-versions/:id/activate")
  async activate(request: FastifyRequest) {
    const { params, body } = parseAction(request);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.activate(authContext, params.id, body),
    );
  }

  @Post("/tenant/douyin-miniapp/budget/pricing-versions/:id/archive")
  async archive(request: FastifyRequest) {
    const { params, body } = parseAction(request);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.archive(authContext, params.id, body),
    );
  }
}

function parseAction(request: FastifyRequest) {
  return {
    params: parse(TenantDouyinBudgetVersionParamsSchema, request.params || {}),
    body: parse(TenantDouyinBudgetOptimisticActionSchema, request.body || {}),
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export default new TenantDouyinBudgetController();
