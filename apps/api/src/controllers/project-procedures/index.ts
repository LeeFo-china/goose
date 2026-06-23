import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ProjectProcedureCandidatesParamsSchema,
  ProjectProcedureCandidatesQuerySchema,
} from "@/schema/project-procedure-assignments";
import { projectProcedureAssignmentService } from "@/services/project-procedure-assignments";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ProjectProceduresController extends TenantBaseController {
  constructor() {
    super("project_procedure_assignments");
  }

  @Get("/projects/:projectId/procedure-candidates")
  async listCandidates(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = ProjectProcedureCandidatesParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = ProjectProcedureCandidatesQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await projectProcedureAssignmentService.listCandidates({
      authContext,
      projectId: paramsResult.data.projectId,
      query: queryResult.data,
    });
    return ResponseHandler.success(data);
  }
}

export default new ProjectProceduresController();
