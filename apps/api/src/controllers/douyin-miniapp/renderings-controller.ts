import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { RenderingListQuerySchema } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import { RenderingPhoneBindSchema } from "@/schema/customer-renderings";
import {
  customerRenderingCatalogService,
  createCustomerRenderingQuotaService,
  type CustomerRenderingCatalogService,
  type CustomerRenderingQuotaService,
} from "@/services/customer-rendering";
import { ResponseHandler } from "@/utils/response";

type QuotaService = Pick<CustomerRenderingQuotaService, "getQuota" | "bindPhone">;
type CatalogService = Pick<CustomerRenderingCatalogService, "listStyles" | "getStyle">;
const routeOptions = { config: { tenantServiceAccess: "session" as const } };
const StyleParamsSchema = z.strictObject({ id: z.uuid("无效的素材 ID") });
const EmptyQuerySchema = z.strictObject({});

export class DouyinRenderingsController {
  constructor(
    private readonly configuredService?: QuotaService,
    private readonly configuredCatalog?: CatalogService,
  ) {}

  registerExtraRoutes(fastify: FastifyInstance) {
    fastify.get("/douyin-mini/renderings/quota", routeOptions, this.getQuota);
    fastify.post("/douyin-mini/renderings/phone:bind", routeOptions, this.bindPhone);
    fastify.get("/douyin-mini/renderings/styles", routeOptions, this.listStyles);
    fastify.get("/douyin-mini/renderings/styles/:id", routeOptions, this.getStyle);
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

  listStyles = async (request: FastifyRequest) => {
    const parsed = RenderingListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return ResponseHandler.success(
      await this.catalog.listStyles(request.user, "douyin", parsed.data),
    );
  };

  getStyle = async (request: FastifyRequest) => {
    const parsed = StyleParamsSchema.safeParse(request.params);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const query = EmptyQuerySchema.safeParse(request.query ?? {});
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(
      await this.catalog.getStyle(request.user, "douyin", parsed.data.id),
    );
  };

  private get service(): QuotaService {
    return this.configuredService ?? createCustomerRenderingQuotaService();
  }

  private get catalog(): CatalogService {
    return this.configuredCatalog ?? customerRenderingCatalogService;
  }
}
