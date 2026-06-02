import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { projectSer } from "@/services/projects";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { serializeProjectListItem } from "./list-serializer";
import { ProjectBaseController } from "./shared";

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

    const visibilityStartedAt = Date.now();
    await projectSer.getPublicProjectDetail(projectId);
    const visibilityMs = Date.now() - visibilityStartedAt;

    const logsStartedAt = Date.now();
    const rows = await projectSer.listPublicProjectLogs(projectId);
    const logsFetchMs = Date.now() - logsStartedAt;

    const serializeStartedAt = Date.now();
    const logs = rows.map((item) => this.serializePublicProjectLog(item));
    const serializeMs = Date.now() - serializeStartedAt;

    request.log.info(
      {
        requestId: request.id,
        projectId,
        visibilityMs,
        logsFetchMs,
        serializeMs,
        totalMs: Date.now() - startedAt,
        logCount: logs.length,
        imageCount: logs.reduce((count, item) => count + item.images.length, 0),
      },
      "[public-project-logs] timings",
    );

    return ResponseHandler.success(logs);
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

    const [publicLogResult, publicMemberResult] = await Promise.all([
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
    const data = await this.serializePublicProjectDetailItem(project, {
      publicLogs,
      members,
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
}

export default new PublicProjectsController();
