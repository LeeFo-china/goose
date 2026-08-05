import { TenantBaseController } from "@/controllers/TenantBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  CreateOcrRecognitionSchema,
  CreatePlatformOcrRecognitionSchema,
  OcrCapabilitiesQuerySchema,
  OcrRecognitionParamsSchema,
  PlatformOcrConfigTestSchema,
  PlatformOcrRecognitionListQuerySchema,
  PlatformOcrTenantPolicyListQuerySchema,
  PlatformOcrTenantPolicyParamsSchema,
  UpdatePlatformOcrTenantPolicySchema,
} from "@/schema/ocr";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { ocrService, ocrTenantPolicyService, platformOcrService } from "@/services/ocr";
import { Get, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { PermissionCode } from "@gooes/domain";
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
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.recognition.read",
    );
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

  @Get("/platform/ocr/capabilities")
  async listPlatformCapabilities(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.recognize",
    );
    const parsed = OcrCapabilitiesQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    // Server-owned auxiliary catalog is guaranteed to contain at most 50 entries.
    return ResponseHandler.success(
      await platformOcrService.listCapabilities(authContext, parsed.data.scene),
    );
  }

  @Post("/platform/ocr/recognitions")
  async createPlatformRecognition(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.recognize",
    );
    const parsed = CreatePlatformOcrRecognitionSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(
      await platformOcrService.recognize(authContext, parsed.data),
    );
  }

  @Get("/platform/ocr/recognitions/:id/result")
  async getPlatformRecognitionResult(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.recognize",
    );
    const parsed = OcrRecognitionParamsSchema.safeParse(request.params);
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(
      await platformOcrService.getRecognitionResult(authContext, parsed.data.id),
    );
  }

  @Get("/platform/ocr/tenant-policies")
  async listPlatformTenantPolicies(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.recognition.read",
    );
    const parsed = PlatformOcrTenantPolicyListQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(await ocrTenantPolicyService.listPlatform(
      authContext,
      parsed.data,
    ));
  }

  @Put("/platform/ocr/tenant-policies/:tenantId")
  async updatePlatformTenantPolicy(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.tenant_policy.manage",
    );
    const params = PlatformOcrTenantPolicyParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const body = UpdatePlatformOcrTenantPolicySchema.safeParse(request.body ?? {});
    if (!body.success) throw Errors.fromZod(body.error);

    return ResponseHandler.success(await ocrTenantPolicyService.updatePlatform(
      authContext,
      params.data.tenantId,
      body.data,
    ));
  }

  @Post("/platform/ocr/config-test")
  async testPlatformConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.ocr.recognize",
    );
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

  private async getRequiredPlatformPermissionContext(
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
