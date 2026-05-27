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

const DEFAULT_MAX_UPLOAD_FILE_SIZE = 2 * 1024 * 1024;
const H5_MARKETING_MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const DIRECT_UPLOAD_SCENES = [
  "project_log",
  "project_log_comment",
  "customer_follow_up_comment",
  "customer_service",
  "expense_request",
  "referral_payment",
  "employee_avatar",
  "customer_avatar",
  "customer_douyin_screenshot",
  "h5_marketing_page",
  "project_acceptance",
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

type UploadScene = (typeof DIRECT_UPLOAD_SCENES)[number];

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
    const canWriteLog = await accessPolicyService.canWriteProjectLog(
      authContext,
      projectId,
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
