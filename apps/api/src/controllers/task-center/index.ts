import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Get } from "@/utils/decorators/route";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  TaskCenterTodoListQuerySchema,
} from "@/schema/task-center";
import { taskCenterService } from "@/services/task-center";

class TaskCenterController extends TenantBaseController {
  constructor() {
    super("task_center");
  }

  private assertTaskCenterReadable(authContext: AuthContext) {
    if (accessPolicyService.hasPermission(authContext, "task_center.read")) {
      return;
    }

    if (accessPolicyService.hasPermission(authContext, "dashboard.read")) {
      return;
    }

    throw Errors.forbidden();
  }

  @Get("/task-center/todos")
  async listTodos(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertTaskCenterReadable(authContext);
    const queryResult = TaskCenterTodoListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    return ResponseHandler.success(
      await taskCenterService.listTodos(authContext, queryResult.data),
    );
  }

  @Get("/task-center/todos/summary")
  async getSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    this.assertTaskCenterReadable(authContext);

    const serviceStartedAt = Date.now();
    const data = await taskCenterService.getSummary(authContext);
    const serviceMs = Date.now() - serviceStartedAt;

    request.log.info(
      {
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
        authContextMs,
        serviceMs,
      },
      "[task-summary] timings",
    );

    return ResponseHandler.success(data);
  }
}

export default new TaskCenterController();
