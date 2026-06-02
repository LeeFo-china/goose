import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { ProjectListQuerySchema } from "@/schema/projects";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { projectSer } from "@/services/projects";
import { ResponseHandler } from "@/utils/response";
import projectCreateSelectController from "./create-select-controller";
import { serializeProjectListItem } from "./list-serializer";
import projectMembersController from "./members-controller";
import publicProjectsController from "./public-controller";
import { ProjectBaseController } from "./shared";
import projectStatusBootstrapController from "./status-bootstrap-controller";

class ProjectController extends ProjectBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    projectStatusBootstrapController.registerExtraRoutes(fastify);
    projectMembersController.registerExtraRoutes(fastify);
    publicProjectsController.registerExtraRoutes(fastify);
    projectCreateSelectController.registerExtraRoutes(fastify);
  };

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const result = await projectSer.listProjects({
      authContext,
      query: queryResult.data,
    });
    if (queryResult.data.mode === "home") {
      request.log.info(
        {
          requestId: request.id,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          authContextMs,
          timings: result.debugTimings ?? null,
        },
        "[project-home-list] timings",
      );

      return ResponseHandler.success({
        list: result.rows.map((item) => serializeProjectListItem(item)),
        pagination: result.pagination,
      });
    }

    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );

    return ResponseHandler.success({
      list: result.rows.map((item) =>
        serializeProjectListItem(item, phonePrivacyContext)
      ),
      pagination: result.pagination,
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await projectSer.getProjectDetail({
      authContext,
      projectId: idVerify.data.id,
    });

    return ResponseHandler.success(
      await this.serializeProjectDetailItem(
        project,
        await customerPhonePrivacyService.createPrivacyContext(authContext),
      ),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const project = await projectSer.createProject({
      authContext,
      payload: result.data,
    });
    return ResponseHandler.success(project);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectSer.updateProjectForTenant({
      authContext,
      projectId: idVerify.data.id,
      payload: result.data,
    });
    return ResponseHandler.success(data);
  };
}

export default new ProjectController();
