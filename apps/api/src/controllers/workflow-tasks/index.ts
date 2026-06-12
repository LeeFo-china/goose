import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  WorkflowTaskCompleteSchema,
  WorkflowTaskIdParamsSchema,
  WorkflowTaskListQuerySchema,
} from "@/schema/workflow-subjects";
import { workflowTaskService } from "@/services/workflow-tasks";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class WorkflowTasksController extends TenantBaseController {
  constructor() {
    super("workflow_tasks");
  }

  @Get("/workflow-tasks")
  async listTasks(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = WorkflowTaskListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await workflowTaskService.listTasks(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/workflow-tasks/:id/complete")
  async completeTask(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowTaskIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = WorkflowTaskCompleteSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowTaskService.completeTask(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new WorkflowTasksController();
