import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Post } from "@/utils/decorators/route";
import { SupabaseDB } from "@/utils/supabase";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";

const PROJECT_LOGS_BUCKET = "project-logs";
const MAX_UPLOAD_FILES = 9;
const MAX_UPLOAD_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_UPLOAD_SCENES = ["project_log", "expense_request", "referral_payment", "employee_avatar"] as const;

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
      throw Errors.fromZod(fieldResult.error);
    }

    const uploadedFiles = await Promise.all(
      files.map((file) => this.uploadSingleFile(file, fieldResult.data.project_id)),
    );

    return ResponseHandler.success({
      list: uploadedFiles,
    });
  }

  private async uploadSingleFile(file: PendingUploadFile, projectId?: string) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw Errors.badRequest("仅支持 jpg、png、webp、heic、heif 图片");
    }

    if (file.buffer.length > MAX_UPLOAD_FILE_SIZE) {
      throw Errors.badRequest("单张图片不能超过 2MB");
    }

    const extension = this.getFileExtension(file);
    const objectPath = this.buildObjectPath(projectId, extension);

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

  private buildObjectPath(projectId: string | undefined, extension: string) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const prefix = projectId?.trim() || "unassigned";

    return `${prefix}/${year}/${month}/${day}/${randomUUID()}${extension}`;
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
