import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateVisitorPictureCommentSchema,
  CreateVisitorPictureShareEventSchema,
  VisitorPictureAssetListQuerySchema,
  VisitorPictureAssetParamsSchema,
  VisitorPictureCommentListQuerySchema,
} from "@/schema/visitor-picture-library";
import { visitorPictureLibraryService } from "@/services/visitor-picture-library";
import { Delete, Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class VisitorPictureLibraryController extends BaseController {
  constructor() {
    super("picture_assets");
  }

  @Get("/visitor/picture-library/categories")
  async listCategories(request: FastifyRequest, reply: FastifyReply) {
    const data = await visitorPictureLibraryService.listCategories();
    return ResponseHandler.success(data);
  }

  @Get("/visitor/picture-library/assets")
  async listAssets(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = VisitorPictureAssetListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await visitorPictureLibraryService.listAssets(
      queryResult.data,
      this.getOptionalVisitorId(request),
    );
    return ResponseHandler.success(data);
  }

  @Get("/visitor/picture-library/assets/:id")
  async getAssetDetail(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorPictureLibraryService.getAssetDetail(
      paramsResult.data.id,
      this.getOptionalVisitorId(request),
    );
    return ResponseHandler.success(data);
  }

  @Post("/visitor/picture-library/assets/:id/like")
  async likeAsset(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorPictureLibraryService.setLike({
      assetId: paramsResult.data.id,
      visitorId,
      liked: true,
    });
    return ResponseHandler.success(data);
  }

  @Delete("/visitor/picture-library/assets/:id/like")
  async unlikeAsset(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorPictureLibraryService.setLike({
      assetId: paramsResult.data.id,
      visitorId,
      liked: false,
    });
    return ResponseHandler.success(data);
  }

  @Post("/visitor/picture-library/assets/:id/favorite")
  async favoriteAsset(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorPictureLibraryService.setFavorite({
      assetId: paramsResult.data.id,
      visitorId,
      favorited: true,
    });
    return ResponseHandler.success(data);
  }

  @Get("/visitor/picture-library/assets/:id/comments")
  async listComments(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = VisitorPictureCommentListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await visitorPictureLibraryService.listComments(
      paramsResult.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/visitor/picture-library/assets/:id/comments")
  async createComment(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateVisitorPictureCommentSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await visitorPictureLibraryService.createComment({
      assetId: paramsResult.data.id,
      visitorId,
      body: bodyResult.data,
    });
    return ResponseHandler.success(data);
  }

  @Post("/visitor/picture-library/assets/:id/share-events")
  async recordShareEvent(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateVisitorPictureShareEventSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await visitorPictureLibraryService.recordShareEvent({
      assetId: paramsResult.data.id,
      visitorId,
      body: bodyResult.data,
    });
    return ResponseHandler.success(data);
  }

  @Delete("/visitor/picture-library/assets/:id/favorite")
  async unfavoriteAsset(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = this.getRequiredVisitorId(request);
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorPictureLibraryService.setFavorite({
      assetId: paramsResult.data.id,
      visitorId,
      favorited: false,
    });
    return ResponseHandler.success(data);
  }

  private getOptionalVisitorId(request: FastifyRequest) {
    const user = request.user;
    return user?.token_type === "visitor_session" && user.visitor_id
      ? user.visitor_id
      : null;
  }

  private getRequiredVisitorId(request: FastifyRequest) {
    const visitorId = this.getOptionalVisitorId(request);
    if (!visitorId) {
      throw Errors.unauthorized("请使用 visitor 登录态");
    }
    return visitorId;
  }
}

export default new VisitorPictureLibraryController();
