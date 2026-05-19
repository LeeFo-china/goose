import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateProjectLogCommentSchema,
  type CreateProjectLogCommentInput,
  ProjectLogCommentsQuerySchema,
  type ProjectLogCommentsQueryType,
} from "@/schema/project-log-comments";
import { projectLogCommentsService } from "@/services/project-log-comments";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class ProjectLogCommentsController extends BaseController {
  constructor() {
    super("project_log_comments");
  }

  @Post("/project_log_comments")
  async createComment(request: FastifyRequest, reply: FastifyReply) {
    const result = CreateProjectLogCommentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const payload: CreateProjectLogCommentInput = result.data;
    const item = await projectLogCommentsService.createComment({
      authUserId: request.user?.sub,
      tokenRoles: this.getTokenRoles(request),
      payload,
    });

    return ResponseHandler.success(item);
  }

  @Get("/project_log_comments")
  async listComments(request: FastifyRequest, reply: FastifyReply) {
    const result = ProjectLogCommentsQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const { log_id }: ProjectLogCommentsQueryType = result.data;
    const comments = await projectLogCommentsService.listComments({
      authUserId: request.user?.sub,
      tokenRoles: this.getTokenRoles(request),
      logId: log_id,
    });

    return ResponseHandler.success({
      list: comments,
    });
  }

  private getTokenRoles(request: FastifyRequest) {
    return Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];
  }
}

export default new ProjectLogCommentsController();
