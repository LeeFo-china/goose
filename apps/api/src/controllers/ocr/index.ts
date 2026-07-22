import { TenantBaseController } from "@/controllers/TenantBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  CreateOcrRecognitionSchema,
  OcrCapabilitiesQuerySchema,
  OcrRecognitionParamsSchema,
  PlatformOcrConfigTestSchema,
  PlatformOcrRecognitionListQuerySchema,
} from "@/schema/ocr";
import { ocrService } from "@/services/ocr";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class OcrController extends TenantBaseController {
  constructor() {
    super("ocr_recognitions");
  }

  @Get("/ocr/capabilities")
  async listCapabilities(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const parsed = OcrCapabilitiesQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    // Server-owned auxiliary catalog is guaranteed to contain at most 50 entries.
    return ResponseHandler.success(
      await ocrService.listCapabilities(authContext, parsed.data.scene),
    );
  }

  @Post("/ocr/recognitions")
  async createRecognition(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const parsed = CreateOcrRecognitionSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(
      await ocrService.recognize(authContext, parsed.data),
    );
  }

  @Get("/ocr/recognitions/:id")
  async getRecognition(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const parsed = OcrRecognitionParamsSchema.safeParse(request.params);
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(
      await ocrService.getTenantRecognition(authContext, parsed.data.id),
    );
  }

  @Get("/platform/ocr/recognitions")
  async listPlatformRecognitions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformContext(request);
    const parsed = PlatformOcrRecognitionListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(await ocrService.listPlatformRecognitions(
      authContext,
      {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        status: parsed.data.status,
        documentType: parsed.data.document_type,
        tenantId: parsed.data.tenant_id,
      },
    ));
  }

  @Post("/platform/ocr/config-test")
  async testPlatformConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformContext(request);
    if (!request.isMultipart()) {
      throw Errors.badRequest("请上传测试图片");
    }
    const part = await this.readConfigTestFile(request);
    const bytes = await this.readBoundedBuffer(part);
    const parsed = PlatformOcrConfigTestSchema.safeParse({
      mimetype: part.mimetype,
      size_bytes: bytes.byteLength,
    });
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(await ocrService.testPlatformConfig(
      authContext,
      { imageBase64: bytes.toString("base64") },
    ));
  }

  private async getRequiredPlatformContext(request: FastifyRequest) {
    const authContext = await this.getRequiredAuthContext(request);
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
    return authContext;
  }

  private async readConfigTestFile(request: FastifyRequest) {
    const part = await request.file({
      limits: { files: 1, fileSize: 2 * 1024 * 1024 },
      throwFileSizeLimit: true,
    });
    if (!part) throw Errors.badRequest("请上传测试图片");
    return part;
  }

  private async readBoundedBuffer(part: Awaited<ReturnType<FastifyRequest["file"]>>) {
    if (!part) throw Errors.badRequest("请上传测试图片");
    try {
      return await part.toBuffer();
    } catch {
      throw Errors.business(400, "测试图片不能超过 2MB", ErrorCodes.OCR_FILE_TOO_LARGE);
    }
  }
}

export default new OcrController();
