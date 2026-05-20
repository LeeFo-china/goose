import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { platformFileStorageService } from "@/services/files/platform-file-storage";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { uploadService } from "@/services/uploads";
import type { JwtPayload } from "@/utils/jwt";
import { logUploadTiming } from "@/utils/upload-timing-logger";
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

const DIRECT_UPLOAD_SCENES = [
  "project_log",
  "project_log_comment",
  "employee_avatar",
  "customer_avatar",
  "project_acceptance",
  "expense_request",
] as const;
const UPLOAD_IMAGES_TIMING_PREFIX = "[UPLOAD_IMAGES_TIMING]";

const DirectUploadInitSchema = z.object({
  scene: z.enum(DIRECT_UPLOAD_SCENES, {
    message: "当前场景暂不支持直传",
  }),
  project_id: z.string().uuid("无效的项目ID").optional(),
  filename: z.string().trim().max(200, "文件名过长").optional(),
  mimetype: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ], {
    message: "仅支持 jpg、png、webp、heic、heif 图片",
  }),
  size_bytes: z.number().int().positive("图片大小无效"),
});

const DirectUploadCompleteSchema = DirectUploadInitSchema.extend({
  object_key: z.string()
    .trim()
    .min(1, "缺少对象路径")
    .max(1000, "对象路径过长")
    .refine((value) => !value.includes(".."), "对象路径不合法")
    .refine((value) => !value.startsWith("/"), "对象路径不合法")
    .refine((value) => !value.includes("\\"), "对象路径不合法"),
  etag: z.string().trim().max(200, "ETag 过长").optional(),
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
  storage_path?: string;
  public_url?: string;
};

type UploadScene = (typeof ALLOWED_UPLOAD_SCENES)[number];

type PendingUploadFile = {
  buffer: Buffer;
  filename?: string;
  mimetype: string;
};

type UploadActorContext = {
  tenantId: string | null;
  employeeId: string | null;
  customerId: string | null;
};

function logUploadImagesTiming(
  stage: string,
  startedAt: number,
  extra: Record<string, unknown> = {},
) {
  logUploadTiming(UPLOAD_IMAGES_TIMING_PREFIX, stage, startedAt, extra);
}

const now = () => Date.now();

class UploadController extends BaseController {
  constructor() {
    super("uploads");
  }

  @Post("/uploads/images")
  async uploadImages(request: FastifyRequest, reply: FastifyReply) {
    const requestStartedAt = now();
    if (!request.user?.sub) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    if (!request.isMultipart()) {
      throw Errors.badRequest("请求必须为 multipart/form-data");
    }

    const fields: Record<string, string> = {};
    const files: PendingUploadFile[] = [];
    let fileCount = 0;
    const multipartStartedAt = now();

    for await (const part of request.parts()) {
      if (part.type === "field") {
        fields[part.fieldname] = String(part.value ?? "");
        continue;
      }

      fileCount += 1;
      if (fileCount > MAX_UPLOAD_FILES) {
        throw Errors.badRequest("最多上传9张图片");
      }

      const readStartedAt = now();
      const buffer = await part.toBuffer();
      logUploadImagesTiming("multipart-file-read", readStartedAt, {
        request_id: request.id,
        file_index: fileCount,
        size_bytes: buffer.length,
        mimetype: part.mimetype,
      });
      files.push({
        buffer,
        filename: part.filename,
        mimetype: part.mimetype,
      });
    }
    logUploadImagesTiming("multipart-read-total", multipartStartedAt, {
      request_id: request.id,
      file_count: files.length,
      total_size_bytes: files.reduce((sum, file) => sum + file.buffer.length, 0),
      raw_scene: fields.scene || null,
    });

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

    const actorStartedAt = now();
    const actorContext = await this.resolveUploadActorContext(request.user);
    logUploadImagesTiming("actor-context", actorStartedAt, {
      request_id: request.id,
      tenant_id: actorContext.tenantId,
      employee_id: actorContext.employeeId,
      customer_id: actorContext.customerId,
    });

    const uploadedFiles = await Promise.all(
      files.map(async (file, index) => {
        const uploadStartedAt = now();
        const uploaded = await this.uploadSingleFile(file, {
          authUserId: request.user?.sub,
          employeeId: actorContext.employeeId,
          customerId: actorContext.customerId,
          projectId: fieldResult.data.project_id,
          scene: fieldResult.data.scene ?? "project_log",
          tenantId: actorContext.tenantId,
        });
        logUploadImagesTiming("file-upload", uploadStartedAt, {
          request_id: request.id,
          file_index: index + 1,
          file_count: files.length,
          size_bytes: file.buffer.length,
          scene: fieldResult.data.scene ?? "project_log",
          provider: uploaded.provider,
          object_key: uploaded.object_key,
        });
        return uploaded;
      }),
    );
    logUploadImagesTiming("request-total", requestStartedAt, {
      request_id: request.id,
      file_count: files.length,
      total_size_bytes: files.reduce((sum, file) => sum + file.buffer.length, 0),
      scene: fieldResult.data.scene ?? "project_log",
      tenant_id: actorContext.tenantId,
    });

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

  @Post("/uploads/cos/direct-init")
  async initDirectCosUpload(request: FastifyRequest, reply: FastifyReply) {
    const requestStartedAt = now();
    if (!request.user?.sub) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const result = DirectUploadInitSchema.safeParse(request.body || {});
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const scene = result.data.scene;
    this.assertAllowedFile(result.data.mimetype, result.data.size_bytes, scene);
    const actorContext = await this.resolveUploadActorContext(request.user);
    await this.assertDirectUploadProjectAccess(
      request.user,
      scene,
      result.data.project_id,
      actorContext,
    );
    const directUpload = await platformFileStorageService.createDirectUpload({
      filename: result.data.filename,
      mimetype: result.data.mimetype,
      sizeBytes: result.data.size_bytes,
      scene,
      projectId: result.data.project_id,
      tenantId: actorContext.tenantId,
      authUserId: request.user.sub,
      employeeId: actorContext.employeeId,
      customerId: actorContext.customerId,
    });
    logUploadImagesTiming("direct-init-total", requestStartedAt, {
      request_id: request.id,
      scene,
      tenant_id: actorContext.tenantId,
      size_bytes: result.data.size_bytes,
      object_key: directUpload.object_key,
    });

    return ResponseHandler.success(directUpload);
  }

  @Post("/uploads/cos/direct-complete")
  async completeDirectCosUpload(request: FastifyRequest, reply: FastifyReply) {
    const requestStartedAt = now();
    if (!request.user?.sub) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const result = DirectUploadCompleteSchema.safeParse(request.body || {});
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const scene = result.data.scene;
    this.assertAllowedFile(result.data.mimetype, result.data.size_bytes, scene);
    const actorContext = await this.resolveUploadActorContext(request.user);
    await this.assertDirectUploadProjectAccess(
      request.user,
      scene,
      result.data.project_id,
      actorContext,
    );
    this.assertDirectObjectKeyBelongsToActor(
      result.data.object_key,
      scene,
      actorContext,
    );

    const uploaded = await platformFileStorageService.completeDirectUpload({
      filename: result.data.filename,
      mimetype: result.data.mimetype,
      sizeBytes: result.data.size_bytes,
      scene,
      projectId: result.data.project_id,
      tenantId: actorContext.tenantId,
      authUserId: request.user.sub,
      employeeId: actorContext.employeeId,
      customerId: actorContext.customerId,
      objectKey: result.data.object_key,
      etag: result.data.etag,
    });
    logUploadImagesTiming("direct-complete-total", requestStartedAt, {
      request_id: request.id,
      scene,
      tenant_id: actorContext.tenantId,
      size_bytes: result.data.size_bytes,
      object_key: result.data.object_key,
      provider: uploaded.provider,
      file_id: uploaded.file_id,
    });

    return ResponseHandler.success(uploaded);
  }

  private async uploadSingleFile(
    file: PendingUploadFile,
    options: {
      authUserId?: string | null;
      employeeId?: string | null;
      customerId?: string | null;
      projectId?: string;
      scene: UploadScene;
      tenantId?: string | null;
    },
  ): Promise<UploadImageItem> {
    this.assertAllowedFile(file.mimetype, file.buffer.length, options.scene);

    return platformFileStorageService.uploadImage({
      buffer: file.buffer,
      filename: file.filename,
      mimetype: file.mimetype,
      scene: options.scene,
      projectId: options.projectId,
      tenantId: options.tenantId,
      authUserId: options.authUserId,
      employeeId: options.employeeId,
      customerId: options.customerId,
    });
  }

  private assertAllowedFile(mimetype: string, sizeBytes: number, scene: UploadScene) {
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw Errors.badRequest("仅支持 jpg、png、webp、heic、heif 图片");
    }

    const maxUploadFileSize = this.getMaxUploadFileSize(scene);
    if (sizeBytes > maxUploadFileSize) {
      throw Errors.badRequest(
        `单张图片不能超过 ${Math.floor(maxUploadFileSize / 1024 / 1024)}MB`,
      );
    }
  }

  private assertDirectObjectKeyBelongsToActor(
    objectKey: string,
    scene: UploadScene,
    actorContext: UploadActorContext,
  ) {
    const scenePrefix = scene.replace(/_/g, "-");
    const expectedPrefix = actorContext.tenantId
      ? `tenants/${actorContext.tenantId}/${scenePrefix}/`
      : `public/${scenePrefix}/`;

    if (!objectKey.startsWith(expectedPrefix)) {
      throw Errors.business(403, "上传对象不属于当前登录身份", ErrorCodes.FORBIDDEN);
    }
  }

  private async assertDirectUploadProjectAccess(
    user: JwtPayload,
    scene: UploadScene,
    projectId: string | undefined,
    actorContext: UploadActorContext,
  ) {
    if (scene !== "project_log") return;

    if (!projectId) {
      throw Errors.badRequest("缺少项目ID");
    }

    if (!actorContext.employeeId) {
      throw Errors.forbidden();
    }

    const authContext = await authorizationService.getRequiredAuthContext(user.sub);
    const canWriteLog = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project_log.create",
    );
    if (!canWriteLog) {
      throw Errors.forbidden();
    }
  }

  private async resolveUploadActorContext(user: JwtPayload): Promise<UploadActorContext> {
    const tokenTenantId = user.tenant_id ?? null;
    const tokenEmployeeId = user.employee_id ?? null;
    const tokenCustomerId = user.customer_id ?? null;

    if (tokenTenantId && tokenEmployeeId) {
      return {
        tenantId: tokenTenantId,
        employeeId: tokenEmployeeId,
        customerId: null,
      };
    }

    if (tokenTenantId && tokenCustomerId) {
      return {
        tenantId: tokenTenantId,
        employeeId: null,
        customerId: tokenCustomerId,
      };
    }

    const authUserId = user.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }
    const authContext = await authorizationService.getRequiredAuthContext(authUserId);
    if (authContext.tenantId || authContext.employeeId) {
      return {
        tenantId: authContext.tenantId,
        employeeId: authContext.employeeId,
        customerId: null,
      };
    }

    const membership = await uploadService.findDefaultActiveCustomerMembership(authUserId);
    if (membership) {
      return {
        tenantId: membership.tenant_id,
        employeeId: null,
        customerId: membership.identity_id,
      };
    }

    const customer = await this.findLegacyCustomerBinding(authUserId);
    return {
      tenantId: customer?.tenant_id ?? null,
      employeeId: null,
      customerId: customer?.id ?? null,
    };
  }

  private async findLegacyCustomerBinding(authUserId: string) {
    return uploadService.findLegacyCustomerBinding(authUserId);
  }

  private getMaxUploadFileSize(scene: UploadScene) {
    return scene === "h5_marketing_page"
      ? H5_MARKETING_MAX_UPLOAD_FILE_SIZE
      : DEFAULT_MAX_UPLOAD_FILE_SIZE;
  }

}

export default new UploadController();
