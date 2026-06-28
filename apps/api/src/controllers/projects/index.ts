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

function buildProjectListDebugTiming(input: {
  authContextMs: number;
  controllerTotalMs: number;
  timings?: Record<string, number | string | null>;
}) {
  return {
    auth_context_ms: input.authContextMs,
    cache: input.timings?.cache ?? null,
    scope_ms: input.timings?.scopeMs ?? null,
    rows_ms: input.timings?.rowsMs ?? null,
    assignees_ms: input.timings?.assigneesMs ?? null,
    stages_ms: input.timings?.stagesMs ?? null,
    display_status_ms: input.timings?.displayStatusMs ?? null,
    workflow_summary_ms: input.timings?.workflowSummaryMs ?? null,
    workflow_filters_ms: input.timings?.workflowFiltersMs ?? null,
    total_ms: input.timings?.totalMs ?? input.controllerTotalMs,
    visible_project_count: input.timings?.visibleProjectCount ?? null,
    today_project_count: input.timings?.todayProjectCount ?? null,
    workflow_project_count: input.timings?.workflowProjectCount ?? null,
    row_count: input.timings?.rowCount ?? null,
    has_more: input.timings?.hasMore ?? null,
  };
}

class ProjectController extends ProjectBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    projectStatusBootstrapController.registerExtraRoutes(fastify);
    projectMembersController.registerExtraRoutes(fastify);
    publicProjectsController.registerExtraRoutes(fastify);
    projectCreateSelectController.registerExtraRoutes(fastify);
  };

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const requestStartedAt = Date.now();
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const result = await projectSer.listProjects({
      authContext,
      query: queryResult.data,
    });
    const debugTiming = queryResult.data.debug_timing
      ? {
        debug_timing: buildProjectListDebugTiming({
          authContextMs,
          controllerTotalMs: Date.now() - requestStartedAt,
          timings: result.debugTimings,
        }),
      }
      : {};
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
        ...debugTiming,
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
      ...debugTiming,
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
