import type {
  PublicProjectLogSummary,
  PublicProjectMemberSummary,
} from "./shared";
import {
  ProjectStatusConfig,
  isProjectStatus,
} from "@gooes/domain";

type PublicProjectDetailRelated = {
  publicLogs?: PublicProjectLogSummary[];
  members?: PublicProjectMemberSummary[];
  consultation?: {
    enabled: boolean;
    tenant_id?: string | null;
    button_text?: string | null;
  };
  followedByMe?: boolean | null;
  followCount?: number | null;
};

function normalizeRelation<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? { ...fallback, ...(first as T) } : fallback;
  }

  return value && typeof value === "object" ? { ...fallback, ...(value as T) } : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCoverImages(logs: PublicProjectLogSummary[]) {
  return Array.from(
    new Set(logs.flatMap((item) => item.images).filter(Boolean)),
  ).slice(0, 6);
}

function buildDesignImages(logs: PublicProjectLogSummary[]) {
  return logs.flatMap((log) =>
    log.images.map((url, index) => ({
      id: `${log.id}:${index}`,
      title: log.node_name ?? log.stage_label,
      url,
      thumb_url: url,
      width: null,
      height: null,
      type: "other" as const,
      sort_order: null,
    }))
  );
}

export function serializePublicProjectDetailItem(
  row: Record<string, unknown>,
  related: PublicProjectDetailRelated,
) {
  const normalizedProperty = normalizeRelation(row.property, {
    id: null,
    community: null,
    building_info: null,
    layout: null,
    area: null,
    latitude: null,
    longitude: null,
    province: null,
    city: null,
    district: null,
    adcode: null,
    location_status: null,
  });
  const normalizedCustomer = normalizeRelation(row.customer, { name: null });
  const normalizedTenant = normalizeRelation(row.tenant, { id: null, name: null, slug: null });
  const projectId = typeof row.id === "string" ? row.id : "";
  const publicLogs = related.publicLogs ?? [];
  const rawStatus = typeof row.status === "string" ? row.status : null;
  const status = isProjectStatus(rawStatus) ? rawStatus : null;

  return {
    id: projectId,
    name: typeof row.name === "string" ? row.name : null,
    status,
    status_label: status ? ProjectStatusConfig[status].label : null,
    address: typeof row.address === "string" ? row.address : null,
    latitude: normalizedProperty.latitude ?? null,
    longitude: normalizedProperty.longitude ?? null,
    budget: typeof row.budget === "number" ? row.budget : null,
    start_date: typeof row.start_date === "string" ? row.start_date : null,
    cover_images: buildCoverImages(publicLogs),
    design_images: buildDesignImages(publicLogs),
    style_tags: normalizeStringArray(row.style_tags),
    tenant: normalizedTenant,
    tenant_name: typeof normalizedTenant.name === "string" ? normalizedTenant.name : null,
    consultation: related.consultation ?? {
      enabled: false,
      tenant_id: typeof normalizedTenant.id === "string" ? normalizedTenant.id : null,
      button_text: null,
    },
    followed_by_me: related.followedByMe ?? false,
    follow_count: related.followCount ?? 0,
    property: normalizedProperty,
    customer: {
      name: typeof normalizedCustomer.name === "string" ? normalizedCustomer.name : null,
    },
    members: related.members ?? [],
  };
}
