import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerProjectLogShareRecordSchema,
  CustomerProjectLogShareParamsSchema,
  GenerateCustomerProjectLogShareCopySchema,
} from "@/schema/customer-project-log-share";
import { customerProjectLogShareService } from "@/services/customer-project-log-shares";
import { Post, Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class CustomerProjectLogSharesController extends BaseController {
  constructor() {
    super("customer-project-log-shares");
  }

  private getRequiredAuthUserId(request: FastifyRequest) {
    const authUserId = request.user?.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }

    return authUserId;
  }

  @Post("/customer/projects/:projectId/logs/:logId/share-copy")
  async generateShareCopy(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = GenerateCustomerProjectLogShareCopySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.generateShareCopies(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
      bodyResult.data,
    );

    return ResponseHandler.success(data);
  }

  @Get("/customer/projects/:projectId/logs/:logId/share-card")
  async getShareCard(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getShareCard(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
    );

    return ResponseHandler.success(data);
  }

  @Post("/customer/projects/:projectId/logs/:logId/share-record")
  async createShareRecord(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateCustomerProjectLogShareRecordSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.createShareRecord(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
      bodyResult.data,
    );

    return ResponseHandler.success(data);
  }
}

export default new CustomerProjectLogSharesController();
