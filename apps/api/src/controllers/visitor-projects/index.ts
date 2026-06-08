import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  VisitorProjectListQuerySchema,
  VisitorProjectParamsSchema,
} from "@/schema/visitor-projects";
import { visitorProjectFollowService } from "@/services/visitor-project-follows";
import { Delete, Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { serializeProjectListItem } from "@/controllers/projects/list-serializer";
import type { FastifyRequest } from "fastify";

class VisitorProjectsController extends BaseController {
  constructor() {
    super("visitor_project_follows");
  }

  @Get("/visitor/projects")
  async listProjects(request: FastifyRequest) {
    const actor = this.getRequiredVerifiedVisitorActor(request);
    const queryResult = VisitorProjectListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await visitorProjectFollowService.listFollowedProjects({
      actor,
      query: queryResult.data,
    });

    return ResponseHandler.success({
      list: data.rows.map((item) => serializeProjectListItem(item)),
      pagination: data.pagination,
    });
  }

  @Get("/visitor/project-follows")
  async listProjectFollows(request: FastifyRequest) {
    return this.listProjects(request);
  }

  @Post("/visitor/projects/:id/follow")
  async followProject(request: FastifyRequest) {
    const actor = this.getRequiredVerifiedVisitorActor(request);
    const paramsResult = VisitorProjectParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorProjectFollowService.follow({
      projectId: paramsResult.data.id,
      actor,
    });
    return ResponseHandler.success({
      followed: data.followed_by_me,
      follow_count: data.follow_count,
    });
  }

  @Delete("/visitor/projects/:id/follow")
  async unfollowProject(request: FastifyRequest) {
    const actor = this.getRequiredVerifiedVisitorActor(request);
    const paramsResult = VisitorProjectParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorProjectFollowService.unfollow({
      projectId: paramsResult.data.id,
      actor,
    });
    return ResponseHandler.success({
      followed: data.followed_by_me,
      follow_count: data.follow_count,
    });
  }

  private getRequiredVerifiedVisitorActor(request: FastifyRequest) {
    const user = request.user;
    const verifiedPhone = user?.verified_phone;
    const visitorId = user?.visitor_id ?? user?.sub;

    if (!visitorId || !verifiedPhone) {
      throw Errors.unauthorized("请先完成手机号验证");
    }

    return {
      visitorId,
      verifiedPhone,
    };
  }
}

export default new VisitorProjectsController();
