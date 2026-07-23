import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { platformFileStorageService } from "@/services/files/platform-file-storage";
import { buildTenantOnboardingLicenseVisitorPrefix } from "@/services/files/platform-file-storage";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { uploadService } from "@/services/uploads";
import { customerSelfServiceService } from "@/services/customer-self-service";
import type { JwtPayload } from "@/utils/jwt";
import { logUploadTiming } from "@/utils/upload-timing-logger";
import { z } from "zod";
import {
  isPublicStoredFileScene,
  parseStoredObjectKey,
} from "./stored-object-policy";
import { assertApplymentUploadSceneAccess } from "./applyment-upload-access";
import { assertDirectUploadFileDeclaration } from "./direct-upload-file-policy";

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
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
  "project_payment",
  "wechat_pay_applyment",
  "picture_library",
  "picture_comment",
  "tenant_onboarding_license",
] as const;
const FINANCE_PAYMENT_CONFIRM_PERMISSION = "finance.payment.confirm";
const UPLOAD_IMAGES_TIMING_PREFIX = "[UPLOAD_IMAGES_TIMING]";
const PROJECT_REQUIRED_UPLOAD_SCENES = new Set<UploadScene>(["project_log", "project_acceptance", "project_payment"]);
const PUBLIC_DIRECT_UPLOAD_SCENES = new Set<UploadScene>(["h5_marketing_page", "picture_library", "picture_comment"]);
const PRIVATE_DIRECT_UPLOAD_SCENES = new Set<UploadScene>([
  "tenant_onboarding_license",
  "wechat_pay_applyment",
]);

const DirectUploadInitSchema = z.object({
  scene: z.enum(DIRECT_UPLOAD_SCENES, {
    message: "当前场景暂不支持直传",
  }),
  project_id: z.string().uuid("无效的项目ID").optional(),
  filename: z.string().trim().max(200, "文件名过长").optional(),
  mimetype: z.enum(IMAGE_MIME_TYPES, {
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
  upload_intent: z.string().trim().min(1).max(4096, "上传凭证过长").optional(),
}).superRefine((value, context) => {
  if (
    (
      value.scene === "tenant_onboarding_license" ||
      value.scene === "wechat_pay_applyment"
    ) &&
    !value.upload_intent
  ) {
    context.addIssue({
      code: "custom",
      path: ["upload_intent"],
      message: "缺少私有上传凭证",
    });
  }
});

const UploadPublicUrlQuerySchema = z.object({
  path: z.string()
    .trim()
    .min(1, "缺少图片路径")
    .max(1000, "图片路径过长")
    .refine((value) => !/^https?:\/\//i.test(value), "图片路径不支持绝对 URL")
    .refine((value) => !value.includes(".."), "图片路径不合法")
    .refine((value) => !value.startsWith("/"), "图片路径不合法")
    .refine((value) => !value.includes("\\"), "图片路径不合法"),
});

type UploadScene = (typeof DIRECT_UPLOAD_SCENES)[number];

type UploadActorContext = {
  tenantId: string | null;
  employeeId: string | null;
  customerId: string | null;
  visitorId: string | null;
  isPlatformAdmin: boolean;
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
    const user = request.user;
    if (!this.hasUploadIdentity(user)) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const queryResult = UploadPublicUrlQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const actorContext = await this.resolveUploadActorContext(user);
    this.assertStoredFileAccess(queryResult.data.path, actorContext);

    const publicUrl = resolveStoredFileUrl(queryResult.data.path);
    if (!publicUrl) {
      throw Errors.badRequest("图片路径不合法");
    }

    return reply.redirect(publicUrl);
  }

  @Post("/uploads/cos/direct-init")
  async initDirectCosUpload(request: FastifyRequest, reply: FastifyReply) {
    const requestStartedAt = now();
    const user = request.user;
    if (!this.hasUploadIdentity(user)) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const result = DirectUploadInitSchema.safeParse(request.body || {});
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const scene = result.data.scene;
    assertDirectUploadFileDeclaration({
      scene,
      mimetype: result.data.mimetype,
      sizeBytes: result.data.size_bytes,
    });
    const actorContext = await assertApplymentUploadSceneAccess(user, scene)
      ?? await this.resolveUploadActorContext(user);
    await this.assertDirectUploadProjectAccess(
      user,
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
      authUserId: user.sub ?? null,
      employeeId: actorContext.employeeId,
      customerId: actorContext.customerId,
      visitorId: actorContext.visitorId,
      visibility: PRIVATE_DIRECT_UPLOAD_SCENES.has(scene) ? "private" : "public",
    });
    logUploadImagesTiming("direct-init-total", requestStartedAt, {
      request_id: request.id,
      scene,
      tenant_id: actorContext.tenantId,
      size_bytes: result.data.size_bytes,
      ...(scene === "wechat_pay_applyment"
        ? {}
        : { object_key: directUpload.object_key }),
    });

    return ResponseHandler.success(directUpload);
  }

  @Post("/uploads/cos/direct-complete")
  async completeDirectCosUpload(request: FastifyRequest, reply: FastifyReply) {
    const requestStartedAt = now();
    const user = request.user;
    if (!this.hasUploadIdentity(user)) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const result = DirectUploadCompleteSchema.safeParse(request.body || {});
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const scene = result.data.scene;
    assertDirectUploadFileDeclaration({
      scene,
      mimetype: result.data.mimetype,
      sizeBytes: result.data.size_bytes,
    });
    const actorContext = await assertApplymentUploadSceneAccess(user, scene)
      ?? await this.resolveUploadActorContext(user);
    await this.assertDirectUploadProjectAccess(
      user,
      scene,
      result.data.project_id,
      actorContext,
    );
    this.assertDirectObjectKeyBelongsToActor(
      result.data.object_key,
      scene,
      actorContext,
      result.data.project_id,
    );

    const uploaded = await platformFileStorageService.completeDirectUpload({
      filename: result.data.filename,
      mimetype: result.data.mimetype,
      sizeBytes: result.data.size_bytes,
      scene,
      projectId: result.data.project_id,
      tenantId: actorContext.tenantId,
      authUserId: user.sub ?? null,
      employeeId: actorContext.employeeId,
      customerId: actorContext.customerId,
      visitorId: actorContext.visitorId,
      visibility: PRIVATE_DIRECT_UPLOAD_SCENES.has(scene) ? "private" : "public",
      objectKey: result.data.object_key,
      etag: result.data.etag,
      uploadIntent: result.data.upload_intent,
    });
    logUploadImagesTiming("direct-complete-total", requestStartedAt, {
      request_id: request.id,
      scene,
      tenant_id: actorContext.tenantId,
      size_bytes: result.data.size_bytes,
      ...(scene === "wechat_pay_applyment"
        ? {}
        : { object_key: result.data.object_key }),
      provider: "provider" in uploaded ? uploaded.provider : undefined,
      file_id: uploaded.file_id,
    });

    return ResponseHandler.success(uploaded);
  }

  private assertDirectObjectKeyBelongsToActor(
    objectKey: string,
    scene: UploadScene,
    actorContext: UploadActorContext,
    projectId: string | undefined,
  ) {
    const scenePrefix = scene.replace(/_/g, "-");
    const expectedPrefix = scene === "tenant_onboarding_license"
      ? buildTenantOnboardingLicenseVisitorPrefix(actorContext.visitorId)
      : actorContext.tenantId
      ? `tenants/${actorContext.tenantId}/${scenePrefix}/`
      : `public/${scenePrefix}/`;

    if (!objectKey.startsWith(expectedPrefix)) {
      throw Errors.business(403, "上传对象不属于当前登录身份", ErrorCodes.FORBIDDEN);
    }

    if (PROJECT_REQUIRED_UPLOAD_SCENES.has(scene)) {
      const expectedProjectSegment = `/projects/${projectId}/`;
      if (!projectId || !objectKey.includes(expectedProjectSegment)) {
        throw Errors.business(403, "上传对象不属于当前项目", ErrorCodes.FORBIDDEN);
      }
    }
  }

  private async assertDirectUploadProjectAccess(
    user: JwtPayload,
    scene: UploadScene,
    projectId: string | undefined,
    actorContext: UploadActorContext,
  ) {
    if (scene === "tenant_onboarding_license" && !actorContext.visitorId) {
      throw Errors.forbidden();
    }

    if (actorContext.visitorId) {
      if (scene !== "picture_comment" && scene !== "tenant_onboarding_license") {
        throw Errors.forbidden();
      }
      return;
    }

    if (!actorContext.tenantId && !PUBLIC_DIRECT_UPLOAD_SCENES.has(scene)) {
      throw Errors.forbidden();
    }

    if (!PROJECT_REQUIRED_UPLOAD_SCENES.has(scene)) return;

    if (!projectId) {
      throw Errors.badRequest("缺少项目ID");
    }

    if (scene === "project_log" && !actorContext.employeeId) {
      throw Errors.forbidden();
    }

    const authContext = await authorizationService.getRequiredAuthContext(user.sub);
    if (scene === "project_payment") {
      if (!actorContext.employeeId) {
        throw Errors.forbidden();
      }

      const canConfirmProjectPayment = await accessPolicyService.canAccessProject(
        authContext,
        projectId,
        FINANCE_PAYMENT_CONFIRM_PERMISSION,
      );
      if (!canConfirmProjectPayment) {
        throw Errors.forbidden();
      }
      return;
    }

    if (scene === "project_acceptance" && actorContext.customerId) {
      const project = await customerSelfServiceService.findOwnedProject({
        projectId,
        customerId: actorContext.customerId,
        tenantId: actorContext.tenantId,
      });
      if (!project) {
        throw Errors.forbidden();
      }
      return;
    }

    if (!actorContext.employeeId) {
      throw Errors.forbidden();
    }

    const canWriteLog = scene === "project_log"
      ? await accessPolicyService.canWriteProjectLog(
        authContext,
        projectId,
      )
      : await accessPolicyService.canAccessProject(
        authContext,
        projectId,
        "project_acceptance.create",
      );
    if (!canWriteLog) {
      throw Errors.forbidden();
    }
  }

  private assertStoredFileAccess(path: string, actorContext: UploadActorContext) {
    const parsed = parseStoredObjectKey(path);
    if (!parsed.isPlatformObjectKey) {
      return;
    }

    if (parsed.isPrivateObjectKey) {
      throw Errors.business(403, "私有文件不能通过公开地址访问", ErrorCodes.FORBIDDEN);
    }

    if (actorContext.isPlatformAdmin) {
      return;
    }

    if (parsed.tenantId) {
      if (!actorContext.tenantId || parsed.tenantId !== actorContext.tenantId) {
        throw Errors.business(403, "图片不属于当前登录身份", ErrorCodes.FORBIDDEN);
      }
      return;
    }

    if (!isPublicStoredFileScene(parsed.scene)) {
      throw Errors.business(403, "图片不属于当前登录身份", ErrorCodes.FORBIDDEN);
    }
  }

  private async resolveUploadActorContext(user: JwtPayload): Promise<UploadActorContext> {
    const tokenTenantId = user.tenant_id ?? null;
    const tokenEmployeeId = user.employee_id ?? null;
    const tokenCustomerId = user.customer_id ?? null;
    const visitorId = user.visitor_id?.trim() || null;

    if (user.token_type === "visitor_session" && visitorId) {
      return {
        tenantId: null,
        employeeId: null,
        customerId: null,
        visitorId,
        isPlatformAdmin: false,
      };
    }

    if (tokenTenantId && tokenEmployeeId) {
      return {
        tenantId: tokenTenantId,
        employeeId: tokenEmployeeId,
        customerId: null,
        visitorId: null,
        isPlatformAdmin: false,
      };
    }

    if (tokenTenantId && tokenCustomerId) {
      return {
        tenantId: tokenTenantId,
        employeeId: null,
        customerId: tokenCustomerId,
        visitorId: null,
        isPlatformAdmin: false,
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
        visitorId: null,
        isPlatformAdmin: authContext.isPlatformAdmin,
      };
    }

    const membership = await uploadService.findDefaultActiveCustomerMembership(authUserId);
    if (membership) {
      return {
        tenantId: membership.tenant_id,
        employeeId: null,
        customerId: membership.identity_id,
        visitorId: null,
        isPlatformAdmin: false,
      };
    }

    const customer = await this.findLegacyCustomerBinding(authUserId);
    return {
      tenantId: customer?.tenant_id ?? null,
      employeeId: null,
      customerId: customer?.id ?? null,
      visitorId: null,
      isPlatformAdmin: false,
    };
  }

  private async findLegacyCustomerBinding(authUserId: string) {
    return uploadService.findLegacyCustomerBinding(authUserId);
  }

  private hasUploadIdentity(user: JwtPayload | undefined): user is JwtPayload {
    return Boolean(
      user?.sub ||
      (user?.token_type === "visitor_session" && user.visitor_id?.trim()),
    );
  }
}
export default new UploadController();
