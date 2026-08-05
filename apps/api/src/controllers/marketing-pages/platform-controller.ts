import { Errors } from "@/errors/error-factory";
import {
  CreateMarketingPageSchema,
  DuplicateMarketingPageSchema,
  MarketingPageBlockAiFillSchema,
  MarketingPageCreateAiFillSchema,
  MarketingPageIdParamsSchema,
  MarketingPageListQuerySchema,
  MarketingPageSettingsAiFillSchema,
  ReorderMarketingPageSchema,
  SaveMarketingPageDraftSchema,
  UpdateMarketingPageSchema,
} from "@/schema/marketing-pages";
import {
  fillMarketingPageBlockWithAi,
  fillMarketingPageCreateWithAi,
  fillMarketingPageSettingsWithAi,
} from "@/services/marketing-page-ai";
import { marketingPageService } from "@/services/marketing-pages";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { Delete, Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { PermissionCode } from "@gooes/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createAiPageContext,
  MarketingPagesBaseController,
} from "./shared";

class PlatformMarketingPagesController extends MarketingPagesBaseController {
  @Get("/platform/marketing-pages")
  async listPlatformPages(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformContentReadContext(request);

    const queryResult = MarketingPageListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await marketingPageService.listPlatformPages(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/marketing-pages")
  async createPlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformContentManageContext(request);

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
    const authContext = await this.getPlatformContentReadContext(request);

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
    const authContext = await this.getPlatformContentReadContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPlatformPage(authContext, paramsResult.data.id);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/marketing-pages/:id")
  async updatePlatformPage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformContentManageContext(request);

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
    const authContext = await this.getPlatformContentManageContext(request);

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
    const authContext = await this.getPlatformContentReadContext(request);

    const paramsResult = MarketingPageIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await marketingPageService.getPlatformDraft(authContext, paramsResult.data.id);
    return ResponseHandler.success(data);
  }

  @Put("/platform/marketing-pages/:id/draft")
  async savePlatformDraft(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformContentManageContext(request);

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
    const authContext = await this.getPlatformContentPublishContext(request);

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
    const authContext = await this.getPlatformContentReadContext(request);

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
    const authContext = await this.getPlatformContentReadContext(request);

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
    const authContext = await this.getPlatformContentManageContext(request);

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
    const authContext = await this.getPlatformContentManageContext(request);

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
    const authContext = await this.getPlatformContentManageContext(request);

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

  private getPlatformContentReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformContentContext(request, "platform.site_content.read");
  }

  private getPlatformContentManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformContentContext(request, "platform.site_content.manage");
  }

  private getPlatformContentPublishContext(request: FastifyRequest) {
    return this.getRequiredPlatformContentContext(request, "platform.site_content.publish");
  }

  private async getRequiredPlatformContentContext(
    request: FastifyRequest,
    permissionCode: PermissionCode,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(authContext, permissionCode);
    return authContext;
  }
}

export default new PlatformMarketingPagesController();
