import type { FastifyRequest } from "fastify";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinLeadAssigneeCandidatesQuerySchema,
  TenantDouyinLeadAssignSchema,
  TenantDouyinLeadConvertSchema,
  TenantDouyinLeadEmptyQuerySchema,
  TenantDouyinLeadFollowUpListQuerySchema,
  TenantDouyinLeadFollowUpSchema,
  TenantDouyinLeadListQuerySchema,
  TenantDouyinLeadMarkInvalidSchema,
  TenantDouyinLeadParamsSchema,
} from "@/schema/tenant-douyin-leads";
import {
  tenantDouyinLeadsService,
  type TenantDouyinLeadsService,
} from "@/services/tenant-douyin-leads";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

type ServicePort = Pick<TenantDouyinLeadsService,
  | "list" | "listAssigneeCandidates" | "getDetail" | "listFollowUps" | "assign"
  | "appendFollowUp" | "convert" | "markInvalid">;

export class TenantDouyinLeadsController extends TenantBaseController {
  constructor(
    private readonly service: ServicePort = tenantDouyinLeadsService,
  ) {
    super("tenant-douyin-leads");
  }

  @Get("/tenant/douyin-miniapp/leads")
  async listLeads(request: FastifyRequest) {
    const query = parsePart(TenantDouyinLeadListQuerySchema, request.query || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.list(authContext, query));
  }

  @Get("/tenant/douyin-miniapp/leads/assignee-candidates")
  async listAssigneeCandidates(request: FastifyRequest) {
    const query = parsePart(
      TenantDouyinLeadAssigneeCandidatesQuerySchema,
      request.query || {},
    );
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.listAssigneeCandidates(authContext, query),
    );
  }

  @Get("/tenant/douyin-miniapp/leads/:id")
  async getDetail(request: FastifyRequest) {
    const params = parsePart(TenantDouyinLeadParamsSchema, request.params || {});
    parsePart(TenantDouyinLeadEmptyQuerySchema, request.query || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.getDetail(authContext, params.id),
    );
  }

  @Get("/tenant/douyin-miniapp/leads/:id/follow-ups")
  async listFollowUps(request: FastifyRequest) {
    const params = parsePart(TenantDouyinLeadParamsSchema, request.params || {});
    const query = parsePart(
      TenantDouyinLeadFollowUpListQuerySchema,
      request.query || {},
    );
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.listFollowUps(authContext, params.id, query),
    );
  }

  @Post("/tenant/douyin-miniapp/leads/:id/assign")
  async assign(request: FastifyRequest) {
    const params = parsePart(TenantDouyinLeadParamsSchema, request.params || {});
    const body = parsePart(TenantDouyinLeadAssignSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.assign(authContext, params.id, body),
    );
  }

  @Post("/tenant/douyin-miniapp/leads/:id/follow-ups")
  async appendFollowUp(request: FastifyRequest) {
    const params = parsePart(TenantDouyinLeadParamsSchema, request.params || {});
    const body = parsePart(TenantDouyinLeadFollowUpSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.appendFollowUp(authContext, params.id, body),
    );
  }

  @Post("/tenant/douyin-miniapp/leads/:id/convert-customer")
  async convert(request: FastifyRequest) {
    const params = parsePart(TenantDouyinLeadParamsSchema, request.params || {});
    const body = parsePart(TenantDouyinLeadConvertSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.convert(authContext, params.id, body),
    );
  }

  @Post("/tenant/douyin-miniapp/leads/:id/mark-invalid")
  async markInvalid(request: FastifyRequest) {
    const params = parsePart(TenantDouyinLeadParamsSchema, request.params || {});
    const body = parsePart(TenantDouyinLeadMarkInvalidSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.markInvalid(authContext, params.id, body),
    );
  }
}

function parsePart<T>(schema: { safeParse(input: unknown):
  { success: true; data: T } | { success: false; error: Parameters<
    typeof Errors.fromZod>[0] } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export default new TenantDouyinLeadsController();
