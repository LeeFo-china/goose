import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePictureAssetSchema,
  CreatePictureCategorySchema,
  PictureAssetListQuerySchema,
  PictureCategoryListQuerySchema,
  PictureCommentListQuerySchema,
  PictureLibraryHealthQuerySchema,
  PictureLibraryIdParamsSchema,
  UpdatePictureAssetSchema,
  UpdatePictureCategorySchema,
} from "@/schema/picture-library";
import { pictureLibraryHealthService } from "@/services/picture-library-health";
import { pictureLibraryService } from "@/services/picture-library";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PictureLibraryController extends PlatformBaseController {
  constructor() {
    super("picture-library");
  }

  @Get("/platform/picture-library/categories")
  async listCategories(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PictureCategoryListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await pictureLibraryService.listCategories(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/categories")
  async createCategory(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = CreatePictureCategorySchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await pictureLibraryService.createCategory(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/picture-library/categories/:id")
  async updateCategory(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdatePictureCategorySchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await pictureLibraryService.updateCategory(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Delete("/platform/picture-library/categories/:id")
  async disableCategory(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryService.disableCategory(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/picture-library/assets")
  async listAssets(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PictureAssetListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await pictureLibraryService.listAssets(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/assets")
  async createAsset(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = CreatePictureAssetSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await pictureLibraryService.createAsset(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/picture-library/assets/:id")
  async updateAsset(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdatePictureAssetSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await pictureLibraryService.updateAsset(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/assets/:id/publish")
  async publishAsset(request: FastifyRequest, reply: FastifyReply) {
    return this.updateAssetStatus(request, "published");
  }

  @Post("/platform/picture-library/assets/:id/hide")
  async hideAsset(request: FastifyRequest, reply: FastifyReply) {
    return this.updateAssetStatus(request, "hidden");
  }

  @Delete("/platform/picture-library/assets/:id")
  async deleteAsset(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryService.deleteAsset(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/picture-library/comments")
  async listComments(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PictureCommentListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await pictureLibraryService.listComments(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/picture-library/health")
  async getHealthReport(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PictureLibraryHealthQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await pictureLibraryHealthService.buildReport({
      authContext,
      issueLimit: queryResult.data.issue_limit,
    });
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/health/assets/:id/repair-comment-count")
  async repairAssetCommentCount(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryHealthService.repairAssetCommentCount(
      paramsResult.data.id,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/health/categories/:id/set-cover-from-first-published")
  async setCategoryCoverFromFirstPublishedAsset(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryHealthService.setCategoryCoverFromFirstPublishedAsset(
      paramsResult.data.id,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/comments/:id/hide")
  async hideComment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryService.hideComment(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/picture-library/comments/:id/show")
  async showComment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryService.showComment(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Delete("/platform/picture-library/comments/:id")
  async deleteComment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryService.deleteComment(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  private async updateAssetStatus(
    request: FastifyRequest,
    status: "published" | "hidden",
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PictureLibraryIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await pictureLibraryService.updateAssetStatus(
      paramsResult.data.id,
      status,
      authContext,
    );
    return ResponseHandler.success(data);
  }
}

export default new PictureLibraryController();
