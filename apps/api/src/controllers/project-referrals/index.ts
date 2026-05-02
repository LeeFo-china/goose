import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateProjectReferralSchema,
  MarkProjectReferralPaidSchema,
  ProjectReferralListQuerySchema,
  ProjectReferralProjectQuerySchema,
  UpdateProjectReferralSchema,
} from "@/schema/project-referrals";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { projectReferralService } from "@/services/project-referrals";
import { authorizationService } from "@/services/authorization";

class ProjectReferralsController extends BaseController<
  typeof CreateProjectReferralSchema,
  typeof UpdateProjectReferralSchema
> {
  constructor() {
    super(
      "project_referrals",
      CreateProjectReferralSchema,
      UpdateProjectReferralSchema,
    );
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const result = ProjectReferralListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.listProjectReferrals(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectReferralService.getProjectReferralById(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.createProjectReferral(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.updateProjectReferral(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  };

  @Get("/project-referrals/project")
  async getByProject(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const result = ProjectReferralProjectQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.getProjectReferral(
      authContext,
      result.data.project_id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-referrals/:id/pay")
  async markPaid(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = MarkProjectReferralPaidSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.markReferralPaid(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }
}

export default new ProjectReferralsController();
