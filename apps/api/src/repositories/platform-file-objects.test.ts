import { expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function loadRepositoryWithExisting(existing: Record<string, unknown>) {
  let maybeSingleCalls = 0;
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "insert", "select", "eq", "is", "order", "limit"]) {
    builder[method] = mock(() => builder);
  }
  builder.maybeSingle = mock(async () => {
    maybeSingleCalls += 1;
    if (maybeSingleCalls === 1) return { data: null, error: { code: "23505" } };
    return { data: existing, error: null };
  });

  mock.module("@/utils/supabase", () => ({
    SupabaseDB: { getAdminClient: () => builder },
  }));
  return (await import("./platform-file-objects")).platformFileObjectRepository;
}

const privateInput = {
  owner_type: "visitor",
  owner_visitor_id: "visitor-b",
  scene: "tenant_onboarding_license",
  provider: "tencent_cos" as const,
  bucket: "bucket",
  object_key: "private/object.jpg",
  mime_type: "image/jpeg",
  size_bytes: 100,
  checksum: "head-etag",
  visibility: "private" as const,
  public_url: null,
};

const matchingExisting = {
  id: "file-1",
  owner_type: "visitor",
  owner_visitor_id: "visitor-b",
  scene: "tenant_onboarding_license",
  provider: "tencent_cos",
  bucket: "bucket",
  object_key: "private/object.jpg",
  mime_type: "image/jpeg",
  size_bytes: 100,
  checksum: '"head-etag"',
  visibility: "private",
  public_url: null,
  status: "active",
  deleted_at: null,
};

test("duplicate private object keys cannot cross visitor ownership", async () => {
  const repository = await loadRepositoryWithExisting({
    ...matchingExisting,
    owner_visitor_id: "visitor-a",
  });

  await expect(repository.createOrFindByObjectKey(privateInput))
    .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
});

test("duplicate visitor objects must preserve private visibility", async () => {
  const repository = await loadRepositoryWithExisting({
    ...matchingExisting,
    visibility: "public",
    public_url: "https://cdn.example.com/private/object.jpg",
  });

  await expect(repository.createOrFindByObjectKey(privateInput))
    .rejects.toMatchObject({ statusCode: 400, code: "FILE_STORAGE_UPLOAD_FAILED" });
});

test.each([
  ["inactive status", { status: "deleted", deleted_at: null }],
  ["deleted timestamp", { status: "active", deleted_at: "2026-07-14T00:00:00Z" }],
])("duplicate visitor objects reject %s", async (_name, state) => {
  const repository = await loadRepositoryWithExisting({
    ...matchingExisting,
    ...state,
  });

  await expect(repository.createOrFindByObjectKey(privateInput))
    .rejects.toMatchObject({ statusCode: 400, code: "FILE_STORAGE_UPLOAD_FAILED" });
});

test.each([
  ["provider", { provider: "supabase_storage" }],
  ["bucket", { bucket: "other-bucket" }],
  ["object key", { object_key: "private/other.jpg" }],
  ["MIME type", { mime_type: "image/png" }],
  ["size", { size_bytes: 101 }],
  ["checksum", { checksum: "other-etag" }],
])("duplicate private objects reject mismatched %s", async (_name, mismatch) => {
  const repository = await loadRepositoryWithExisting({
    ...matchingExisting,
    ...mismatch,
  });

  await expect(repository.createOrFindByObjectKey(privateInput))
    .rejects.toMatchObject({ statusCode: 400, code: "FILE_STORAGE_UPLOAD_FAILED" });
});

test("duplicate private objects accept exact authoritative metadata", async () => {
  const repository = await loadRepositoryWithExisting(matchingExisting);

  await expect(repository.createOrFindByObjectKey(privateInput))
    .resolves.toMatchObject({ id: "file-1", checksum: '"head-etag"' });
});
