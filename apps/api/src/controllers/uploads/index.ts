import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { platformFileStorageService } from "@/services/files/platform-file-storage";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { z } from "zod";

const MAX_UPLOAD_FILES = 9;
const DEFAULT_MAX_UPLOAD_FILE_SIZE = 2 * 1024 * 1024;
const H5_MARKETING_MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_UPLOAD_SCENES = [
  "project_log",
  "project_log_comment",
  "customer_follow_up_comment",
  "expense_request",
  "referral_payment",
  "employee_avatar",
  "customer_avatar",
  "customer_douyin_screenshot",
  "h5_marketing_page",
  "project_acceptance",
] as const;

const UploadImageFieldSchema = z.object({
  scene: z.enum(ALLOWED_UPLOAD_SCENES, {
    message: "无效的上传场景",
  }).optional(),
  project_id: z.string().uuid("无效的项目ID").optional(),
});

const UploadPublicUrlQuerySchema = z.object({
  path: z.string()
    .trim()
    .min(1, "缺少图片路径")
    .max(500, "图片路径过长")
    .refine((value) => !value.includes(".."), "图片路径不合法")
    .refine((value) => !value.startsWith("/"), "图片路径不合法"),
});

type UploadImageItem = {
  url: string;
  path: string;
  file_id?: string;
  provider?: string;
  bucket?: string;
  region?: string | null;
  object_key?: string;
};

type UploadScene = (typeof ALLOWED_UPLOAD_SCENES)[number];

type PendingUploadFile = {
  buffer: Buffer;
  filename?: string;
  mimetype: string;
};

class UploadController extends BaseController {
  constructor() {
    super("uploads");
  }

  @Post("/uploads/images")
  async uploadImages(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.sub) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    if (!request.isMultipart()) {
      throw Errors.badRequest("请求必须为 multipart/form-data");
    }

    const fields: Record<string, string> = {};
    const files: PendingUploadFile[] = [];
    let fileCount = 0;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        fields[part.fieldname] = String(part.value ?? "");
        continue;
      }

      fileCount += 1;
      if (fileCount > MAX_UPLOAD_FILES) {
        throw Errors.badRequest("最多上传9张图片");
      }

      files.push({
        buffer: await part.toBuffer(),
        filename: part.filename,
        mimetype: part.mimetype,
      });
    }

    const fieldResult = UploadImageFieldSchema.safeParse(fields);
    if (!fieldResult.success) {
      const hasInvalidScene = fieldResult.error.issues.some((issue) =>
        issue.path[0] === "scene"
      );
      if (hasInvalidScene) {
        throw Errors.business(
          400,
          "不支持的上传场景",
          ErrorCodes.UPLOAD_SCENE_INVALID,
          fieldResult.error.issues,
        );
      }

      throw Errors.fromZod(fieldResult.error);
    }

    const authContext = await authorizationService.getRequiredAuthContext(
      request.user.sub,
    );

    const uploadedFiles = await Promise.all(
      files.map((file) =>
        this.uploadSingleFile(file, {
          authUserId: request.user?.sub,
          employeeId: authContext.employeeId,
          projectId: fieldResult.data.project_id,
          scene: fieldResult.data.scene ?? "project_log",
          tenantId: authContext.tenantId,
        })
      ),
    );

    return ResponseHandler.success({
      list: uploadedFiles,
    });
  }

  @Get("/uploads/public-url")
  async getPublicUrl(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.sub) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const queryResult = UploadPublicUrlQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const publicUrl = resolveStoredFileUrl(queryResult.data.path);
    if (!publicUrl) {
      throw Errors.badRequest("图片路径不合法");
    }

    return reply.redirect(publicUrl);
  }

  private async uploadSingleFile(
    file: PendingUploadFile,
    options: {
      authUserId?: string | null;
      employeeId?: string | null;
      projectId?: string;
      scene: UploadScene;
      tenantId?: string | null;
    },
  ): Promise<UploadImageItem> {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw Errors.badRequest("仅支持 jpg、png、webp、heic、heif 图片");
    }

    const maxUploadFileSize = this.getMaxUploadFileSize(options.scene);
    if (file.buffer.length > maxUploadFileSize) {
      throw Errors.badRequest(
        `单张图片不能超过 ${Math.floor(maxUploadFileSize / 1024 / 1024)}MB`,
      );
    }

    return platformFileStorageService.uploadImage({
      buffer: file.buffer,
      filename: file.filename,
      mimetype: file.mimetype,
      scene: options.scene,
      projectId: options.projectId,
      tenantId: options.tenantId,
      authUserId: options.authUserId,
      employeeId: options.employeeId,
    });
  }

  private getMaxUploadFileSize(scene: UploadScene) {
    return scene === "h5_marketing_page"
      ? H5_MARKETING_MAX_UPLOAD_FILE_SIZE
      : DEFAULT_MAX_UPLOAD_FILE_SIZE;
  }

}

export default new UploadController();
