import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformPartnerCreateSchema,
  PlatformPartnerIdParamSchema,
  PlatformPartnerInviteCodeParamSchema,
  PlatformPartnerInviteCodeCreateSchema,
  PlatformPartnerListQuerySchema,
  PlatformPartnerStatusUpdateSchema,
  PlatformPartnerUpdateSchema,
  TenantPartnerBindingCreateSchema,
  TenantPartnerInviteBindingCreateSchema,
  TenantPartnerBindingListQuerySchema,
} from "@/schema/platform-partners";
import { platformPartnersService } from "@/services/platform-partners";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformPartnersController extends PlatformBaseController {
  constructor() {
    super("platform-partners");
  }

  @Get("/partner-onboarding/invite-codes/:code")
  async resolveInviteCode(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = PlatformPartnerInviteCodeParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformPartnersService.resolveInviteCode(
      paramsResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/partner-onboarding/tenant-binding")
  async bindTenantByInviteCode(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const bodyResult = TenantPartnerInviteBindingCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnersService.bindTenantByInviteCode(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partners")
  async listPartners(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformPartnerListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnersService.listPartners(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partners")
  async createPartner(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = PlatformPartnerCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnersService.createPartner(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partners/levels")
  async listLevels(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const data = await platformPartnersService.listLevels(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/partners/:id")
  async getPartner(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformPartnersService.getPartner(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/partners/:id")
  async updatePartner(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformPartnerUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnersService.updatePartner(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/partners/:id/status")
  async updatePartnerStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformPartnerStatusUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnersService.updatePartnerStatus(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partners/:id/invite-codes")
  async createInviteCode(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformPartnerInviteCodeCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnersService.createInviteCode(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partners/:id/invite-codes")
  async listInviteCodes(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformPartnersService.listInviteCodes(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partner-bindings")
  async listTenantBindings(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = TenantPartnerBindingListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnersService.listTenantBindings(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-bindings")
  async createTenantBinding(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = TenantPartnerBindingCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnersService.createTenantBinding(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformPartnersController();
