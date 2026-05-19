import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  NotificationListQuerySchema,
  NotificationMarkReadBodySchema,
} from "@/schema/notifications";
import { notificationService } from "@/services/notifications";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class NotificationsController extends TenantBaseController {
  constructor() {
    super("notifications");
  }

  @Get("/notifications")
  async listMine(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = NotificationListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await notificationService.listMine(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/notifications/summary")
  async getSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const data = await notificationService.getMySummary(authContext);
    return ResponseHandler.success(data);
  }

  @Post("/notifications/read")
  async markRead(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = NotificationMarkReadBodySchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await notificationService.markMineRead(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }
}

export default new NotificationsController();
