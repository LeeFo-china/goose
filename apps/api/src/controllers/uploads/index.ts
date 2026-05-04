import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { Post } from "@/utils/decorators/route";
import { SupabaseDB } from "@/utils/supabase";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";

const PROJECT_LOGS_BUCKET = "project-logs";
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
] as const;

const UploadImageFieldSchema = z.object({
  scene: z.enum(ALLOWED_UPLOAD_SCENES, {
    message: "无效的上传场景",
  }).optional(),
  project_id: z.string().uuid("无效的项目ID").optional(),
});

type UploadImageItem = {
  url: string;
  path: string;
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

    const uploadedFiles = await Promise.all(
      files.map((file) =>
        this.uploadSingleFile(file, {
          projectId: fieldResult.data.project_id,
          scene: fieldResult.data.scene ?? "project_log",
        })
      ),
    );

    return ResponseHandler.success({
      list: uploadedFiles,
    });
  }

  private async uploadSingleFile(
    file: PendingUploadFile,
    options: { projectId?: string; scene: UploadScene },
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw Errors.badRequest("仅支持 jpg、png、webp、heic、heif 图片");
    }

    const maxUploadFileSize = this.getMaxUploadFileSize(options.scene);
    if (file.buffer.length > maxUploadFileSize) {
      throw Errors.badRequest(
        `单张图片不能超过 ${Math.floor(maxUploadFileSize / 1024 / 1024)}MB`,
      );
    }

    const extension = this.getFileExtension(file);
    const objectPath = this.buildObjectPath(options, extension);

    const { error } = await SupabaseDB.getAdminClient()
      .storage
      .from(PROJECT_LOGS_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw Errors.dbError("上传图片失败", error);
    }

    const { data } = SupabaseDB.getAdminClient()
      .storage
      .from(PROJECT_LOGS_BUCKET)
      .getPublicUrl(objectPath);

    return {
      url: data.publicUrl,
      path: objectPath,
    };
  }

  private buildObjectPath(
    options: { projectId?: string; scene: UploadScene },
    extension: string,
  ) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const prefixByScene: Record<UploadScene, string> = {
      project_log: options.projectId?.trim() || "unassigned",
      project_log_comment: "project-log-comment",
      customer_follow_up_comment: "customer-follow-up-comment",
      expense_request: "expense-request",
      referral_payment: "referral-payment",
      employee_avatar: "employee-avatar",
      customer_avatar: "customer-avatar",
      customer_douyin_screenshot: "customer-douyin-screenshots",
      h5_marketing_page: "h5-marketing-pages",
    };
    const prefix = prefixByScene[options.scene];

    return `${prefix}/${year}/${month}/${day}/${randomUUID()}${extension}`;
  }

  private getMaxUploadFileSize(scene: UploadScene) {
    return scene === "h5_marketing_page"
      ? H5_MARKETING_MAX_UPLOAD_FILE_SIZE
      : DEFAULT_MAX_UPLOAD_FILE_SIZE;
  }

  private getFileExtension(file: Pick<PendingUploadFile, "filename" | "mimetype">) {
    const filenameExtension = extname(file.filename || "").toLowerCase();
    if (filenameExtension) {
      return filenameExtension;
    }

    const mimeToExtension: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/heic": ".heic",
      "image/heif": ".heif",
    };

    return mimeToExtension[file.mimetype] || ".jpg";
  }
}

export default new UploadController();
