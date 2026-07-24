import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { uploadService } from "@/services/uploads";
import { Get } from "@/utils/decorators/route";

const UploadPreviewParamsSchema = z.object({
  id: z.string().uuid("无效的文件 ID"),
});

class UploadPreviewController extends TenantBaseController {
  constructor() {
    super("upload_previews");
  }

  @Get("/uploads/files/:id/preview")
  async getWechatPayApplymentPreview(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const parsed = UploadPreviewParamsSchema.safeParse(request.params);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const previewUrl = await uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext,
      fileObjectId: parsed.data.id,
    });
    reply.header("Cache-Control", "private, no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    reply.header("Referrer-Policy", "no-referrer");
    return reply.redirect(previewUrl);
  }
}

export default new UploadPreviewController();
