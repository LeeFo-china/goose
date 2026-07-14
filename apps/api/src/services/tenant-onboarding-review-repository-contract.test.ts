import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const reviewRepository = new URL(
  "../repositories/tenant-onboarding-review.ts",
  import.meta.url,
);
const notificationRepository = new URL(
  "../repositories/tenant-onboarding-notifications.ts",
  import.meta.url,
);

describe("tenant onboarding platform review repository contract", () => {
  test("keeps list and detail projections bounded and free of storage secrets", () => {
    const source = readFileSync(reviewRepository, "utf8");
    const listSelect = source.match(
      /const LIST_SELECT = \[([\s\S]*?)\]\.join\(","\);/,
    )?.[1] ?? "";
    const detailSelect = source.match(
      /const DETAIL_SELECT = \[([\s\S]*?)\]\.join\(","\);/,
    )?.[1] ?? "";
    for (const sensitive of [
      "unified_social_credit_code",
      "business_license_file_id",
      "admin_phone",
      "candidate_snapshot",
    ]) expect(listSelect).not.toContain(`"${sensitive}"`);
    for (const forbidden of ["visitor_id", "idempotency_key", "object_key", "public_url"]) {
      expect(detailSelect).not.toContain(`"${forbidden}"`);
    }
    expect(source).toContain(".range(normalized.start, normalized.end)");
    expect(source).toContain("Math.min(pageSizeValue, MAX_PAGE_SIZE)");
  });

  test("applies all queue filters before execution and sanitizes keyword syntax", () => {
    const source = readFileSync(reviewRepository, "utf8");
    expect(source).toContain('.eq("status", query.status)');
    expect(source).toContain('.contains("service_region_codes", [query.region_code])');
    expect(source).toContain('.eq("candidate_partner_id", query.candidate_partner_id)');
    expect(source).toContain('.eq("partner_assist_status", query.assist_status)');
    expect(source).toContain('replace(/[%_,().]/g, " ")');
  });

  test("uses separate paginated review and notification queries", () => {
    const reviewSource = readFileSync(reviewRepository, "utf8");
    const notificationSource = readFileSync(notificationRepository, "utf8");
    expect(reviewSource).toContain('"tenant_onboarding_application_reviews"');
    expect(reviewSource).toContain('.eq("application_id", input.applicationId)');
    expect(notificationSource).toContain("async listByApplication");
    expect(notificationSource).toContain(".range(start, start + pageSize - 1)");
    const historySelect = notificationSource.match(
      /const HISTORY_DELIVERY_SELECT = \[([\s\S]*?)\]\.join\(","\);/,
    )?.[1] ?? "";
    expect(historySelect).toContain('"attempt_count"');
    expect(historySelect).not.toContain('"claim_token"');
    expect(historySelect).not.toContain('"claim_expires_at"');
  });

  test("routes every durable platform review transition through the atomic RPC", () => {
    const source = readFileSync(reviewRepository, "utf8");
    expect(source).toContain('"mutate_tenant_onboarding_platform_review"');
    for (const action of [
      "start_review",
      "request_supplement",
      "request_partner_assist",
      "reject",
    ]) expect(source).toContain(`"${action}"`);
    expect(source).not.toContain(
      '.from("tenant_onboarding_applications").update(',
    );
  });
});
