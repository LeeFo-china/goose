import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  CreateProjectMemberSchema,
  ProjectMemberParamsSchema,
  UpdateProjectMemberSchema,
} from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import { projectMemberService } from "@/services/project-members";
import { projectSer } from "@/services/projects";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import {
  PROJECT_MEMBER_ROLE_CONFIG,
  type ProjectMemberRoleCode,
} from "@gooes/domain";
import {
  ProjectBaseController,
  type ProjectMemberRoleOption,
} from "./shared";

class ProjectMembersController extends ProjectBaseController {
  @Get("/projects/:id/members")
  async getProjectMembers(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await projectSer.getProjectDetail({
      authContext,
      projectId: idVerify.data.id,
    });

    const members = await this.getProjectMembersForDetail(project);
    return ResponseHandler.success(members);
  }

  @Get("/projects/member-roles")
  async getProjectMemberRoles(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    accessPolicyService.assertPermission(authContext, "project.read");

    const list: ProjectMemberRoleOption[] = Object.entries(
      PROJECT_MEMBER_ROLE_CONFIG,
    )
      .map(([roleCode, config]) => ({
        role_code: roleCode as ProjectMemberRoleCode,
        role_name: config.label,
        category: config.category,
        is_core: config.isCore,
        sort_order: config.sortOrder,
        status: config.status,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);

    return ResponseHandler.success(list);
  }

  @Post("/projects/:id/members")
  async createProjectMember(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      idVerify.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const result = CreateProjectMemberSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectMemberService.createProjectMember(
      idVerify.data.id,
      result.data,
      authContext.tenantId,
    );
    projectSer.invalidatePublicProjectMembersCache(idVerify.data.id);

    return ResponseHandler.success(this.serializeProjectMember(data));
  }

  @Patch("/projects/:id/members/:memberId")
  async updateProjectMember(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = ProjectMemberParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const result = UpdateProjectMemberSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectMemberService.updateProjectMember(
      paramsResult.data.id,
      paramsResult.data.memberId,
      result.data,
      authContext.tenantId,
    );
    projectSer.invalidatePublicProjectMembersCache(paramsResult.data.id);

    return ResponseHandler.success(this.serializeProjectMember(data));
  }

  @Delete("/projects/:id/members/:memberId")
  async deleteProjectMember(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = ProjectMemberParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    await projectMemberService.deleteProjectMember(
      paramsResult.data.id,
      paramsResult.data.memberId,
      authContext.tenantId,
    );
    projectSer.invalidatePublicProjectMembersCache(paramsResult.data.id);

    return ResponseHandler.success({ success: true });
  }
}

export default new ProjectMembersController();
