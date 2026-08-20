import { z } from "zod";

const PUBLICATION_STATUS_VALUES = ["draft", "published", "hidden"] as const;
const TENANT_PROJECT_LOG_IMAGE_REFERENCE_PATTERN =
  /^tenants\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/project-log\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9]{4}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12][0-9]|3[01])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp|heic|heif)$/;

const HttpsImageReferenceSchema = z.string().trim().min(1).max(2048)
  .refine((value) => {
    if (/\s/.test(value)) return false;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "图片地址必须是 HTTPS URL 或项目图片引用");

const TenantProjectLogImageReferenceSchema = z.string().trim().min(1).max(1000)
  .regex(
    TENANT_PROJECT_LOG_IMAGE_REFERENCE_PATTERN,
    "图片地址必须是 HTTPS URL 或项目图片引用",
  );

export const TenantDouyinProjectImageReferenceSchema = z.union([
  HttpsImageReferenceSchema,
  TenantProjectLogImageReferenceSchema,
]);

export const TenantDouyinProjectListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  publicationStatus: z.enum(PUBLICATION_STATUS_VALUES).optional(),
});

export const TenantDouyinProjectImagesQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TenantDouyinProjectParamsSchema = z.strictObject({
  projectId: z.uuid("无效的项目 ID"),
});

export const TenantDouyinProjectPublicationSchema = z.strictObject({
  public_title: z.string().trim().min(2).max(100),
  public_description: z.string().trim().min(20).max(2000),
  public_image_urls: z.array(TenantDouyinProjectImageReferenceSchema).max(30),
  style_tags: z.array(z.string().trim().min(1).max(40)).max(8),
  budget_band: z.string().trim().min(1).max(80).nullable().optional(),
  publication_status: z.enum(PUBLICATION_STATUS_VALUES),
}).superRefine((value, context) => {
  if (new Set(value.public_image_urls).size !== value.public_image_urls.length) {
    context.addIssue({
      code: "custom",
      path: ["public_image_urls"],
      message: "公开图片不能重复",
    });
  }
  if (
    value.publication_status === "published"
    && value.public_image_urls.length < 3
  ) {
    context.addIssue({
      code: "custom",
      path: ["public_image_urls"],
      message: "发布项目至少需要 3 张公开图片",
    });
  }
});

export function parseTenantProjectLogImageReference(reference: string): {
  tenantId: string;
  projectId: string;
} | null {
  const match = TENANT_PROJECT_LOG_IMAGE_REFERENCE_PATTERN.exec(reference);
  if (!match?.[1] || !match[2]) return null;
  return { tenantId: match[1], projectId: match[2] };
}

export type TenantDouyinProjectListQuery = z.infer<
  typeof TenantDouyinProjectListQuerySchema
>;
export type TenantDouyinProjectImagesQuery = z.infer<
  typeof TenantDouyinProjectImagesQuerySchema
>;
export type TenantDouyinProjectPublicationInput = z.infer<
  typeof TenantDouyinProjectPublicationSchema
>;
