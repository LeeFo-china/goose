import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Get } from "@/utils/decorators/route";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import {
  TaskCenterTodoListQuerySchema,
} from "@/schema/task-center";
import { taskCenterService } from "@/services/task-center";

class TaskCenterController extends BaseController {
  constructor() {
    super("task_center");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  private assertTaskCenterReadable(
    authContext: Awaited<ReturnType<TaskCenterController["getRequiredAuthContext"]>>,
  ) {
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
    const authContext = await this.getRequiredAuthContext(request);
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
    const authContext = await this.getRequiredAuthContext(request);
    this.assertTaskCenterReadable(authContext);

    return ResponseHandler.success(
      await taskCenterService.getSummary(authContext),
    );
  }
}

export default new TaskCenterController();
