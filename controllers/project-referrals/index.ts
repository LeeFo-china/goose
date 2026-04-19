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

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = ProjectReferralListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.listProjectReferrals(result.data);
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectReferralService.getProjectReferralById(
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.createProjectReferral(result.data);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.updateProjectReferral(
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  };

  @Get("/project-referrals/project")
  async getByProject(request: FastifyRequest, reply: FastifyReply) {
    const result = ProjectReferralProjectQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.getProjectReferral(
      result.data.project_id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-referrals/:id/pay")
  async markPaid(request: FastifyRequest, reply: FastifyReply) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = MarkProjectReferralPaidSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectReferralService.markReferralPaid(
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }
}

export default new ProjectReferralsController();
