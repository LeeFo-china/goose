import { z } from "zod";

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isPlatformObjectKey(value: string) {
  return (
    value.startsWith("tenants/") ||
    value.startsWith("public/") ||
    value.startsWith("system/")
  );
}

function isSafeStoragePath(value: string) {
  return (
    value.length > 0 &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    !value.includes("\\")
  );
}

export const ImageReferenceSchema = z.string()
  .trim()
  .min(1, "图片不能为空")
  .max(2048, "图片地址过长")
  .refine((value) => {
    if (isHttpUrl(value)) {
      return true;
    }

    return isPlatformObjectKey(value) && isSafeStoragePath(value);
  }, "无效的图片地址");

export const ImageReferenceListSchema = z.array(ImageReferenceSchema)
  .max(9, "评论图片最多上传9张");
