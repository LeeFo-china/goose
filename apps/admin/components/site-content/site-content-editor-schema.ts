import {
  SiteContentArticleMetadataSchema,
  SiteContentCaseMetadataSchema,
  SiteContentCityMetadataSchema,
  SiteContentDraftSchema,
  type SiteContentType,
} from "@gooes/domain";
import { z } from "zod";

export const SiteContentSlugSchema = z.string()
  .trim()
  .min(1, "slug 不能为空")
  .max(200, "slug 不能超过 200 个字符")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "仅支持小写字母、数字和单个连字符");

const metadataSchemas = {
  article: SiteContentArticleMetadataSchema,
  case: SiteContentCaseMetadataSchema,
  city: SiteContentCityMetadataSchema,
} as const;

export const SiteContentEditorSchema = SiteContentDraftSchema.extend({
  contentType: z.enum(["article", "case", "city"]),
  slug: SiteContentSlugSchema,
  metadata: z.record(z.string(), z.unknown()),
}).superRefine((value, context) => {
  const result = metadataSchemas[value.contentType].safeParse(value.metadata);
  if (result.success) return;
  for (const issue of result.error.issues) {
    context.addIssue({
      code: "custom",
      path: ["metadata", ...issue.path],
      message: issue.message,
    });
  }
});

export function parseSiteContentMetadata(
  contentType: SiteContentType,
  metadata: Record<string, unknown>,
) {
  return metadataSchemas[contentType].parse(metadata);
}

export function formatCaseMetrics(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const label = "label" in item && typeof item.label === "string" ? item.label : "";
    const metricValue = "value" in item && typeof item.value === "string" ? item.value : "";
    return [`${label}|${metricValue}`];
  }).join("\n");
}

export function parseCaseMetrics(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, ...valueParts] = line.split("|");
    return { label: label?.trim() || "", value: valueParts.join("|").trim() };
  });
}
