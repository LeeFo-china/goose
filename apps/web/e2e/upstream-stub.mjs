import { createServer } from "node:http";

const publishedAt = "2026-07-12T08:00:00+08:00";
const previewEntryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const previewVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const validPreviewToken = "e2e-preview-token-that-is-long-enough";

const articleSummaries = Array.from({ length: 101 }, (_, index) => {
  const number = index + 1;
  return {
    id: `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    contentType: "article",
    slug: number === 1 ? "e2e-article" : `e2e-article-${number}`,
    title: number === 1 ? "可发布的装修文章" : `分页文章 ${number}`,
    summary: "用于官网发布质量门的稳定文章数据。",
    cover: null,
    publishedAt,
    metadata: {
      category: "装修经营",
      author: "内容编辑",
      displayPublishedAt: publishedAt,
    },
  };
});

const caseSummary = {
  id: "20000000-0000-4000-8000-000000000001",
  contentType: "case",
  slug: "e2e-case",
  title: "上海住宅交付案例",
  summary: "用于官网发布质量门的稳定案例数据。",
  cover: null,
  publishedAt,
  metadata: {
    city: "上海",
    areaSquareMeters: 128,
    decorationType: "全案",
    metrics: [{ label: "工期", value: "86 天" }],
  },
};

const citySummary = {
  id: "30000000-0000-4000-8000-000000000001",
  contentType: "city",
  slug: "shanghai",
  title: "上海装修协作服务",
  summary: "上海本地装修协作服务。",
  cover: null,
  publishedAt,
  metadata: {
    administrativeCode: "310000",
    cityName: "上海",
    localServiceIntroduction: "连接上海装修企业、项目团队与城市合作伙伴。",
  },
};

const allContentFixtures = [
  ...articleSummaries.map((summary) => ({ status: "published", summary })),
  { status: "published", summary: caseSummary },
  { status: "published", summary: citySummary },
  {
    status: "draft",
    summary: {
      ...articleSummaries[0],
      id: "40000000-0000-4000-8000-000000000001",
      slug: "draft-article",
      title: "不应公开的草稿文章",
    },
  },
  {
    status: "archived",
    summary: {
      ...caseSummary,
      id: "50000000-0000-4000-8000-000000000001",
      slug: "archived-case",
      title: "不应公开的归档案例",
    },
  },
];

const articleDetail = {
  ...articleSummaries[0],
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  blocks: [{ type: "paragraph", text: "文章正文用于验证公开内容渲染。" }],
};
const caseDetail = {
  ...caseSummary,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  blocks: [{ type: "paragraph", text: "案例正文用于验证公开内容渲染。" }],
};
const cityDetail = {
  ...citySummary,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  blocks: [{ type: "paragraph", text: "城市正文用于验证公开内容渲染。" }],
};
const previewDetail = {
  ...articleDetail,
  id: previewEntryId,
  slug: "e2e-preview",
  title: "预览中的文章",
  preview: true,
  versionId: previewVersionId,
};

function envelope(data) {
  return { data, message: "ok" };
}

function listPage(list, requestUrl) {
  const page = Number(requestUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(requestUrl.searchParams.get("pageSize") ?? "20");
  const start = (page - 1) * pageSize;
  return {
    list: list.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: list.length,
      totalPages: list.length === 0 ? 0 : Math.ceil(list.length / pageSize),
    },
  };
}

function publishedSummaries(contentType) {
  return allContentFixtures
    .filter((entry) => entry.status === "published" && entry.summary.contentType === contentType)
    .map((entry) => entry.summary);
}

function fixtureFor(requestUrl, requestBody) {
  const { pathname } = requestUrl;
  if (pathname === "/public/site/articles") {
    return envelope(listPage(publishedSummaries("article"), requestUrl));
  }
  if (pathname === "/public/site/cases") {
    return envelope(listPage(publishedSummaries("case"), requestUrl));
  }
  if (pathname === "/public/site/cities") {
    return envelope(listPage(publishedSummaries("city"), requestUrl));
  }
  if (pathname === "/public/site/articles/e2e-article") return envelope(articleDetail);
  if (pathname === "/public/site/cases/e2e-case") return envelope(caseDetail);
  if (pathname === "/public/site/cities/shanghai") return envelope(cityDetail);
  if (pathname === `/internal/site-content/versions/${previewVersionId}/preview`) {
    return envelope(previewDetail);
  }
  if (pathname === "/internal/site-content/preview/consume") {
    const token = JSON.parse(requestBody || "{}").token;
    if (token === validPreviewToken) {
      return envelope({
        entryId: previewEntryId,
        versionId: previewVersionId,
        path: "/articles/e2e-preview",
        expiresAt: "2099-07-12T08:00:00+08:00",
      });
    }
    return {
      success: false,
      message: "Preview token 无效",
      code: "INVALID_PREVIEW_TOKEN",
      requestId: "e2e-invalid-preview",
    };
  }
  return null;
}

createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1:3900");
    const fixture = fixtureFor(requestUrl, body);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(fixture ?? {
      success: true,
      upstream_headers: request.headers,
      upstream_path: request.url,
      body,
    }));
  });
}).listen(3900, "127.0.0.1");
