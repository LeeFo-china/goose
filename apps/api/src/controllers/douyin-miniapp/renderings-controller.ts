import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { RenderingPhoneBindSchema } from "@/schema/customer-renderings";
import {
  createCustomerRenderingQuotaService,
  type CustomerRenderingQuotaService,
} from "@/services/customer-rendering";
import { ResponseHandler } from "@/utils/response";

type QuotaService = Pick<CustomerRenderingQuotaService, "getQuota" | "bindPhone">;
const routeOptions = { config: { tenantServiceAccess: "session" as const } };

export class DouyinRenderingsController {
  constructor(private readonly configuredService?: QuotaService) {}

  registerExtraRoutes(fastify: FastifyInstance) {
    fastify.get("/douyin-mini/renderings/quota", routeOptions, this.getQuota);
    fastify.post("/douyin-mini/renderings/phone:bind", routeOptions, this.bindPhone);
  }

  getQuota = async (request: FastifyRequest) => ResponseHandler.success(
    await this.service.getQuota(request.user, "douyin"),
  );

  bindPhone = async (request: FastifyRequest) => {
    const parsed = RenderingPhoneBindSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return ResponseHandler.success(
      await this.service.bindPhone(request.user, "douyin", parsed.data),
    );
  };

  private get service(): QuotaService {
    return this.configuredService ?? createCustomerRenderingQuotaService();
  }
}
