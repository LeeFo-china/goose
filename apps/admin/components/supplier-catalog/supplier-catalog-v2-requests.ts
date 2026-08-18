function command(
  path: string,
  method: "POST" | "PATCH",
  payload: object,
  idempotencyKey: string,
) {
  return {
    path,
    init: {
      method,
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    },
  } as const;
}

export function buildPlatformSpecListPath(
  categoryId: string,
  page: number,
  pageSize: number,
  status: "active" | "inactive" | "",
) {
  const query = new URLSearchParams({
    page: String(Math.max(1, page)),
    pageSize: String(Math.min(100, Math.max(1, pageSize))),
  });
  if (status) query.set("status", status);
  return `/platform/catalog/categories/${categoryId}/spec-definitions?${query}`;
}

export function buildPlatformSuggestionListPath(input: {
  page: number;
  pageSize: number;
  status: "submitted" | "approved" | "rejected" | "";
  tenantId: string;
}) {
  const query = new URLSearchParams({
    page: String(Math.max(1, input.page)),
    pageSize: String(Math.min(100, Math.max(1, input.pageSize))),
  });
  if (input.status) query.set("status", input.status);
  if (input.tenantId) query.set("tenant_id", input.tenantId);
  return `/platform/catalog/unit-suggestions?${query}`;
}

export function buildPlatformActiveUnitOptionsPath(input: {
  page: number;
  pageSize: number;
  keyword: string;
}) {
  const query = new URLSearchParams({
    page: String(Math.max(1, input.page)),
    pageSize: String(Math.min(100, Math.max(1, input.pageSize))),
    status: "active",
  });
  const keyword = input.keyword.trim().slice(0, 80);
  if (keyword) query.set("keyword", keyword);
  return `/platform/catalog/units?${query}`;
}

export function buildPlatformSpecCommand(input: {
  categoryId: string;
  definitionId?: string;
  payload: object;
  idempotencyKey: string;
}) {
  const basePath =
    `/platform/catalog/categories/${input.categoryId}/spec-definitions`;
  return command(
    input.definitionId ? `${basePath}/${input.definitionId}` : basePath,
    input.definitionId ? "PATCH" : "POST",
    input.payload,
    input.idempotencyKey,
  );
}

export function validateSuggestionReview(input: {
  action: "approved" | "rejected";
  approvedCatalogUnitId: string;
  reviewRemark: string;
}) {
  if (input.action === "approved" && !input.approvedCatalogUnitId) {
    return "通过建议时必须选择标准单位";
  }
  if (input.action === "rejected" && !input.reviewRemark.trim()) {
    return "拒绝建议时必须填写原因";
  }
  return null;
}

export function buildPlatformSuggestionReviewCommand(input: {
  suggestionId: string;
  expectedVersion: number;
  action: "approved" | "rejected";
  approvedCatalogUnitId: string;
  reviewRemark: string;
  idempotencyKey: string;
}) {
  return command(
    `/platform/catalog/unit-suggestions/${input.suggestionId}`,
    "PATCH",
    {
      action: input.action,
      approved_catalog_unit_id: input.action === "approved"
        ? input.approvedCatalogUnitId
        : null,
      review_remark: input.reviewRemark.trim() || null,
      expected_version: input.expectedVersion,
    },
    input.idempotencyKey,
  );
}
