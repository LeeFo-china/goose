import { beforeAll, describe, expect, test } from "bun:test";

import {
  FILE_ID,
  TENANT_ID,
  createFixture,
  databaseError,
  platformAuthContext,
  tenantAuthContext,
} from "./brand-profiles.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let BrandProfilesService: new (dependencies: never) => ReturnType<
  typeof createFixture
>["service"];

beforeAll(async () => {
  ({ BrandProfilesService } = await import("./brand-profiles"));
});

describe("BrandProfilesService database error boundary", () => {
  test.each([
    ["platform profile", { findPlatformFailure: databaseError({
      relation: "secret_brand_profiles",
    }) }, () => platformAuthContext, "getPlatform"],
    ["tenant profile", { findTenantFailure: databaseError({
      sql: `select * from secret where tenant_id = '${TENANT_ID}'`,
    }) }, () => tenantAuthContext, "getTenant"],
    ["file", { fileFailure: databaseError({
      bucket: "private-brand-bucket",
    }) }, () => platformAuthContext, "getPlatform"],
  ] as const)(
    "sanitizes unknown %s lookup failures",
    async (_name, options, authContext, method) => {
      const fixture = createFixture(BrandProfilesService, options);

      await expect(fixture.service[method](authContext()))
        .rejects.toMatchObject({
          statusCode: 500,
          code: "DB_ERROR",
          details: undefined,
        });
    },
  );

  test("sanitizes unknown save and publish RPC failures", async () => {
    for (
      const [operation, options] of [
        ["save", { saveFailure: databaseError({
          message: "internal SQL",
          hint: "private schema",
        }) }],
        ["publish", { publishFailure: databaseError({
          message: "internal SQL",
          details: "connection topology",
        }) }],
      ] as const
    ) {
      const fixture = createFixture(BrandProfilesService, options);
      const result = operation === "save"
        ? fixture.service.savePlatformDraft(platformAuthContext, {
          display_name: "平台品牌",
          logo_file_id: FILE_ID,
          version: 4,
        })
        : fixture.service.publishPlatform(platformAuthContext, { version: 4 });

      await expect(result).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: operation === "save" ? "保存品牌草稿失败" : "发布品牌资料失败",
        details: undefined,
      });
    }
  });
});

describe("BrandProfilesService RPC error mapping", () => {
  test.each([
    [
      "BRANDING_PROFILE_VERSION_CONFLICT",
      409,
      "BRANDING_PROFILE_VERSION_CONFLICT",
    ],
    ["BRANDING_PROFILE_INCOMPLETE", 400, "BRANDING_PROFILE_INCOMPLETE"],
    ["BRANDING_LOGO_FILE_NOT_FOUND", 404, "BRANDING_LOGO_FILE_NOT_FOUND"],
    ["BRANDING_LOGO_FILE_INVALID", 400, "BRANDING_LOGO_FILE_INVALID"],
  ] as const)(
    "maps exact %s tokens without database details",
    async (token, statusCode, code) => {
      const fixture = createFixture(BrandProfilesService, {
        saveFailure: databaseError({
          code: "P0001",
          message: "Brand operation failed",
          details: `RPC error: ${token}; retry`,
        }),
      });

      await expect(fixture.service.savePlatformDraft(platformAuthContext, {
        display_name: "平台品牌",
        logo_file_id: FILE_ID,
        version: 4,
      })).rejects.toMatchObject({
        statusCode,
        code,
        details: undefined,
      });
    },
  );

  test("maps publish version conflicts after revalidating the current draft file", async () => {
    const fixture = createFixture(BrandProfilesService, {
      publishFailure: databaseError({
        code: "P0001",
        details: "BRANDING_PROFILE_VERSION_CONFLICT",
      }),
    });

    await expect(fixture.service.publishTenant(tenantAuthContext, {
      version: 3,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_PROFILE_VERSION_CONFLICT",
    });
    expect(fixture.findBrandingFileForTenant).toHaveBeenCalledTimes(1);
  });

  test("does not match known codes inside longer identifier tokens", async () => {
    for (
      const token of [
        "BRANDING_PROFILE_VERSION_CONFLICT_ARCHIVE",
        "X_BRANDING_PROFILE_INCOMPLETE",
        "prefixBRANDING_LOGO_FILE_NOT_FOUNDsuffix",
      ]
    ) {
      const fixture = createFixture(BrandProfilesService, {
        saveFailure: databaseError({ code: "P0001", details: token }),
      });

      await expect(fixture.service.savePlatformDraft(platformAuthContext, {
        display_name: "平台品牌",
        logo_file_id: FILE_ID,
        version: 4,
      })).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: undefined,
      });
    }
  });

  test("bounds circular, deeply nested, and large-array error details", async () => {
    const circular: Record<string, unknown> = { code: "P0001" };
    circular.details = circular;
    let deep: Record<string, unknown> = {
      details: "BRANDING_PROFILE_VERSION_CONFLICT",
    };
    for (let index = 0; index < 2_000; index += 1) {
      deep = { details: deep };
    }
    const large = Array.from({ length: 10_000 }, (_, index) => ({
      message: `node-${index}`,
    }));

    for (const details of [circular, deep, large]) {
      const fixture = createFixture(BrandProfilesService, {
        saveFailure: databaseError(details),
      });
      await expect(fixture.service.savePlatformDraft(platformAuthContext, {
        display_name: "平台品牌",
        logo_file_id: FILE_ID,
        version: 4,
      })).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: undefined,
      });
    }
  });
});
