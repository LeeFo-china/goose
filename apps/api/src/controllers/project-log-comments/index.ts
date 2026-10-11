import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateProjectLogCommentSchema,
  type CreateProjectLogCommentInput,
  ProjectLogCommentsQuerySchema,
  type ProjectLogCommentsQueryType,
} from "@/schema/project-log-comments";
import { InternalCommentCreateSchema, InternalCommentParamsSchema, InternalCommentQuerySchema } from "@/schema/project-log-internal-comments";
import { projectLogInternalCommentsService } from "@/services/project-log-internal-comments";
import { ProjectCommentCreateSchema, ProjectCommentParamsSchema, ProjectCommentQuerySchema, ProjectCommentV2QuerySchema, ProjectCommentV2CreateSchema, ProjectCommentPreviewSchema, ProjectCommentPreviewParamsSchema } from "@/schema/project-log-project-comments";
import { projectLogProjectCommentsV2Service } from "@/services/project-log-project-comments-v2";
import { ProjectCommentAttachmentInitSchema, ProjectCommentAttachmentCompleteSchema } from "@/schema/project-log-comment-attachments";
import { projectLogCommentAttachmentsService } from "@/services/project-log-comment-attachments";
import { projectLogCommentPreviewsService } from "@/services/project-log-comment-previews";
import { projectLogCommunicationRollout } from "@/services/project-log-communication-rollout";
import { projectLogProjectCommentsService } from "@/services/project-log-project-comments";
import { projectLogCommentsService } from "@/services/project-log-comments";
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

const attachmentParamsSchema = z.object({
  logId: z.uuid("无效的日志ID"), commentId: z.uuid("无效的评论ID"), fileId: z.uuid("无效的文件ID"),
});
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
      ...getTenantServiceAuthOptions(request),
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
      ...getTenantServiceAuthOptions(request),
      tokenRoles: this.getTokenRoles(request),
      logId: log_id,
    });

    return ResponseHandler.success({
      list: comments,
    });
  }

  @Get("/project_logs/:logId/internal-comments")
  async listInternalComments(request: FastifyRequest) {
    const params = InternalCommentParamsSchema.safeParse(request.params);
    const query = InternalCommentQuerySchema.safeParse(request.query);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await projectLogInternalCommentsService.list({
      actor: request.user, logId: params.data.logId, ...query.data,
    }));
  }

  @Post("/project_logs/:logId/internal-comments")
  async createInternalComment(request: FastifyRequest) {
    const params = InternalCommentParamsSchema.safeParse(request.params);
    const body = InternalCommentCreateSchema.safeParse(request.body);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await projectLogInternalCommentsService.create({
      actor: request.user, logId: params.data.logId, payload: body.data,
    }));
  }

  @Get("/project_logs/:logId/project-comments")
  async listProjectComments(request: FastifyRequest) {
    const params = ProjectCommentParamsSchema.safeParse(request.params);
    const version = this.contractVersion(request.query);
    await projectLogCommunicationRollout.assertContract(version);
    if (version === 2) {
      const query = ProjectCommentV2QuerySchema.safeParse(request.query);
      if (!params.success) throw Errors.fromZod(params.error);
      if (!query.success) throw Errors.fromZod(query.error);
      return ResponseHandler.success(await projectLogProjectCommentsV2Service.list({
        actor: request.user, logId: params.data.logId, ...query.data,
      }));
    }
    const query = ProjectCommentQuerySchema.safeParse(request.query);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await projectLogProjectCommentsService.list({
      actor: request.user, logId: params.data.logId, ...query.data,
    }));
  }

  @Post("/project_logs/:logId/project-comments")
  async createProjectComment(request: FastifyRequest) {
    const params = ProjectCommentParamsSchema.safeParse(request.params);
    const version = this.contractVersion(request.body);
    await projectLogCommunicationRollout.assertContract(version);
    if (version === 2) {
      const body = ProjectCommentV2CreateSchema.safeParse(request.body);
      if (!params.success) throw Errors.fromZod(params.error);
      if (!body.success) throw Errors.fromZod(body.error);
      return ResponseHandler.success(await projectLogProjectCommentsV2Service.create({
        actor: request.user, logId: params.data.logId, payload: body.data,
      }));
    }
    const body = ProjectCommentCreateSchema.safeParse(request.body);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await projectLogProjectCommentsService.create({
      actor: request.user, logId: params.data.logId, payload: body.data,
    }));
  }

  @Post("/projects/:projectId/project-comment-previews", { tenantServiceAccess: "read" })
  async previewProjectComments(request: FastifyRequest) {
    const params = ProjectCommentPreviewParamsSchema.safeParse(request.params);
    const body = ProjectCommentPreviewSchema.safeParse(request.body);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await projectLogCommentPreviewsService.list({
      actor: request.user, projectId: params.data.projectId, payload: body.data,
    }));
  }

  @Post("/project_logs/:logId/project-comment-uploads/init")
  async initProjectCommentUpload(request: FastifyRequest) {
    const params = ProjectCommentParamsSchema.safeParse(request.params);
    const body = ProjectCommentAttachmentInitSchema.safeParse(request.body);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await projectLogCommentAttachmentsService.init({
      actor: request.user, logId: params.data.logId, payload: body.data,
    }));
  }

  @Post("/project_logs/:logId/project-comment-uploads/complete")
  async completeProjectCommentUpload(request: FastifyRequest) {
    const params = ProjectCommentParamsSchema.safeParse(request.params);
    const body = ProjectCommentAttachmentCompleteSchema.safeParse(request.body);
    if (!params.success) throw Errors.fromZod(params.error);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await projectLogCommentAttachmentsService.complete({
      actor: request.user, logId: params.data.logId, payload: body.data,
    }));
  }

  @Get("/project_logs/:logId/project-comments/:commentId/attachments/:fileId/url")
  async getProjectCommentAttachmentUrl(request: FastifyRequest) {
    const params = attachmentParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    return ResponseHandler.success(await projectLogCommentAttachmentsService.url({
      actor: request.user, ...params.data,
    }));
  }

  private contractVersion(value: unknown): 1 | 2 {
    if (!value || typeof value !== "object" || !("contract_version" in value)) return 1;
    if (value.contract_version === 2 || value.contract_version === "2") return 2;
    throw Errors.badRequest("不支持的评论接口版本");
  }

  private getTokenRoles(request: FastifyRequest) {
    return Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];
  }
}

export default new ProjectLogCommentsController();
