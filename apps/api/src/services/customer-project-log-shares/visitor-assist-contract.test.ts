import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiRoot = join(import.meta.dir, "../../..");

function readSource(relativePath: string) {
  return readFileSync(join(apiRoot, relativePath), "utf8");
}

describe("share campaign visitor assist contract", () => {
  test("does not require a business auth user before assisting", () => {
    const controller = readSource(
      "src/controllers/customer-project-log-shares/customer-controller.ts",
    );
    const service = readSource(
      "src/services/customer-project-log-shares/legacy/public-campaigns.ts",
    );
    const assistMethod = controller.slice(
      controller.indexOf('@Post("/share-campaigns/assist")'),
      controller.indexOf('@Get("/share-campaigns/:shareToken")'),
    );

    expect(assistMethod).toContain(
      "authUserId: this.getOptionalAuthUserId(request)",
    );
    expect(assistMethod).not.toContain(
      "const authUserId = this.getRequiredAuthUserId(request);",
    );
    expect(service).toContain("authUserId?: string | null");
    expect(service).toContain("if (!helper.authUserId && !helper.openid)");
    expect(service).toContain("helper_auth_user_id: helper.authUserId ?? null");
  });

  test("treats visitor openid as an authenticated viewer and owner blocker input", () => {
    const ownedContext = readSource(
      "src/services/customer-project-log-shares/legacy/owned-context.ts",
    );

    expect(ownedContext).toContain(
      "Boolean(viewer?.authUserId || viewer?.openid)",
    );
    expect(ownedContext).toContain("isCampaignOwnerViewer");
    expect(ownedContext).toContain("findActiveOauthIdentity");
    expect(ownedContext).toContain("helper_auth_user_id: viewerContext.authUserId ?? null");
  });

  test("maps duplicate assist insert races to ALREADY_ASSISTED", () => {
    const engagement = readSource(
      "src/repositories/customer-project-log-share-campaigns/legacy/engagement.ts",
    );

    expect(engagement).toContain("isUniqueViolation");
    expect(engagement).toContain("ErrorCodes.ALREADY_ASSISTED");
    expect(engagement.indexOf("isUniqueViolation(error)")).toBeLessThan(
      engagement.indexOf('throw Errors.dbError("创建助力记录失败", error);'),
    );
  });
});
