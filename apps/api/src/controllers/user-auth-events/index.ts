import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  UserAuthEventListQuerySchema,
  UserAuthEventSummaryQuerySchema,
} from "@/schema/user-auth-events";
import { authorizationService } from "@/services/authorization";
import { userAuthEventService } from "@/services/user-auth-events";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class UserAuthEventsController extends BaseController {
  constructor() {
    super("user_auth_events");
  }

  @Get("/platform/user-auth-events")
  async listEvents(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const queryResult = UserAuthEventListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await userAuthEventService.list(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/user-auth-events/summary")
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const queryResult = UserAuthEventSummaryQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await userAuthEventService.summarize(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }
}

export default new UserAuthEventsController();
