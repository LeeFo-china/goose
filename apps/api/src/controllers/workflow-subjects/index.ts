import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  WorkflowSubjectStateParamsSchema,
  WorkflowSubjectTimelineQuerySchema,
} from "@/schema/workflow-subjects";
import { workflowSubjectsService } from "@/services/workflow-subjects";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class WorkflowSubjectsController extends TenantBaseController {
  constructor() {
    super("workflow_subjects");
  }

  @Get("/workflow-subjects/:subjectType/:subjectId/state")
  async getState(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowSubjectStateParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await workflowSubjectsService.getState(
      authContext,
      paramsResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/workflow-subjects/:subjectType/:subjectId/timeline")
  async listTimeline(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowSubjectStateParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = WorkflowSubjectTimelineQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await workflowSubjectsService.listTimeline(
      authContext,
      paramsResult.data,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new WorkflowSubjectsController();
