import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  BrandingAddonCreateOrderSchema,
  BrandingAddonEmptySchema,
  BrandingAddonOrderListQuerySchema,
  BrandingAddonOrderParamsSchema,
  BrandingAddonProductPatchSchema,
} from "@/schema/branding-addon";
import {
  platformBrandingAddonProductService,
} from "@/services/platform-branding-addon-product";
import {
  tenantBrandingAddonOrderService,
} from "@/services/tenant-branding-addon-orders";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

function requireWechatPayerOpenid(request: FastifyRequest): string {
  const openid = request.user?.openid?.trim();
  if (
    request.user?.login_channel !== "wechat" ||
    !openid ||
    openid.length > 128
  ) {
    throw Errors.business(
      403,
      "请使用已登录的微信小程序账号发起支付",
      "BRANDING_ADDON_WECHAT_LOGIN_REQUIRED",
    );
  }
  return openid;
}

class PlatformBrandingAddonController extends PlatformBaseController {
  constructor() {
    super("platform-branding-addon");
  }

  @Get("/platform/branding/entitlement-product")
  async getProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    parse(BrandingAddonEmptySchema, request.query);
    return ResponseHandler.success(
      await platformBrandingAddonProductService.get(authContext),
    );
  }

  @Patch("/platform/branding/entitlement-product")
  async updateProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    parse(BrandingAddonEmptySchema, request.query);
    const input = parse(BrandingAddonProductPatchSchema, request.body);
    return ResponseHandler.success(
      await platformBrandingAddonProductService.update(authContext, input),
    );
  }
}

class TenantBrandingAddonController extends TenantBaseController {
  constructor() {
    super("tenant-branding-addon");
  }

  @Get("/tenant/branding/entitlement-product")
  async getProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    parse(BrandingAddonEmptySchema, request.query);
    return ResponseHandler.success(
      await tenantBrandingAddonOrderService.getProduct(authContext),
    );
  }

  @Post("/tenant/branding/entitlement-orders")
  async createOrder(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    parse(BrandingAddonEmptySchema, request.query);
    const input = parse(BrandingAddonCreateOrderSchema, request.body);
    const payerOpenid = requireWechatPayerOpenid(request);
    return ResponseHandler.success(
      await tenantBrandingAddonOrderService.createOrder(
        authContext,
        input,
        payerOpenid,
      ),
    );
  }

  @Post("/tenant/branding/entitlement-orders/:id/payment-request")
  async createPaymentRequest(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const { id } = parse(BrandingAddonOrderParamsSchema, request.params);
    parse(BrandingAddonEmptySchema, request.query);
    parse(BrandingAddonEmptySchema, request.body);
    const payerOpenid = requireWechatPayerOpenid(request);
    return ResponseHandler.success(
      await tenantBrandingAddonOrderService.createPaymentRequest(
        authContext,
        id,
        payerOpenid,
      ),
    );
  }

  @Get("/tenant/branding/entitlement-orders")
  async listOrders(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const query = parse(BrandingAddonOrderListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantBrandingAddonOrderService.listOrders(authContext, query),
    );
  }

  @Get("/tenant/branding/entitlement-orders/:id")
  async getOrder(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const { id } = parse(BrandingAddonOrderParamsSchema, request.params);
    parse(BrandingAddonEmptySchema, request.query);
    return ResponseHandler.success(
      await tenantBrandingAddonOrderService.getOrder(authContext, id),
    );
  }
}

class BrandingAddonController {
  private readonly controllers = [
    new PlatformBrandingAddonController(),
    new TenantBrandingAddonController(),
  ] as const;

  registerExtraRoutes(app: FastifyInstance): void {
    for (const controller of this.controllers) {
      controller.registerExtraRoutes(app);
    }
  }
}

export default new BrandingAddonController();
