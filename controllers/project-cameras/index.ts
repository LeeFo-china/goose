import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import {
  CreateProjectCameraSchema,
  ProjectCameraDetailParamsSchema,
  ProjectCameraParamsSchema,
  ProjectCameraPlayParamsBodySchema,
  UpdateProjectCameraSchema,
} from "@/schema/project-cameras";
import { projectCameraService } from "@/services/project-cameras";

class ProjectCameraController extends BaseController {
  constructor() {
    super("project_cameras");
  }

  private getRequestMeta(request: FastifyRequest) {
    return {
      ip: request.ip,
      userAgent: request.headers["user-agent"] || null,
    };
  }

  @Get("/projects/:project_id/cameras")
  async listProjectCameras(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = ProjectCameraParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await projectCameraService.listProjectCameras({
      authUserId: request.user?.sub,
      projectId: paramsResult.data.project_id,
      meta: this.getRequestMeta(request),
    });

    return ResponseHandler.success(result);
  }

  @Post("/projects/:project_id/cameras")
  async createProjectCamera(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = ProjectCameraParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateProjectCameraSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await projectCameraService.createProjectCamera({
      authUserId: request.user?.sub,
      projectId: paramsResult.data.project_id,
      payload: bodyResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Patch("/projects/:project_id/cameras/:camera_id")
  async updateProjectCamera(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = ProjectCameraDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateProjectCameraSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await projectCameraService.updateProjectCamera({
      authUserId: request.user?.sub,
      projectId: paramsResult.data.project_id,
      cameraId: paramsResult.data.camera_id,
      payload: bodyResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Delete("/projects/:project_id/cameras/:camera_id")
  async deleteProjectCamera(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = ProjectCameraDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await projectCameraService.deleteProjectCamera({
      authUserId: request.user?.sub,
      projectId: paramsResult.data.project_id,
      cameraId: paramsResult.data.camera_id,
    });

    return ResponseHandler.success(result);
  }

  @Post("/projects/:project_id/cameras/:camera_id/play-params")
  async getProjectCameraPlayParams(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = ProjectCameraDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ProjectCameraPlayParamsBodySchema.safeParse(
      request.body ?? {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await projectCameraService.getPlayParams({
      authUserId: request.user?.sub,
      projectId: paramsResult.data.project_id,
      cameraId: paramsResult.data.camera_id,
      meta: this.getRequestMeta(request),
    });

    return ResponseHandler.success(result);
  }
}

export default new ProjectCameraController();
