import type { SiteContentType } from "@gooes/domain";
import type { FastifyReply, FastifyRequest } from "fastify";

import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ConsumeSitePreviewTokenSchema,
  CreateSiteContentEntrySchema,
  CreateSiteContentVersionSchema,
  CreateSitePreviewTokenSchema,
  SiteContentIdParamSchema,
  SiteContentListQuerySchema,
  SiteContentPaginationQuerySchema,
  SiteContentSlugParamSchema,
  SiteContentVersionActionSchema,
  UpdateSiteContentEntrySchema,
} from "@/schema/site-content";
import { siteContentService } from "@/services/site-content";
import { verifySiteContentPreviewRequest } from "@/services/site-content-preview-signature";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class SiteContentController extends PlatformBaseController {
  constructor() {
    super("site-content");
  }

  @Get("/public/site/articles")
  async listPublicArticles(request: FastifyRequest, reply: FastifyReply) {
    return this.listPublic("article", request);
  }

  @Get("/public/site/articles/:slug")
  async getPublicArticle(request: FastifyRequest, reply: FastifyReply) {
    return this.getPublic("article", request);
  }

  @Get("/public/site/cases")
  async listPublicCases(request: FastifyRequest, reply: FastifyReply) {
    return this.listPublic("case", request);
  }

  @Get("/public/site/cases/:slug")
  async getPublicCase(request: FastifyRequest, reply: FastifyReply) {
    return this.getPublic("case", request);
  }

  @Get("/public/site/cities")
  async listPublicCities(request: FastifyRequest, reply: FastifyReply) {
    return this.listPublic("city", request);
  }

  @Get("/public/site/cities/:slug")
  async getPublicCity(request: FastifyRequest, reply: FastifyReply) {
    return this.getPublic("city", request);
  }

  @Get("/platform/site-content")
  async listAdmin(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentReadContext(request);
    const query = SiteContentListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await siteContentService.listAdmin(authContext, query.data));
  }

  @Post("/platform/site-content")
  async createEntry(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentManageContext(request);
    const body = CreateSiteContentEntrySchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await siteContentService.createEntry(authContext, body.data));
  }

  @Get("/platform/site-content/:id")
  async getAdminDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentReadContext(request);
    const params = this.parseId(request.params);
    return ResponseHandler.success(await siteContentService.getAdminDetail(authContext, params.id));
  }

  @Patch("/platform/site-content/:id")
  async updateEntry(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentManageContext(request);
    const params = this.parseId(request.params);
    const body = UpdateSiteContentEntrySchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await siteContentService.updateEntry(authContext, params.id, body.data));
  }

  @Get("/platform/site-content/:id/versions")
  async listVersions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentReadContext(request);
    const params = this.parseId(request.params);
    const query = SiteContentPaginationQuerySchema.safeParse(request.query ?? {});
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await siteContentService.listVersions(authContext, params.id, query.data));
  }

  @Post("/platform/site-content/:id/versions")
  async createVersion(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentManageContext(request);
    const params = this.parseId(request.params);
    const body = CreateSiteContentVersionSchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await siteContentService.createVersion(authContext, params.id, body.data));
  }

  @Post("/platform/site-content/:id/publish")
  async publish(request: FastifyRequest, reply: FastifyReply) {
    return this.runVersionAction("publish", request);
  }

  @Post("/platform/site-content/:id/rollback")
  async rollback(request: FastifyRequest, reply: FastifyReply) {
    return this.runVersionAction("rollback", request);
  }

  @Post("/platform/site-content/:id/archive")
  async archive(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentPublishContext(request);
    const params = this.parseId(request.params);
    return ResponseHandler.success(await siteContentService.archive(authContext, params.id));
  }

  @Post("/platform/site-content/:id/preview-token")
  async createPreviewToken(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSiteContentReadContext(request);
    const params = this.parseId(request.params);
    const body = CreateSitePreviewTokenSchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(
      await siteContentService.createPreviewToken(authContext, params.id, body.data.versionId),
    );
  }

  @Post("/internal/site-content/preview/consume")
  async consumePreviewToken(request: FastifyRequest, reply: FastifyReply) {
    this.assertPreviewSignature(request, request.body ?? {});
    const body = ConsumeSitePreviewTokenSchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await siteContentService.consumePreviewToken(body.data.token));
  }

  @Get("/internal/site-content/versions/:id/preview")
  async getPreviewVersion(request: FastifyRequest, reply: FastifyReply) {
    this.assertPreviewSignature(request, request.params ?? {});
    const params = this.parseId(request.params);
    return ResponseHandler.success(await siteContentService.getPreviewVersion(params.id));
  }

  private async listPublic(contentType: SiteContentType, request: FastifyRequest) {
    const query = SiteContentPaginationQuerySchema.safeParse(request.query ?? {});
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await siteContentService.listPublic(contentType, query.data));
  }

  private async getPublic(contentType: SiteContentType, request: FastifyRequest) {
    const params = SiteContentSlugParamSchema.safeParse(request.params ?? {});
    if (!params.success) throw Errors.fromZod(params.error);
    return ResponseHandler.success(await siteContentService.getPublic(contentType, params.data.slug));
  }

  private parseId(input: unknown) {
    const params = SiteContentIdParamSchema.safeParse(input ?? {});
    if (!params.success) throw Errors.fromZod(params.error);
    return params.data;
  }

  private async runVersionAction(action: "publish" | "rollback", request: FastifyRequest) {
    const authContext = await this.getSiteContentPublishContext(request);
    const params = this.parseId(request.params);
    const body = SiteContentVersionActionSchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);
    const result = action === "publish"
      ? await siteContentService.publish(authContext, params.id, body.data.versionId)
      : await siteContentService.rollback(authContext, params.id, body.data.versionId);
    return ResponseHandler.success(result);
  }

  private getSiteContentReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.site_content.read");
  }

  private getSiteContentManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.site_content.manage");
  }

  private getSiteContentPublishContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.site_content.publish");
  }

  private assertPreviewSignature(request: FastifyRequest, payload: unknown) {
    const secret = process.env.GOOES_PREVIEW_SHARED_SECRET?.trim();
    const rawSignature = request.headers["x-gooes-preview-signature"];
    const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
    const rawTimestamp = request.headers["x-gooes-preview-timestamp"];
    const timestamp = Array.isArray(rawTimestamp) ? rawTimestamp[0] : rawTimestamp;
    const path = request.url.split("?")[0] ?? request.url;
    const body = request.method.toUpperCase() === "GET" || request.method.toUpperCase() === "HEAD"
      ? ""
      : JSON.stringify(payload);
    // Task8 Web BFF must sign timestamp + uppercase method + exact path + SHA256(body).
    if (
      !secret || secret.length < 32 || typeof signature !== "string" || typeof timestamp !== "string"
      || !verifySiteContentPreviewRequest({
        secret,
        signature,
        timestamp,
        method: request.method,
        path,
        body,
        nowSeconds: Math.floor(Date.now() / 1000),
      })
    ) {
      throw Errors.business(401, "Preview 内部签名无效", "INVALID_PREVIEW_SIGNATURE");
    }
  }
}

export default new SiteContentController();
