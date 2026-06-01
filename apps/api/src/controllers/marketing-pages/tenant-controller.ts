import { Errors } from "@/errors/error-factory";
import {
  CreateMarketingPageSchema,
  DuplicateMarketingPageSchema,
  MarketingPageBlockAiFillSchema,
  MarketingPageCreateAiFillSchema,
  MarketingPageIdParamsSchema,
  MarketingPageListQuerySchema,
  MarketingPageProjectOptionQuerySchema,
  MarketingPageSettingsAiFillSchema,
  ReorderMarketingPageSchema,
  SaveMarketingPageDraftSchema,
  UpdateMarketingPageSchema,
} from "@/schema/marketing-pages";
import { accessPolicyService } from "@/services/access-policy";
import {
  fillMarketingPageBlockWithAi,
  fillMarketingPageCreateWithAi,
  fillMarketingPageSettingsWithAi,
} from "@/services/marketing-page-ai";
import { marketingPageService } from "@/services/marketing-pages";
import { Delete, Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createAiPageContext,
  MarketingPagesBaseController,
} from "./shared";

class TenantMarketingPagesController extends MarketingPagesBaseController {
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
}

export default new TenantMarketingPagesController();
