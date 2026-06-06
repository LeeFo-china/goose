import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  VisitorPictureAssetListQuerySchema,
  VisitorPictureAssetParamsSchema,
} from "@/schema/visitor-picture-library";
import { visitorPictureLibraryService } from "@/services/visitor-picture-library";
import { Get } from "@/utils/decorators/route";
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

    const data = await visitorPictureLibraryService.listAssets(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/visitor/picture-library/assets/:id")
  async getAssetDetail(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = VisitorPictureAssetParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await visitorPictureLibraryService.getAssetDetail(paramsResult.data.id);
    return ResponseHandler.success(data);
  }
}

export default new VisitorPictureLibraryController();
