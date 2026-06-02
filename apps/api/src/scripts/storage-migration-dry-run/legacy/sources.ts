import type { SourceConfig } from "./shared";
import { normalizeString } from "./shared";

function getNestedTenantId(value: unknown): string | null {
  if (Array.isArray(value)) {
    return getNestedTenantId(value[0]);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.tenant_id === "string") {
    return row.tenant_id;
  }

  for (const nested of Object.values(row)) {
    const tenantId = getNestedTenantId(nested);
    if (tenantId) {
      return tenantId;
    }
  }

  return null;
}

function stringArrayValues(field: string, value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => ({
    sourceField: field,
    value: item,
    arrayIndex: index,
  }));
}

function nestedMetadataValues(row: Record<string, unknown>) {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const data = metadata as Record<string, unknown>;
  const values = [
    ...stringArrayValues("metadata.images", data.images),
    ...stringArrayValues("metadata.referenced_image_paths", data.referenced_image_paths),
  ];

  if (Array.isArray(data.referenced_images)) {
    data.referenced_images.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return;
      }
      const image = item as Record<string, unknown>;
      for (const field of ["path", "url", "thumb_url"]) {
        values.push({
          sourceField: `metadata.referenced_images.${field}`,
          value: image[field],
          arrayIndex: index,
        });
      }
    });
  }

  return values;
}

function singleValue(field: string, value: unknown) {
  if (normalizeString(value) === "") {
    return [];
  }

  return [{ sourceField: field, value, arrayIndex: null }];
}

export const sources: SourceConfig[] = [
  {
    priority: "P0",
    table: "project_logs",
    select: "id,tenant_id,images",
    field: "images",
    scene: "project-log",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("images", row.images),
  },
  {
    priority: "P0",
    table: "project_log_comments",
    select: "id,tenant_id,images",
    field: "images",
    scene: "project-log-comment",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("images", row.images),
  },
  {
    priority: "P0",
    table: "project_acceptance_items",
    select: "id,tenant_id,images,rectification_images",
    field: "images,rectification_images",
    scene: "project-acceptance",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => [
      ...stringArrayValues("images", row.images),
      ...stringArrayValues("rectification_images", row.rectification_images),
    ],
  },
  {
    priority: "P0",
    table: "project_acceptance_actions",
    select: "id,tenant_id,metadata",
    field: "metadata",
    scene: "project-acceptance",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: nestedMetadataValues,
  },
  {
    priority: "P1",
    table: "customer_follow_up_comments",
    select: "id,images,follow_up:customer_follow_ups(customer:customers(tenant_id))",
    field: "images",
    scene: "customer-follow-up-comment",
    hasDirectTenantId: false,
    tenantId: (row) => getNestedTenantId(row.follow_up),
    values: (row) => stringArrayValues("images", row.images),
  },
  {
    priority: "P1",
    table: "customers",
    select: "id,tenant_id,douyin_screenshot_images",
    field: "douyin_screenshot_images",
    scene: "customer-douyin-screenshot",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) =>
      stringArrayValues("douyin_screenshot_images", row.douyin_screenshot_images),
  },
  {
    priority: "P1",
    table: "expense_request_items",
    select: "id,tenant_id,evidence_images",
    field: "evidence_images",
    scene: "expense-request",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("evidence_images", row.evidence_images),
  },
  {
    priority: "P1",
    table: "expense_request_settlements",
    select: "id,tenant_id,evidence_images",
    field: "evidence_images",
    scene: "expense-request-settlement",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => stringArrayValues("evidence_images", row.evidence_images),
  },
  {
    priority: "P1",
    table: "project_referrals",
    select: "id,paid_evidence_images,project:projects(tenant_id)",
    field: "paid_evidence_images",
    scene: "project-referral",
    hasDirectTenantId: false,
    tenantId: (row) => getNestedTenantId(row.project),
    values: (row) => stringArrayValues("paid_evidence_images", row.paid_evidence_images),
  },
  {
    priority: "P1",
    table: "employees",
    select: "id,tenant_id,avatar",
    field: "avatar",
    scene: "employee-avatar",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => singleValue("avatar", row.avatar),
  },
  {
    priority: "P1",
    table: "marketing_pages",
    select: "id,tenant_id,cover_image",
    field: "cover_image",
    scene: "h5-marketing-page",
    hasDirectTenantId: true,
    tenantId: (row) => typeof row.tenant_id === "string" ? row.tenant_id : null,
    values: (row) => singleValue("cover_image", row.cover_image),
  },
];
