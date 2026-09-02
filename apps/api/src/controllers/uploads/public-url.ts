import { z } from "zod";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { uploadService } from "@/services/uploads";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

import {
  isPublicStoredFileScene,
  parseStoredObjectKey,
} from "./stored-object-policy";

const UploadPublicUrlQuerySchema = z.object({
  path: z.string()
    .trim()
    .min(1, "缺少图片路径")
    .max(1000, "图片路径过长")
    .refine((value) => !/^https?:\/\//i.test(value), "图片路径不支持绝对 URL")
    .refine((value) => !value.includes(".."), "图片路径不合法")
    .refine((value) => !value.startsWith("/"), "图片路径不合法")
    .refine((value) => !value.includes("\\"), "图片路径不合法")
    .optional(),
  fileId: z.uuid("无效的文件 ID").optional(),
}).strict().superRefine((value, context) => {
  const hasPath = Boolean(value.path);
  const hasFileId = Boolean(value.fileId);
  if (hasPath !== hasFileId) return;
  context.addIssue({
    code: "custom",
    path: ["path"],
    message: "必须且只能提供图片路径或文件 ID",
  });
});

export type UploadPublicUrlActorContext = {
  tenantId: string | null;
  isPlatformIdentity: boolean;
};

export function parseUploadPublicUrlQuery(query: unknown) {
  const result = UploadPublicUrlQuerySchema.safeParse(query || {});
  if (!result.success) {
    throw Errors.fromZod(result.error);
  }
  return result.data;
}

export async function resolveUploadPublicUrl(
  query: ReturnType<typeof parseUploadPublicUrlQuery>,
  actorContext: UploadPublicUrlActorContext,
) {
  if (query.fileId) {
    return uploadService.resolvePublicStoredFileUrlById({
      fileObjectId: query.fileId,
      tenantId: actorContext.tenantId,
      isPlatformIdentity: actorContext.isPlatformIdentity,
    });
  }

  const path = query.path;
  if (!path) {
    throw Errors.badRequest("缺少图片路径");
  }
  assertStoredFileAccess(path, actorContext);

  const publicUrl = resolveStoredFileUrl(path);
  if (!publicUrl) {
    throw Errors.badRequest("图片路径不合法");
  }
  return publicUrl;
}

function assertStoredFileAccess(
  path: string,
  actorContext: UploadPublicUrlActorContext,
) {
  const parsed = parseStoredObjectKey(path);
  if (!parsed.isPlatformObjectKey) {
    return;
  }

  if (parsed.isPrivateObjectKey) {
    throw Errors.business(403, "私有文件不能通过公开地址访问", ErrorCodes.FORBIDDEN);
  }

  if (actorContext.isPlatformIdentity) {
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
