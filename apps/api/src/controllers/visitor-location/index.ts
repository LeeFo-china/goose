import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  VisitorLocationBootstrapSchema,
  VisitorLocationConfirmSchema,
  VisitorLocationSkipSchema,
} from "@/schema/visitor-location";
import { visitorLocationService } from "@/services/visitor-location";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class VisitorLocationController extends BaseController {
  constructor() {
    super("user_location_contexts");
  }

  @Get("/visitor/location/options")
  async getOptions(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);

    const data = await visitorLocationService.getOptions(visitorId);
    return ResponseHandler.success(data);
  }

  @Get("/visitor/location-context")
  async getContext(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);

    const data = await visitorLocationService.getContext(visitorId);
    return ResponseHandler.success(data);
  }

  @Post("/visitor/location-bootstrap")
  async bootstrap(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const bodyResult = VisitorLocationBootstrapSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await visitorLocationService.bootstrap(bodyResult.data, visitorId);
    return ResponseHandler.success(data);
  }

  @Post("/visitor/location-bootstrap/confirm")
  async confirm(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const bodyResult = VisitorLocationConfirmSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await visitorLocationService.confirm(bodyResult.data, visitorId);
    return ResponseHandler.success(data);
  }

  @Post("/visitor/location-bootstrap/skip")
  async skip(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const bodyResult = VisitorLocationSkipSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await visitorLocationService.skip(bodyResult.data, visitorId);
    return ResponseHandler.success(data);
  }

  private getRequiredVisitorId(request: FastifyRequest) {
    const user = request.user;
    if (user?.token_type !== "visitor_session" || !user.visitor_id) {
      throw Errors.unauthorized("请使用 visitor 登录态");
    }
    return user.visitor_id;
  }
}

export default new VisitorLocationController();
