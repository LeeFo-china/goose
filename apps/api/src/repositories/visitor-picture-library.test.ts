import { beforeEach, describe, expect, mock, test } from "bun:test";

let directSql: DirectSqlMock | null = null;

type SqlFragment = {
  strings: string[];
  values: unknown[];
};

type DirectSqlMock = ((
  first: TemplateStringsArray | unknown[],
  ...values: unknown[]
) => Promise<unknown[]> | SqlFragment);

const directSqlQueries: SqlFragment[] = [];

class FailingSupabaseQuery {
  select() {
    return this;
  }

  in() {
    return this;
  }

  eq() {
    return this;
  }

  async is() {
    return {
      data: null,
      error: { message: "502 Bad Gateway" },
    };
  }
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => new FailingSupabaseQuery(),
    }),
  },
}));

mock.module("@/utils/postgres-direct", () => ({
  getDirectPostgresSql: () => directSql,
}));

function createDirectSqlMock(): DirectSqlMock {
  let relationQueryInFlight = false;
  return ((first: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if (!("raw" in first)) {
      return { strings: ["IN"], values: [first] };
    }

    const fragment = { strings: Array.from(first), values };
    directSqlQueries.push(fragment);
    const sqlText = fragment.strings.join(" ");
    if (sqlText.includes("FROM public.picture_assets")) {
      return Promise.resolve([{
        id: "asset-1",
        title: "封面图",
        description: null,
        width: 240,
        height: 320,
        like_count: 0,
        favorite_count: 0,
        comment_count: 0,
        share_count: 0,
        sort_order: 1,
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      }]);
    }
    if (sqlText.includes("FROM public.picture_asset_variants")) {
      if (relationQueryInFlight) throw new Error("relation queries overlapped");
      relationQueryInFlight = true;
      return Promise.resolve([{
        asset_id: "asset-1",
        variant: "cover",
        object_key: "project-logs/cover.jpg",
        width: 240,
        height: 320,
        file_size: 12345,
        mime_type: "image/jpeg",
      }]).finally(() => {
        relationQueryInFlight = false;
      });
    }
    if (sqlText.includes("FROM public.picture_asset_categories")) {
      if (relationQueryInFlight) throw new Error("relation queries overlapped");
      relationQueryInFlight = true;
      return Promise.resolve([{
        asset_id: "asset-1",
        id: "category-1",
        name: "客厅",
        slug: "living-room",
        description: null,
        cover_asset_id: "asset-1",
        sort_order: 1,
      }]).finally(() => {
        relationQueryInFlight = false;
      });
    }

    return Promise.resolve([]);
  }) as DirectSqlMock;
}

describe("visitorPictureLibraryRepository", () => {
  beforeEach(() => {
    directSqlQueries.length = 0;
    directSql = null;
  });

  test("loads cover assets through direct Postgres when the Rest query path fails", async () => {
    directSql = createDirectSqlMock();
    const { visitorPictureLibraryRepository } = await import(
      "./visitor-picture-library"
    );

    const result = await visitorPictureLibraryRepository.findCoverAssets([
      "asset-1",
    ]);

    expect(directSqlQueries).toHaveLength(3);
    expect(result.get("asset-1")?.variants[0]?.variant).toBe("cover");
    expect(result.get("asset-1")?.categories[0]?.id).toBe("category-1");
  });
});
