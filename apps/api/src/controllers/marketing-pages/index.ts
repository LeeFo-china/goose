import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateMarketingPageSchema,
  ConvertMarketingLeadSchema,
  DuplicateMarketingPageSchema,
  MarketingPageIdParamsSchema,
  MarketingLeadIdParamsSchema,
  MarketingLeadListQuerySchema,
  MarketingPageBlockAiFillSchema,
  MarketingPageCreateAiFillSchema,
  MarketingPageListQuerySchema,
  MarketingPageProjectOptionQuerySchema,
  MarketingPageSettingsAiFillSchema,
  MarketingPageSlugParamsSchema,
  PublicTenantMarketingPageParamsSchema,
  PublicMarketingPageListQuerySchema,
  ReorderMarketingPageSchema,
  SaveMarketingPageDraftSchema,
  SubmitMarketingLeadSchema,
  TrackMarketingEventSchema,
  UpdateMarketingLeadSchema,
  UpdateMarketingPageSchema,
} from "@/schema/marketing-pages";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import {
  fillMarketingPageBlockWithAi,
  fillMarketingPageCreateWithAi,
  fillMarketingPageSettingsWithAi,
} from "@/services/marketing-page-ai";
import { marketingPageService } from "@/services/marketing-pages";
import { Delete, Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

function getRequestMetadata(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];

  return {
    requestIp: request.ip || null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

function createAiPageContext(
  pages: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>,
) {
  return pages.slice(0, 20).map((page) => ({
    title: page.title,
    slug: page.slug,
    status: page.status,
    description: page.description,
  }));
}

class MarketingPagesController extends BaseController {
  constructor() {
    super("marketing_pages");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(request.user?.sub);
  }

  @Get("/platform/marketing-pages")
  async listPlatformPages(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const queryResult = MarketingPageListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listPlatformPages(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages")
  async createPlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const bodyResult = CreateMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.createPlatformPage(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/ai-fill-create")
  async fillPlatformCreateWithAi(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const bodyResult = MarketingPageCreateAiFillSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const pages = await marketingPageService.listPlatformPages(authContext, {
      page: 1,
      pageSize: 20,
    });
    const data = await fillMarketingPageCreateWithAi({
      ...bodyResult.data,
      scope: "platform",
      tenantId: null,
      tenantName: null,
      source: "platform_admin",
      billable: false,
      authUserId: authContext.authUserId,
      pages: createAiPageContext(pages.list),
    });
    return ResponseHandler.success(data);
  }

  @Get("/platform/marketing-pages/:id")
  async getPlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPlatformPage(authContext, paramsResult.data.id);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/marketing-pages/:id")
  async updatePlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.updatePlatformPage(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Delete("/platform/marketing-pages/:id")
  async archivePlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.archivePlatformPage(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/marketing-pages/:id/draft")
  async getPlatformDraft(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPlatformDraft(authContext, paramsResult.data.id);
    return ResponseHandler.success(data);
  }

  @Put("/platform/marketing-pages/:id/draft")
  async savePlatformDraft(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = SaveMarketingPageDraftSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.savePlatformDraft(
      authContext,
      paramsResult.data.id,
      bodyResult.data.config,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/:id/publish")
  async publishPlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.publishPlatformPage(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/:id/ai-fill-block")
  async fillPlatformBlockWithAi(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = MarketingPageBlockAiFillSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    if (bodyResult.data.page?.id && bodyResult.data.page.id !== paramsResult.data.id) {
      throw Errors.badRequest("营销页上下文不匹配");
    }

    await marketingPageService.getPlatformPage(authContext, paramsResult.data.id);

    const data = await fillMarketingPageBlockWithAi({
      ...bodyResult.data,
      tenantId: null,
      source: "platform_admin",
      billable: false,
      authUserId: authContext.authUserId,
      page: {
        ...bodyResult.data.page,
        id: paramsResult.data.id,
      },
    });
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/:id/ai-fill-settings")
  async fillPlatformSettingsWithAi(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = MarketingPageSettingsAiFillSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    if (bodyResult.data.page?.id && bodyResult.data.page.id !== paramsResult.data.id) {
      throw Errors.badRequest("营销页上下文不匹配");
    }

    await marketingPageService.getPlatformPage(authContext, paramsResult.data.id);

    const data = await fillMarketingPageSettingsWithAi({
      ...bodyResult.data,
      tenantId: null,
      source: "platform_admin",
      billable: false,
      authUserId: authContext.authUserId,
      page: {
        ...bodyResult.data.page,
        id: paramsResult.data.id,
      },
    });
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/:id/offline")
  async offlinePlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.offlinePlatformPage(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/:id/duplicate")
  async duplicatePlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = DuplicateMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.duplicatePlatformPage(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages/:id/reorder")
  async reorderPlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ReorderMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.reorderPlatformPage(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/marketing-pages")
  async listPages(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.read");

    const queryResult = MarketingPageListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listPages(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages")
  async createPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.create");

    const bodyResult = CreateMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.createPage(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/ai-fill-create")
  async fillCreateWithAi(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.create");

    const bodyResult = MarketingPageCreateAiFillSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const pages = await marketingPageService.listPages(authContext, {
      page: 1,
      pageSize: 20,
    });
    const data = await fillMarketingPageCreateWithAi({
      ...bodyResult.data,
      scope: "tenant",
      tenantId: authContext.tenantId,
      tenantName: authContext.tenantName,
      source: "admin",
      billable: Boolean(authContext.tenantId),
      authUserId: authContext.authUserId,
      pages: createAiPageContext(pages.list),
    });
    return ResponseHandler.success(data);
  }

  @Get("/marketing-pages/project-options")
  async listProjectOptions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const queryResult = MarketingPageProjectOptionQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listProjectOptions(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/marketing-pages/:id")
  async getPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.read");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPage(authContext, paramsResult.data.id);
    return ResponseHandler.success(data);
  }

  @Patch("/marketing-pages/:id")
  async updatePage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.update");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.updatePage(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Delete("/marketing-pages/:id")
  async archivePage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.delete");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.archivePage(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Get("/marketing-pages/:id/draft")
  async getDraft(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.read");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getDraft(authContext, paramsResult.data.id);
    return ResponseHandler.success(data);
  }

  @Put("/marketing-pages/:id/draft")
  async saveDraft(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.update");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = SaveMarketingPageDraftSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.saveDraft(
      authContext,
      paramsResult.data.id,
      bodyResult.data.config,
    );
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/:id/publish")
  async publishPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.publish");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.publishPage(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/:id/ai-fill-block")
  async fillBlockWithAi(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.update");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = MarketingPageBlockAiFillSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    if (bodyResult.data.page?.id && bodyResult.data.page.id !== paramsResult.data.id) {
      throw Errors.badRequest("营销页上下文不匹配");
    }

    await marketingPageService.getPage(authContext, paramsResult.data.id);

    const data = await fillMarketingPageBlockWithAi({
      ...bodyResult.data,
      tenantId: authContext.tenantId,
      source: "admin",
      billable: Boolean(authContext.tenantId),
      authUserId: authContext.authUserId,
      page: {
        ...bodyResult.data.page,
        id: paramsResult.data.id,
      },
    });
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/:id/ai-fill-settings")
  async fillSettingsWithAi(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.update");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = MarketingPageSettingsAiFillSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    if (bodyResult.data.page?.id && bodyResult.data.page.id !== paramsResult.data.id) {
      throw Errors.badRequest("营销页上下文不匹配");
    }

    await marketingPageService.getPage(authContext, paramsResult.data.id);

    const data = await fillMarketingPageSettingsWithAi({
      ...bodyResult.data,
      tenantId: authContext.tenantId,
      source: "admin",
      billable: Boolean(authContext.tenantId),
      authUserId: authContext.authUserId,
      page: {
        ...bodyResult.data.page,
        id: paramsResult.data.id,
      },
    });
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/:id/offline")
  async offlinePage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.publish");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.offlinePage(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/:id/duplicate")
  async duplicatePage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.create");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = DuplicateMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.duplicatePage(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/marketing-pages/:id/reorder")
  async reorderPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "marketing_page.update");

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ReorderMarketingPageSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await marketingPageService.reorderPage(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

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

export default new MarketingPagesController();
