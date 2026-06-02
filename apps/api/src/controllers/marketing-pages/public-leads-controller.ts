import { Errors } from "@/errors/error-factory";
import {
  ConvertMarketingLeadSchema,
  MarketingLeadIdParamsSchema,
  MarketingLeadListQuerySchema,
  MarketingPageSlugParamsSchema,
  PublicMarketingPageListQuerySchema,
  PublicTenantMarketingPageParamsSchema,
  SubmitMarketingLeadSchema,
  TrackMarketingEventSchema,
  UpdateMarketingLeadSchema,
} from "@/schema/marketing-pages";
import { accessPolicyService } from "@/services/access-policy";
import { marketingPageService } from "@/services/marketing-pages";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  getRequestMetadata,
  MarketingPagesBaseController,
} from "./shared";

class PublicMarketingPagesAndLeadsController extends MarketingPagesBaseController {
  @Get("/public/marketing-pages/:slug")
  async getPublishedPage(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = MarketingPageSlugParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPublishedPageBySlug(
      paramsResult.data.slug,
    );
    return ResponseHandler.success(data);
  }

  @Get("/public/tenants/:tenantSlug/marketing-pages/:slug")
  async getPublishedTenantPage(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = PublicTenantMarketingPageParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPublishedPageBySlug(
      paramsResult.data.slug,
      paramsResult.data.tenantSlug,
    );
    return ResponseHandler.success(data);
  }

  @Get("/public/marketing-pages")
  async listPublishedPages(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = PublicMarketingPageListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listPublishedEntries(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/public/tenants/:tenantSlug/marketing-pages")
  async listPublishedTenantPages(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = PublicTenantMarketingPageParamsSchema.pick({
      tenantSlug: true,
    }).safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = PublicMarketingPageListQuerySchema.safeParse({
      ...(request.query && typeof request.query === "object" ? request.query : {}),
      tenant_slug: paramsResult.data.tenantSlug,
    });
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listPublishedEntries(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/marketing-leads")
  async listLeads(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_lead.read");

    const queryResult = MarketingLeadListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listLeads(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/marketing-leads/:id")
  async updateLead(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_lead.update");

    const paramsResult = MarketingLeadIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateMarketingLeadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.updateLead(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/marketing-leads/:id/convert-customer")
  async convertLeadToCustomer(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_lead.update");
    accessPolicyService.assertPermission(authContext, "customer.create");

    const paramsResult = MarketingLeadIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ConvertMarketingLeadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.convertLeadToCustomer(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/public/marketing-pages/:slug/leads")
  async submitLead(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = MarketingPageSlugParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = SubmitMarketingLeadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.submitLead({
      ...bodyResult.data,
      slug: paramsResult.data.slug,
      ...getRequestMetadata(request),
    });
    return ResponseHandler.success(data);
  }

  @Post("/public/tenants/:tenantSlug/marketing-pages/:slug/leads")
  async submitTenantLead(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = PublicTenantMarketingPageParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = SubmitMarketingLeadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.submitLead({
      ...bodyResult.data,
      slug: paramsResult.data.slug,
      tenantSlug: paramsResult.data.tenantSlug,
      ...getRequestMetadata(request),
    });
    return ResponseHandler.success(data);
  }

  @Post("/public/marketing-pages/:slug/events")
  async trackEvent(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = MarketingPageSlugParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = TrackMarketingEventSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.trackEvent({
      ...bodyResult.data,
      slug: paramsResult.data.slug,
      ...getRequestMetadata(request),
    });
    return ResponseHandler.success(data);
  }

  @Post("/public/tenants/:tenantSlug/marketing-pages/:slug/events")
  async trackTenantEvent(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = PublicTenantMarketingPageParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = TrackMarketingEventSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.trackEvent({
      ...bodyResult.data,
      slug: paramsResult.data.slug,
      tenantSlug: paramsResult.data.tenantSlug,
      ...getRequestMetadata(request),
    });
    return ResponseHandler.success(data);
  }
}

export default new PublicMarketingPagesAndLeadsController();
