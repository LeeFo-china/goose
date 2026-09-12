import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { RenderingListQuerySchema } from "@gooes/domain";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { RenderingPhoneBindSchema } from "@/schema/customer-renderings";
import {
  customerRenderingCatalogService,
  createCustomerRenderingQuotaService,
  type CustomerRenderingCatalogService,
  type CustomerRenderingQuotaService,
} from "@/services/customer-rendering";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

type QuotaService = Pick<CustomerRenderingQuotaService, "getQuota" | "bindPhone">;
type CatalogService = Pick<CustomerRenderingCatalogService, "listStyles" | "getStyle">;
const StyleParamsSchema = z.strictObject({ id: z.uuid("无效的素材 ID") });
const EmptyQuerySchema = z.strictObject({});

export class VisitorRenderingsController extends BaseController {
  constructor(
    private readonly configuredService?: QuotaService,
    private readonly configuredCatalog?: CatalogService,
  ) {
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

  @Get("/visitor/renderings/styles", { tenantServiceAccess: "session" })
  async listStyles(request: FastifyRequest) {
    const parsed = RenderingListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return ResponseHandler.success(
      await this.catalog.listStyles(request.user, "wechat", parsed.data),
    );
  }

  @Get("/visitor/renderings/styles/:id", { tenantServiceAccess: "session" })
  async getStyle(request: FastifyRequest) {
    const parsed = StyleParamsSchema.safeParse(request.params);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const query = EmptyQuerySchema.safeParse(request.query ?? {});
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(
      await this.catalog.getStyle(request.user, "wechat", parsed.data.id),
    );
  }

  private get service(): QuotaService {
    return this.configuredService ?? createCustomerRenderingQuotaService();
  }

  private get catalog(): CatalogService {
    return this.configuredCatalog ?? customerRenderingCatalogService;
  }
}

export default new VisitorRenderingsController();
