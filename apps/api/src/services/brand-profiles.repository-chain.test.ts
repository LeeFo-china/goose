import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

import {
  FILE_ID,
  OTHER_TENANT_ID,
  platformAuthContext,
  platformFile,
} from "./brand-profiles.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let BrandProfilesService:
  typeof import("./brand-profiles").BrandProfilesService;
let BrandingRepository:
  typeof import("@/repositories/branding").BrandingRepository;
let PlatformFileObjectRepository:
  typeof import("@/repositories/platform-file-objects")
    .PlatformFileObjectRepository;

beforeAll(async () => {
  ({ BrandProfilesService } = await import("./brand-profiles"));
  ({ BrandingRepository } = await import("@/repositories/branding"));
  ({ PlatformFileObjectRepository } = await import(
    "@/repositories/platform-file-objects"
  ));
});

function createService(record: Record<string, unknown>) {
  const predicates: Array<{
    method: "eq" | "is";
    field: string;
    value: unknown;
  }> = [];
  const fileBuilder: Record<string, unknown> = {};
  fileBuilder.select = mock(() => fileBuilder);
  fileBuilder.eq = mock((field: string, value: unknown) => {
    predicates.push({ method: "eq", field, value });
    return fileBuilder;
  });
  fileBuilder.is = mock((field: string, value: unknown) => {
    predicates.push({ method: "is", field, value });
    return fileBuilder;
  });
  fileBuilder.maybeSingle = mock(async () => ({
    data: predicates.every(({ field, value }) => record[field] === value)
      ? record
      : null,
    error: null,
  }));
  const fileClient = { from: mock(() => fileBuilder) };
  const fileRepository = new PlatformFileObjectRepository(
    () => fileClient as never,
  );
  const rpc = mock(async () => {
    throw new Error("brand mutation RPC must not run");
  });
  const brandingRepository = new BrandingRepository(
    () => ({ from: mock(() => ({})), rpc }) as never,
    fileRepository,
  );
  const service = new BrandProfilesService({
    brandingRepository,
    accessPolicyService: {
      assertTenantContext: (authContext: AuthContext) => {
        if (!authContext.tenantId) throw new Error("tenant required");
        return authContext.tenantId;
      },
      hasPermission: (
        authContext: AuthContext,
        permissionCode: string,
      ) => authContext.permissions.some(({ code }) => code === permissionCode),
    },
    tenantEntitlementsService: {
      getTenantSummary: mock(async () => null),
      assertCanCustomize: mock(async () => ({
        tenantId: OTHER_TENANT_ID,
        entitlement: {},
      })),
    },
  } as never);
  return { predicates, rpc, service };
}

describe("BrandProfilesService real branding repository chain", () => {
  test("same-scope invalid metadata reaches policy and returns 400", async () => {
    const fixture = createService({
      ...platformFile,
      status: "failed",
      deleted_at: "2026-07-27T00:00:00.000Z",
    });

    await expect(fixture.service.savePlatformDraft(platformAuthContext, {
      display_name: "平台品牌",
      logo_file_id: FILE_ID,
      version: 4,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
    expect(fixture.predicates).toEqual([
      { method: "eq", field: "id", value: FILE_ID },
      { method: "is", field: "tenant_id", value: null },
    ]);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  test("foreign-scope files remain hidden as 404", async () => {
    const fixture = createService({
      ...platformFile,
      tenant_id: OTHER_TENANT_ID,
    });

    await expect(fixture.service.savePlatformDraft(platformAuthContext, {
      display_name: "平台品牌",
      logo_file_id: FILE_ID,
      version: 4,
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "BRANDING_LOGO_FILE_NOT_FOUND",
    });
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});
