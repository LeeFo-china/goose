import { describe, expect, test } from "bun:test";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const SPEC_ID = "22222222-2222-4222-8222-222222222222";
const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";

async function loadV2Requests() {
  return import("./supplier-catalog-v2-requests").catch(() => null);
}

describe("平台供应目录 v2 请求", () => {
  test("builds paginated spec and suggestion list paths", async () => {
    const requests = await loadV2Requests();
    expect(requests).not.toBeNull();
    if (!requests) return;

    expect(requests.buildPlatformSpecListPath(CATEGORY_ID, 2, 150, "inactive"))
      .toBe(`/platform/catalog/categories/${CATEGORY_ID}/spec-definitions?page=2&pageSize=100&status=inactive`);
    expect(requests.buildPlatformSuggestionListPath({
      page: 3,
      pageSize: 20,
      status: "submitted",
      tenantId: "44444444-4444-4444-8444-444444444444",
    })).toBe(
      "/platform/catalog/unit-suggestions?page=3&pageSize=20&status=submitted&tenant_id=44444444-4444-4444-8444-444444444444",
    );
  });

  test("uses platform-only spec endpoints and preserves command idempotency", async () => {
    const requests = await loadV2Requests();
    expect(requests).not.toBeNull();
    if (!requests) return;

    expect(requests.buildPlatformSpecCommand({
      categoryId: CATEGORY_ID,
      definitionId: SPEC_ID,
      payload: { expected_version: 4, name: "规格宽度" },
      idempotencyKey: "platform-spec:update-1",
    })).toEqual({
      path: `/platform/catalog/categories/${CATEGORY_ID}/spec-definitions/${SPEC_ID}`,
      init: {
        method: "PATCH",
        headers: { "Idempotency-Key": "platform-spec:update-1" },
        body: JSON.stringify({ expected_version: 4, name: "规格宽度" }),
      },
    });
  });

  test("requires the approved unit or rejected reason in review payloads", async () => {
    const requests = await loadV2Requests();
    expect(requests).not.toBeNull();
    if (!requests) return;

    expect(requests.validateSuggestionReview({
      action: "approved",
      approvedCatalogUnitId: "",
      reviewRemark: "",
    })).toBe("通过建议时必须选择标准单位");
    expect(requests.validateSuggestionReview({
      action: "rejected",
      approvedCatalogUnitId: "",
      reviewRemark: "",
    })).toBe("拒绝建议时必须填写原因");
    expect(requests.buildPlatformSuggestionReviewCommand({
      suggestionId: SUGGESTION_ID,
      expectedVersion: 3,
      action: "rejected",
      approvedCatalogUnitId: "",
      reviewRemark: "与现有单位重复",
      idempotencyKey: "unit-suggestion:review-1",
    }).path).toBe(`/platform/catalog/unit-suggestions/${SUGGESTION_ID}`);
  });

  test("loads searchable active unit pages beyond the first hundred", async () => {
    const requests = await loadV2Requests();
    expect(requests).not.toBeNull();
    if (!requests) return;

    expect(requests.buildPlatformActiveUnitOptionsPath({
      page: 2,
      pageSize: 100,
      keyword: "第101单位",
    })).toBe(
      "/platform/catalog/units?page=2&pageSize=100&status=active&keyword=%E7%AC%AC101%E5%8D%95%E4%BD%8D",
    );
  });
});
