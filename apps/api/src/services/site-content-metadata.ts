import type { SiteContentType } from "@gooes/domain";
import { SiteContentPublicDetailSchema } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import {
  SiteContentArticleMetadataSchema,
  SiteContentCaseMetadataSchema,
  SiteContentCityMetadataSchema,
} from "@/schema/site-content";

export function getSiteContentMetadataSchema(contentType: SiteContentType) {
  return contentType === "article"
    ? SiteContentArticleMetadataSchema
    : contentType === "case"
      ? SiteContentCaseMetadataSchema
      : SiteContentCityMetadataSchema;
}

export function parsePublicSiteContentMetadata(
  contentType: SiteContentType,
  metadata: unknown,
) {
  const result = getSiteContentMetadataSchema(contentType).safeParse(metadata);
  if (!result.success) {
    throw Errors.business(
      500,
      "官网内容元数据不合法",
      "SITE_CONTENT_DATA_INVALID",
      result.error.issues,
    );
  }
  return result.data;
}

export function parsePublicSiteContentDetail(value: unknown) {
  const result = SiteContentPublicDetailSchema.safeParse(value);
  if (!result.success) {
    throw Errors.business(
      500,
      "官网公开内容数据不合法",
      "SITE_CONTENT_DATA_INVALID",
      result.error.issues,
    );
  }
  return result.data;
}
