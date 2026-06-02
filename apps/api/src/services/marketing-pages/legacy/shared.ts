import { Errors } from "@/errors/error-factory";
import {
  marketingPageRepository,
  type MarketingPageProjectOptionRow,
} from "@/repositories/marketing-pages";
import type {
  ConvertMarketingLeadInput,
  CreateMarketingPageInput,
  DuplicateMarketingPageInput,
  MarketingLeadListQuery,
  MarketingPageConfigInput,
  MarketingPageListQuery,
  MarketingPageProjectOptionQuery,
  PublicMarketingPageListQuery,
  ReorderMarketingPageInput,
  SubmitMarketingLeadInput,
  TrackMarketingEventInput,
  UpdateMarketingLeadInput,
  UpdateMarketingPageInput,
} from "@/schema/marketing-pages";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  getH5MarketingTokenExpiresAt,
  signH5MarketingToken,
  verifyH5MarketingToken,
} from "@/utils/jwt";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";

export function createDefaultConfig(title: string): MarketingPageConfigInput {
  return {
    schemaVersion: 1,
    title,
    blocks: [],
  };
}

export function buildCopiedTitle(title: string) {
  const copiedTitle = `${title} 副本`;
  return copiedTitle.length > 120 ? copiedTitle.slice(0, 120) : copiedTitle;
}

export function buildCopiedSlug(slug: string, suffix: string) {
  const maxBaseLength = 80 - suffix.length - 1;
  const base = slug.slice(0, Math.max(maxBaseLength, 1)).replace(/-+$/g, "");
  return `${base}-${suffix}`;
}

export function getH5BaseUrl() {
  return (process.env.H5_MARKETING_BASE_URL || "https://h5.goodcms.cn")
    .replace(/\/+$/g, "");
}

export function getPhoneTail(phone: string | null | undefined) {
  return phone ? phone.slice(-4) : null;
}

export function getDedupSince() {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  return since.toISOString();
}

export function getSortStep(total: number) {
  return Math.max(1, Math.floor(9999 / Math.max(total, 1)));
}

export function normalizeRelation<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") {
      return { ...fallback, ...(first as T) };
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    return { ...fallback, ...(value as T) };
  }

  return fallback;
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeProjectLogImages(images: unknown) {
  return resolveStoredFileUrlList(images);
}

export function resolveMarketingPageCover<T extends { cover_image?: string | null } | null>(
  page: T,
): T {
  if (!page) {
    return page;
  }

  return {
    ...page,
    cover_image: resolveStoredFileUrl(page.cover_image),
  };
}

export function createProjectImageMap(rows: MarketingPageProjectOptionRow[]) {
  const imageMap = new Map<string, string[]>();

  for (const row of rows) {
    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    if (!projectId) {
      continue;
    }

    const currentImages = imageMap.get(projectId) || [];
    if (currentImages.length >= 8) {
      continue;
    }

    for (const imageUrl of normalizeProjectLogImages(row.images)) {
      if (!currentImages.includes(imageUrl)) {
        currentImages.push(imageUrl);
      }

      if (currentImages.length >= 8) {
        break;
      }
    }

    if (currentImages.length > 0) {
      imageMap.set(projectId, currentImages);
    }
  }

  return imageMap;
}

export function formatArea(value: unknown) {
  if (typeof value === "number") {
    return `${value}m²`;
  }

  if (typeof value === "string" && value.trim()) {
    return `${value.trim()}m²`;
  }

  return null;
}

export function serializeProjectOption(
  row: MarketingPageProjectOptionRow,
  imageMap: Map<string, string[]>,
) {
  const property = normalizeRelation(row.property, {
    community: null,
    building_info: null,
    area: null,
    layout: null,
  });
  const customer = normalizeRelation(row.customer, {
    name: null,
  });
  const projectId = typeof row.id === "string" ? row.id : "";
  const imageUrls = imageMap.get(projectId) || [];
  const propertyParts = [
    property.community,
    property.layout,
    formatArea(property.area),
  ].filter(Boolean);

  return {
    id: projectId,
    projectId,
    title: typeof row.name === "string" && row.name.trim()
      ? row.name
      : "未命名项目",
    subtitle: propertyParts.join(" · ") || (typeof row.address === "string" ? row.address : ""),
    imageUrl: imageUrls[0] || "",
    imageUrls,
    status: typeof row.status === "string" ? row.status : null,
    customer_name: typeof customer.name === "string" ? customer.name : null,
    property,
    style_tags: normalizeStringArray(row.style_tags),
  };
}

export type H5IdentityStatus = "identified" | "expired" | "anonymous";

export type H5MarketingIdentity = {
  status: H5IdentityStatus;
  customerId: string | null;
  wxOpenid: string | null;
};

export {
  Errors,
  accessPolicyService,
  getH5MarketingTokenExpiresAt,
  marketingPageRepository,
  resolveStoredFileUrl,
  signH5MarketingToken,
  verifyH5MarketingToken,
};

export type {
  AuthContext,
  ConvertMarketingLeadInput,
  CreateMarketingPageInput,
  DuplicateMarketingPageInput,
  MarketingLeadListQuery,
  MarketingPageConfigInput,
  MarketingPageListQuery,
  MarketingPageProjectOptionQuery,
  MarketingPageProjectOptionRow,
  PublicMarketingPageListQuery,
  ReorderMarketingPageInput,
  SubmitMarketingLeadInput,
  TrackMarketingEventInput,
  UpdateMarketingLeadInput,
  UpdateMarketingPageInput,
};

