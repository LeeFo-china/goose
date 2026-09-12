import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { RenderingPhoneBindSchema } from "@/schema/customer-renderings";
import {
  createCustomerRenderingQuotaService,
  type CustomerRenderingQuotaService,
} from "@/services/customer-rendering";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

type QuotaService = Pick<CustomerRenderingQuotaService, "getQuota" | "bindPhone">;

export class VisitorRenderingsController extends BaseController {
  constructor(private readonly configuredService?: QuotaService) {
    super("customer_rendering_quota_accounts");
  }

  @Get("/visitor/renderings/quota", { tenantServiceAccess: "session" })
  async getQuota(request: FastifyRequest) {
    return ResponseHandler.success(
      await this.service.getQuota(request.user, "wechat"),
    );
  }

  @Post("/visitor/renderings/phone:bind", { tenantServiceAccess: "session" })
  async bindPhone(request: FastifyRequest) {
    const parsed = RenderingPhoneBindSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return ResponseHandler.success(
      await this.service.bindPhone(request.user, "wechat", parsed.data),
    );
  }

  private get service(): QuotaService {
    return this.configuredService ?? createCustomerRenderingQuotaService();
  }
}

export default new VisitorRenderingsController();
