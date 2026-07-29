import { expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type QueryTrace = {
  equals: Array<[string, unknown]>;
  nullChecks: Array<[string, unknown]>;
  selects: string[];
  limits?: unknown[];
};

async function createScopedRepository(
  existing: Record<string, unknown> | null,
  error: unknown = null,
) {
  const { PlatformFileObjectRepository } = await import(
    "./platform-file-objects"
  );
  const trace: QueryTrace = {
    equals: [],
    nullChecks: [],
    selects: [],
  };
  const builder: Record<string, unknown> = {};
  builder.select = mock((columns: string) => {
    trace.selects.push(columns);
    return builder;
  });
  builder.eq = mock((field: string, value: unknown) => {
    trace.equals.push([field, value]);
    return builder;
  });
  builder.is = mock((field: string, value: unknown) => {
    trace.nullChecks.push([field, value]);
    return builder;
  });
  builder.maybeSingle = mock(async () => ({ data: existing, error }));
  const client = {
    from: mock(() => builder),
  };

  return {
    repository: new PlatformFileObjectRepository(() => client as never),
    trace,
  };
}

async function loadRepositoryWithExisting(
  existing: Record<string, unknown>,
  trace?: QueryTrace,
  honorStatusFilter = false,
  directLookup = false,
) {
  let maybeSingleCalls = 0;
  let statusFilterMatches = true;
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "insert", "order"]) {
    builder[method] = mock(() => builder);
  }
  builder.limit = mock((limit: unknown) => {
    trace?.limits?.push(limit);
    return builder;
  });
  builder.select = mock((columns: string) => {
    trace?.selects.push(columns);
    return builder;
  });
  builder.eq = mock((field: string, value: unknown) => {
    trace?.equals.push([field, value]);
    if (field === "status" && existing.status !== value) {
      statusFilterMatches = false;
    }
    return builder;
  });
  builder.is = mock((field: string, value: unknown) => {
    trace?.nullChecks.push([field, value]);
    return builder;
  });
  builder.maybeSingle = mock(async () => {
    if (directLookup) return { data: existing, error: null };
    maybeSingleCalls += 1;
    if (maybeSingleCalls === 1) return { data: null, error: { code: "23505" } };
    if (honorStatusFilter && !statusFilterMatches) {
      return { data: null, error: null };
    }
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

test.each(["failed", "migrating", "deleted"])(
  "private conflict lookup exposes a %s row to invariant validation",
  async (status) => {
    const trace: QueryTrace = { equals: [], nullChecks: [], selects: [] };
    const repository = await loadRepositoryWithExisting(
      { ...matchingExisting, status },
      trace,
      true,
    );

    await expect(repository.createOrFindByObjectKey(privateInput))
      .rejects.toMatchObject({ statusCode: 400, code: "FILE_STORAGE_UPLOAD_FAILED" });
    expect(trace.equals).toEqual(expect.arrayContaining([
      ["provider", "tencent_cos"],
      ["bucket", "bucket"],
      ["object_key", "private/object.jpg"],
    ]));
    expect(trace.equals).not.toContainEqual(["status", "active"]);
    expect(trace.nullChecks).toContainEqual(["deleted_at", null]);
  },
);

test("public conflict recovery keeps the active-only legacy lookup", async () => {
  const trace: QueryTrace = { equals: [], nullChecks: [], selects: [] };
  const repository = await loadRepositoryWithExisting(matchingExisting, trace, true);

  await expect(repository.createOrFindByObjectKey({
    ...privateInput,
    owner_type: "project",
    owner_visitor_id: null,
    scene: "project_attachment",
    visibility: "public",
  })).resolves.toMatchObject({ id: "file-1" });
  expect(trace.equals).toContainEqual(["status", "active"]);
});

test("findActiveById scopes the minimum OCR projection to one tenant", async () => {
  const trace: QueryTrace = { equals: [], nullChecks: [], selects: [] };
  const repository = await loadRepositoryWithExisting(
    matchingExisting,
    trace,
    false,
    true,
  );

  await expect(repository.findActiveById({
    id: "file-1",
    tenantId: "tenant-1",
  })).resolves.toMatchObject({ id: "file-1" });

  expect(trace.selects).toEqual([
    "id,tenant_id,owner_type,owner_id,scene,provider,bucket,region,object_key,mime_type,size_bytes,checksum,visibility,status,deleted_at,created_by_employee_id",
  ]);
  expect(trace.equals).toEqual(expect.arrayContaining([
    ["id", "file-1"],
    ["tenant_id", "tenant-1"],
    ["status", "active"],
  ]));
  expect(trace.nullChecks).toContainEqual(["deleted_at", null]);
});

test("findSupplierBusinessLicensePreviewById uses a bounded minimum projection", async () => {
  const trace: QueryTrace = {
    equals: [],
    nullChecks: [],
    selects: [],
    limits: [],
  };
  const repository = await loadRepositoryWithExisting(
    matchingExisting,
    trace,
    false,
    true,
  );

  await expect(repository.findSupplierBusinessLicensePreviewById("file-1"))
    .resolves.toMatchObject({ id: "file-1" });

  expect(trace.selects).toEqual([
    "id,tenant_id,owner_type,owner_id,scene,provider,object_key,mime_type,size_bytes,checksum,visibility,status,deleted_at,created_by_employee_id",
  ]);
  expect(trace.equals).toEqual(expect.arrayContaining([
    ["id", "file-1"],
    ["status", "active"],
  ]));
  expect(trace.nullChecks).toContainEqual(["deleted_at", null]);
  expect(trace.limits).toEqual([1]);
});

test("platform brand Logo binding lookup filters only by id and null owner", async () => {
  const { repository, trace } = await createScopedRepository(matchingExisting);

  await expect(repository.findPlatformBrandLogoForBinding("file-1"))
    .resolves.toMatchObject({ id: "file-1" });

  expect(trace.selects).toEqual([
    "id,tenant_id,owner_type,owner_id,scene,provider,bucket,region,object_key,mime_type,size_bytes,width,height,checksum,visibility,public_url,status,deleted_at",
  ]);
  expect(trace.equals).toEqual([["id", "file-1"]]);
  expect(trace.nullChecks).toEqual([["tenant_id", null]]);
});

test("tenant brand Logo binding lookup filters only by id and exact owner", async () => {
  const { repository, trace } = await createScopedRepository({
    ...matchingExisting,
    tenant_id: "tenant-1",
  });

  await expect(repository.findTenantBrandLogoForBinding("file-1", "tenant-1"))
    .resolves.toMatchObject({ id: "file-1", tenant_id: "tenant-1" });

  expect(trace.equals).toEqual([
    ["id", "file-1"],
    ["tenant_id", "tenant-1"],
  ]);
  expect(trace.nullChecks).toEqual([]);
});

test("binding lookup returns same-scope invalid metadata for policy classification", async () => {
  const invalid = {
    ...matchingExisting,
    tenant_id: "tenant-1",
    owner_id: null,
    region: null,
    scene: "project_attachment",
    provider: "tencent_cos" as const,
    status: "failed",
    visibility: "private" as const,
    width: 128,
    height: 128,
    deleted_at: "2026-07-27T00:00:00.000Z",
  };
  const { repository } = await createScopedRepository(invalid);

  await expect(repository.findTenantBrandLogoForBinding(
    "file-1",
    "tenant-1",
  )).resolves.toEqual(invalid);
});

test("brand Logo lookup maps Supabase failures through the error factory", async () => {
  const databaseError = { code: "XX000", message: "lookup failed" };
  const { repository } = await createScopedRepository(null, databaseError);

  await expect(repository.findTenantBrandLogoForBinding("file-1", "tenant-1"))
    .rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: databaseError,
    });
});

test("brand Logo repository exposes only explicit platform and tenant scopes", async () => {
  const { PlatformFileObjectRepository } = await import(
    "./platform-file-objects"
  );
  const publicMethods = Object.getOwnPropertyNames(
    PlatformFileObjectRepository.prototype,
  );

  expect(publicMethods).toContain("findPlatformBrandLogoForBinding");
  expect(publicMethods).toContain("findTenantBrandLogoForBinding");
  expect(publicMethods).not.toContain("findActivePlatformBrandLogo");
  expect(publicMethods).not.toContain("findActiveTenantBrandLogo");
  expect(publicMethods).not.toContain("findBrandLogoForBinding");
});
