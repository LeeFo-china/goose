import { beforeEach, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const contains = mock((_column: string, _value: unknown) => query);
const eq = mock((_column: string, _value: unknown) => query);
const limit = mock((_value: number) => query);
const maybeSingle = mock(async () => ({
  data: {
    id: "applyment-1",
    tenant_id: "tenant-1",
    status: "draft",
  },
  error: null,
}));
const select = mock((_columns: string) => query);
const query = { contains, eq, limit, maybeSingle };

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => ({ select }),
    }),
  },
}));

beforeEach(() => {
  contains.mockClear();
  eq.mockClear();
  limit.mockClear();
  maybeSingle.mockClear();
  select.mockClear();
});

test("serializes the JSONB attachment owner filter for PostgREST", async () => {
  const { findWechatPayApplymentAttachmentOwner } = await import(
    "./wechat-pay-applyment-attachment-repository"
  );
  const fileObjectId = "458b08fa-2a08-4d0d-9121-046502db7e57";

  await expect(findWechatPayApplymentAttachmentOwner({
    fileObjectId,
    tenantId: "tenant-1",
  })).resolves.toMatchObject({ id: "applyment-1" });

  expect(contains).toHaveBeenCalledWith(
    "attachments",
    JSON.stringify([{ file_object_id: fileObjectId }]),
  );
  expect(eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  expect(limit).toHaveBeenCalledWith(1);
});
