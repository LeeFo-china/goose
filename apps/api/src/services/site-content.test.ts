import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { SiteContentPublicSummaryRecord } from "@/repositories/site-content";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let SiteContentService: typeof import("./site-content").SiteContentService;

beforeAll(async () => {
  ({ SiteContentService } = await import("./site-content"));
});

const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  content_type: "article" as const,
  slug: "first-article",
  status: "draft" as const,
  published_version_id: null,
  published_at: null,
  created_at: "2026-07-12T00:00:00.000Z",
  updated_at: "2026-07-12T00:00:00.000Z",
};
const version = {
  id: "22222222-2222-4222-8222-222222222222",
  entry_id: entry.id,
  version_no: 1,
  title: "首篇文章",
  summary: "摘要",
  cover_file_id: "33333333-3333-4333-8333-333333333333",
  content_blocks: [{ type: "image" as const, fileId: "44444444-4444-4444-8444-444444444444", alt: "正文配图" }],
  seo_title: "SEO",
  seo_description: "SEO 描述",
  canonical_url: "https://www.goodcms.cn/articles/first-article",
  metadata: { category: "行业观察", author: "古德", displayPublishedAt: "2026-07-12T08:00:00+08:00" },
  created_by: "actor-id",
  created_at: "2026-07-12T00:00:00.000Z",
};
const assets = [
  { id: version.cover_file_id, public_url: "https://cdn.goodcms.cn/cover.jpg", width: 1200, height: 630, status: "active", visibility: "public" },
  { id: version.content_blocks[0]!.fileId, public_url: "https://cdn.goodcms.cn/body.jpg", width: 800, height: 600, status: "active", visibility: "public" },
];

function auth(permissionCodes: string[]): AuthContext {
  return {
    authUserId: "auth-user-id",
    employeeId: "actor-id",
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "运营",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: "all" as const })),
  };
}

function dependencies(options: {
  listPublic?: () => Promise<{
    list: SiteContentPublicSummaryRecord[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>;
  findPublicAssets?: () => Promise<typeof assets>;
  findPublic?: () => Promise<null | (Omit<typeof entry, "status" | "published_at" | "published_version_id"> & {
    status: "published";
    published_at: string;
    published_version_id: string;
    published_version: Omit<typeof version, "content_blocks"> & { content_blocks: unknown };
  })>;
  consumePreviewToken?: () => Promise<null | { entry_id: string; version_id: string; expires_at: string; consumed_at: string }>;
  revalidate?: () => Promise<{ requestId?: string }>;
  findEntry?: () => Promise<typeof entry | (Omit<typeof entry, "status" | "published_version_id" | "published_at"> & {
    status: "published";
    published_version_id: string;
    published_at: string;
  })>;
  previewBaseUrl?: string;
} = {}) {
  const findPublic: NonNullable<typeof options.findPublic> =
    options.findPublic ?? (async () => null);
  const consumePreviewToken: NonNullable<typeof options.consumePreviewToken> =
    options.consumePreviewToken ?? (async () => ({ entry_id: entry.id, version_id: version.id, expires_at: "2026-07-12T10:10:00.000Z", consumed_at: "2026-07-12T10:00:00.000Z" }));
  const repository = {
    listPublic: mock(options.listPublic ?? (async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }))),
    findPublic: mock(findPublic),
    listAdmin: mock(async () => ({ list: [entry], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } })),
    findEntry: mock(options.findEntry ?? (async () => entry)),
    createEntry: mock(async () => entry),
    updateEntry: mock(async () => entry),
    deleteDraftEntry: mock(async () => true),
    listVersions: mock(async () => ({ list: [version], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } })),
    findVersion: mock(async () => version),
    createVersion: mock(async () => version),
    findPublicAssets: mock(options.findPublicAssets ?? (async () => assets)),
    publish: mock(async () => ({ ...entry, status: "published" as const, published_version_id: version.id, published_at: "2026-07-12T01:00:00.000Z" })),
    rollback: mock(async () => ({ ...entry, status: "published" as const, published_version_id: version.id, published_at: "2026-07-12T01:00:00.000Z" })),
    archive: mock(async () => ({ ...entry, status: "archived" as const })),
    createPreviewToken: mock(async () => ({ id: "token-id" })),
    consumePreviewToken: mock(consumePreviewToken),
  };
  const accessPolicy = {
    assertPermission: mock((context: AuthContext, code: string) => {
      if (!context.permissions.some((permission) => permission.code === code)) throw new Error(`forbidden:${code}`);
      return "all" as const;
    }),
  };
  const audit = { recordBestEffort: mock(async () => null) };
  const revalidator = { revalidate: mock(options.revalidate ?? (async () => ({ requestId: "request-1" }))) };
  return {
    repository,
    accessPolicy,
    audit,
    revalidator,
    clock: () => new Date("2026-07-12T10:00:00.000Z"),
    tokenGenerator: () => "x".repeat(43),
    previewBaseUrl: options.previewBaseUrl ?? "https://www-dev.goodcms.cn",
  };
}

describe("SiteContentService", () => {
  test("checks read, manage and publish permissions at their boundaries", async () => {
    const deps = dependencies();
    const service = new SiteContentService(deps);

    await service.listAdmin(auth(["platform.site_content.read"]), { page: 1, pageSize: 20 });
    await service.createVersion(auth(["platform.site_content.manage"]), entry.id, {
      title: version.title,
      summary: version.summary,
      coverFileId: version.cover_file_id,
      blocks: version.content_blocks,
      metadata: version.metadata,
    });
    await service.publish(auth(["platform.site_content.publish"]), entry.id, version.id);

    expect(deps.accessPolicy.assertPermission.mock.calls.map((call) => call[1])).toEqual([
      "platform.site_content.read",
      "platform.site_content.manage",
      "platform.site_content.publish",
    ]);
  });

  test("denies read, manage and publish operations before repository writes", async () => {
    const deps = dependencies();
    const service = new SiteContentService(deps);

    await expect(service.listAdmin(auth([]), { page: 1, pageSize: 20 }))
      .rejects.toThrow("forbidden:platform.site_content.read");
    await expect(service.createVersion(auth([]), entry.id, {
      title: version.title,
      blocks: [],
      metadata: version.metadata,
    })).rejects.toThrow("forbidden:platform.site_content.manage");
    await expect(service.publish(auth([]), entry.id, version.id))
      .rejects.toThrow("forbidden:platform.site_content.publish");
    expect(deps.repository.createVersion).not.toHaveBeenCalled();
    expect(deps.repository.publish).not.toHaveBeenCalled();
  });

  test("rejects missing or untrusted assets with one batch lookup", async () => {
    const deps = dependencies({ findPublicAssets: async () => [assets[0]!] });
    const service = new SiteContentService(deps);

    await expect(service.createVersion(auth(["platform.site_content.manage"]), entry.id, {
      title: version.title,
      coverFileId: version.cover_file_id,
      blocks: version.content_blocks,
      metadata: version.metadata,
    })).rejects.toMatchObject({ code: "SITE_CONTENT_ASSET_UNAVAILABLE" });
    expect(deps.repository.findPublicAssets).toHaveBeenCalledTimes(1);
    expect(deps.repository.createVersion).not.toHaveBeenCalled();
  });

  test("builds a public DTO with trusted assets and no internal fields", async () => {
    const deps = dependencies({ findPublic: async () => ({
      ...entry,
      status: "published" as const,
      published_at: "2026-07-12T01:00:00.000Z",
      published_version_id: version.id,
      published_version: version,
    }) });
    const service = new SiteContentService(deps);

    const result = await service.getPublic("article", entry.slug);

    expect(result.cover?.src).toBe("https://cdn.goodcms.cn/cover.jpg");
    expect(result.blocks[0]).toMatchObject({ type: "image", asset: { src: "https://cdn.goodcms.cn/body.jpg" } });
    expect(JSON.stringify(result)).not.toContain("created_by");
    expect(JSON.stringify(result)).not.toContain("published_version_id");
  });

  test("builds public summaries without reading or validating detail blocks", async () => {
    const deps = dependencies({ listPublic: async () => ({
      list: [{
        ...entry,
        status: "published",
        published_at: "2026-07-12T01:00:00.000Z",
        published_version_id: version.id,
        published_version: {
          id: version.id,
          title: version.title,
          summary: version.summary,
          cover_file_id: version.cover_file_id,
          content_blocks: [{ type: "html", html: "must not be selected" }],
        },
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }) });

    const result = await new SiteContentService(deps).listPublic("article", { page: 1, pageSize: 20 });

    expect(result.list).toHaveLength(1);
    expect(result.list[0]).not.toHaveProperty("blocks");
    expect(deps.repository.findPublicAssets).toHaveBeenCalledWith([version.cover_file_id]);
  });

  test("validates the public list envelope and reports page overflow explicitly", async () => {
    const summary = {
      ...entry,
      status: "published" as const,
      published_at: "2026-07-12T01:00:00.000Z",
      published_version_id: version.id,
      published_version: { id: version.id, title: version.title, summary: version.summary, cover_file_id: null },
    };
    const legalLastPage = dependencies({ listPublic: async () => ({
      list: [summary],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    }) });
    const legal = await new SiteContentService(legalLastPage).listPublic("article", { page: 2, pageSize: 20 });
    expect(legal.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });

    const overflow = dependencies({ listPublic: async () => ({
      list: [],
      pagination: { page: 3, pageSize: 20, total: 21, totalPages: 2 },
    }) });
    await expect(new SiteContentService(overflow).listPublic("article", { page: 3, pageSize: 20 }))
      .rejects.toMatchObject({ code: "SITE_CONTENT_PAGE_OUT_OF_RANGE" });

    const inconsistent = dependencies({ listPublic: async () => ({
      list: [],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    }) });
    await expect(new SiteContentService(inconsistent).listPublic("article", { page: 2, pageSize: 20 }))
      .rejects.toMatchObject({ code: "SITE_CONTENT_DATA_INVALID" });
  });

  test("rejects untrusted database blocks and non-HTTP asset URLs", async () => {
    const malicious = dependencies({ findPublic: async () => ({
      ...entry,
      status: "published" as const,
      published_at: "2026-07-12T01:00:00.000Z",
      published_version_id: version.id,
      published_version: { ...version, content_blocks: [{ type: "html", html: "<script />" }] },
    }) });
    await expect(new SiteContentService(malicious).getPublic("article", entry.slug))
      .rejects.toMatchObject({ code: "SITE_CONTENT_DATA_INVALID" });

    const invalidUrl = dependencies({
      findPublic: async () => ({
        ...entry,
        status: "published" as const,
        published_at: "2026-07-12T01:00:00.000Z",
        published_version_id: version.id,
        published_version: version,
      }),
      findPublicAssets: async () => assets.map((asset) => ({ ...asset, public_url: "httpjavascript:alert(1)" })),
    });
    await expect(new SiteContentService(invalidUrl).getPublic("article", entry.slug))
      .rejects.toMatchObject({ code: "SITE_CONTENT_ASSET_UNAVAILABLE" });
  });

  test("compensates a new draft entry when its first version fails", async () => {
    const deps = dependencies();
    deps.repository.createVersion.mockImplementationOnce(async () => { throw new Error("version failed"); });
    const service = new SiteContentService(deps);

    await expect(service.createEntry(auth(["platform.site_content.manage"]), {
      contentType: "article",
      slug: entry.slug,
      version: {
        title: version.title,
        blocks: [],
        metadata: { category: "行业观察", author: "古德", displayPublishedAt: "2026-07-12T08:00:00+08:00" },
      },
    })).rejects.toThrow("version failed");
    expect(deps.repository.deleteDraftEntry).toHaveBeenCalledWith(entry.id);
  });

  test("uses the repository concurrency boundary when creating the next version", async () => {
    const deps = dependencies();
    const service = new SiteContentService(deps);
    await service.createVersion(auth(["platform.site_content.manage"]), entry.id, {
      title: version.title,
      blocks: [],
      metadata: version.metadata,
    });
    expect(deps.repository.createVersion).toHaveBeenCalledWith(entry.id, expect.any(Object), "actor-id");
  });

  test("rejects slug changes for published entries before writing", async () => {
    const deps = dependencies({ findEntry: async () => ({
      ...entry,
      status: "published" as const,
      published_version_id: version.id,
      published_at: "2026-07-12T01:00:00.000Z",
    }) });

    await expect(new SiteContentService(deps).updateEntry(
      auth(["platform.site_content.manage"]),
      entry.id,
      { slug: "renamed-article" },
    )).rejects.toMatchObject({ code: "SITE_CONTENT_PUBLISHED_SLUG_IMMUTABLE" });
    expect(deps.repository.updateEntry).not.toHaveBeenCalled();
  });

  test("publishes through RPC, audits and preserves success when revalidation fails", async () => {
    const deps = dependencies({ revalidate: async () => { throw new Error("web unavailable"); } });
    const service = new SiteContentService(deps);

    const result = await service.publish(auth(["platform.site_content.publish"]), entry.id, version.id);

    expect(deps.repository.publish).toHaveBeenCalledWith(entry.id, version.id, "actor-id");
    expect(result.cache_revalidation).toEqual({ status: "failed" });
    expect(deps.audit.recordBestEffort).toHaveBeenCalledTimes(2);
    expect(deps.audit.recordBestEffort).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "failure",
      metadata: expect.objectContaining({ operation: "publish_revalidation_failed" }),
    }));
  });

  test("rolls back, archives and writes audit events", async () => {
    const deps = dependencies();
    const service = new SiteContentService(deps);
    const context = auth(["platform.site_content.publish"]);

    await service.rollback(context, entry.id, version.id);
    await service.archive(context, entry.id);

    expect(deps.repository.rollback).toHaveBeenCalled();
    expect(deps.repository.archive).toHaveBeenCalledWith(entry.id);
    expect(deps.audit.recordBestEffort).toHaveBeenCalledTimes(2);
  });

  test("keeps archive successful and auditable when cache revalidation fails", async () => {
    const deps = dependencies({ revalidate: async () => { throw new Error("web unavailable"); } });
    const result = await new SiteContentService(deps).archive(
      auth(["platform.site_content.publish"]),
      entry.id,
    );

    expect(result.cache_revalidation).toEqual({ status: "failed" });
    expect(deps.audit.recordBestEffort).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "failure",
      metadata: expect.objectContaining({ operation: "archive_revalidation_failed" }),
    }));
  });

  test("keeps rollback successful and records its cache failure operation", async () => {
    const deps = dependencies({ revalidate: async () => { throw new Error("web unavailable"); } });
    const result = await new SiteContentService(deps).rollback(
      auth(["platform.site_content.publish"]),
      entry.id,
      version.id,
    );

    expect(result.cache_revalidation).toEqual({ status: "failed" });
    expect(deps.audit.recordBestEffort).toHaveBeenLastCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ operation: "rollback_revalidation_failed" }),
    }));
  });

  test("creates a single-use token with an exact ten-minute expiry", async () => {
    const deps = dependencies();
    const service = new SiteContentService(deps);

    const result = await service.createPreviewToken(auth(["platform.site_content.read"]), entry.id, version.id);

    expect(result).toEqual({
      previewUrl: `https://www-dev.goodcms.cn/api/preview?token=${"x".repeat(43)}`,
      expiresAt: "2026-07-12T10:10:00.000Z",
    });
    expect(deps.repository.createPreviewToken).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: "2026-07-12T10:10:00.000Z" }));
  });

  test("validates the preview base URL before storing a token", async () => {
    const deps = dependencies({ previewBaseUrl: "ftp://www-dev.goodcms.cn" });
    await expect(new SiteContentService(deps).createPreviewToken(
      auth(["platform.site_content.read"]),
      entry.id,
      version.id,
    )).rejects.toMatchObject({ code: "SITE_PREVIEW_URL_UNAVAILABLE" });
    expect(deps.repository.createPreviewToken).not.toHaveBeenCalled();
  });

  test("rejects an already consumed or expired token", async () => {
    const deps = dependencies({ consumePreviewToken: async () => null });
    const service = new SiteContentService(deps);

    await expect(service.consumePreviewToken("x".repeat(43))).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_PREVIEW_TOKEN" });
    expect(deps.repository.consumePreviewToken).toHaveBeenCalledWith("x".repeat(43), "2026-07-12T10:00:00.000Z");
  });
});
