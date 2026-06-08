import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";
import { projectSer } from "@/services/projects";
import { visitorProjectFollowService } from "@/services/visitor-project-follows";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { serializeProjectListItem } from "./list-serializer";
import { serializePublicProjectDetailItem } from "./public-detail-serializer";
import { ProjectBaseController } from "./shared";

const VISITOR_PROJECT_CONSULTATION_ENABLED_KEY =
  "VISITOR_PROJECT_CONSULTATION_ENABLED";

const PublicProjectLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number()
    .int()
    .min(1, "每页条数必须大于 0")
    .max(100, "每页条数不能超过 100")
    .default(10),
});

class PublicProjectsController extends ProjectBaseController {
  @Get("/front/projects")
  async getPublicProjects(request: FastifyRequest) {
    const projects = await projectSer.listPublicProjects();

    return ResponseHandler.success(
      projects.map((item) => serializeProjectListItem(item)),
    );
  }

  @Get("/front/projects/:id/logs")
  async getPublicProjectLogsById(request: FastifyRequest) {
    const startedAt = Date.now();
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const projectId = idVerify.data.id;

    const queryResult = PublicProjectLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const visibilityStartedAt = Date.now();
    await projectSer.getPublicProjectDetail(projectId);
    const visibilityMs = Date.now() - visibilityStartedAt;

    const logsStartedAt = Date.now();
    const result = await projectSer.listPublicProjectLogsPage({
      projectId,
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });
    const logsFetchMs = Date.now() - logsStartedAt;

    const serializeStartedAt = Date.now();
    const logs = result.rows.map((item) => this.serializePublicProjectLog(item));
    const serializeMs = Date.now() - serializeStartedAt;

    request.log.info(
      {
        requestId: request.id,
        projectId,
        page: result.pagination.page,
        pageSize: result.pagination.pageSize,
        total: result.pagination.total,
        visibilityMs,
        logsFetchMs,
        serializeMs,
        totalMs: Date.now() - startedAt,
        logCount: logs.length,
        imageCount: logs.reduce((count, item) => count + item.images.length, 0),
      },
      "[public-project-logs] timings",
    );

    return ResponseHandler.success({
      list: logs,
      pagination: result.pagination,
    });
  }

  @Get("/front/projects/:id")
  async getPublicProjectById(request: FastifyRequest) {
    const startedAt = Date.now();
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const projectId = idVerify.data.id;

    const detailStartedAt = Date.now();
    const project = await projectSer.getPublicProjectDetail(projectId);
    const detailMs = Date.now() - detailStartedAt;

    const tenantId = this.getPublicProjectTenantId(project);
    const visitorId = this.getOptionalFollowerVisitorId(request);

    const [
      publicLogResult,
      publicMemberResult,
      consultationEnabled,
      followState,
    ] = await Promise.all([
      (async () => {
        const startedAt = Date.now();
        const rows = await projectSer.listPublicProjectLogs(projectId);
        return { rows, durationMs: Date.now() - startedAt };
      })(),
      (async () => {
        const startedAt = Date.now();
        const rows = await projectSer.listPublicProjectMembers(projectId);
        return { rows, durationMs: Date.now() - startedAt };
      })(),
      tenantId
        ? systemSettingsService.getBoolean(
          VISITOR_PROJECT_CONSULTATION_ENABLED_KEY,
          false,
          { tenantId },
        )
        : Promise.resolve(false),
      visitorProjectFollowService.getProjectFollowState(projectId, visitorId),
    ]);

    const logsSerializeStartedAt = Date.now();
    const publicLogs = publicLogResult.rows.map((item) =>
      this.serializePublicProjectLog(item)
    );
    const logsSerializeMs = Date.now() - logsSerializeStartedAt;

    const membersSerializeStartedAt = Date.now();
    const members = publicMemberResult.rows
      .filter((item) => item.role_code !== "customer_owner")
      .map((item) => this.serializePublicProjectMember(item));
    const membersSerializeMs = Date.now() - membersSerializeStartedAt;

    const serializeStartedAt = Date.now();
    const data = serializePublicProjectDetailItem(project, {
      publicLogs,
      members,
      consultation: {
        enabled: consultationEnabled,
        tenant_id: tenantId,
        button_text: consultationEnabled ? "立即咨询" : null,
      },
      followedByMe: followState.followed_by_me,
      followCount: followState.follow_count,
    });
    const serializeMs = Date.now() - serializeStartedAt;

    request.log.info(
      {
        requestId: request.id,
        projectId,
        detailMs,
        logsFetchMs: publicLogResult.durationMs,
        logsSerializeMs,
        membersFetchMs: publicMemberResult.durationMs,
        membersSerializeMs,
        serializeMs,
        totalMs: Date.now() - startedAt,
        logCount: publicLogs.length,
        memberCount: members.length,
        coverImageCount: data.cover_images.length,
      },
      "[public-project-detail] timings",
    );

    return ResponseHandler.success(data);
  }

  private getPublicProjectTenantId(project: Record<string, unknown>) {
    const tenant = this.normalizeRelation(project.tenant, {
      id: null,
      name: null,
      slug: null,
    });

    return typeof tenant.id === "string" ? tenant.id : null;
  }

  private getOptionalFollowerVisitorId(request: FastifyRequest) {
    const user = request.user;
    return user?.visitor_id ?? user?.sub ?? null;
  }
}

export default new PublicProjectsController();
