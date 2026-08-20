import { describe, expect, test } from "bun:test";

import {
  TenantDouyinProjectImagesQuerySchema,
  TenantDouyinProjectListQuerySchema,
  TenantDouyinProjectParamsSchema,
  TenantDouyinProjectPublicationSchema,
  parseTenantProjectLogImageReference,
} from "./tenant-douyin-projects";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ID = "33333333-3333-4333-8333-333333333333";
const objectKey =
  `tenants/${TENANT_ID}/project-log/projects/${PROJECT_ID}/2026/08/21/${IMAGE_ID}.webp`;
const validBody = {
  public_title: "现代简约实景",
  public_description: "这是一段用于公开展示的项目说明，介绍空间规划和施工亮点。",
  public_image_urls: [
    objectKey,
    "https://cdn.example.test/project-2.jpg",
    "https://cdn.example.test/project-3.jpg",
  ],
  style_tags: ["现代", "简约"],
  budget_band: "20-30 万",
  publication_status: "published" as const,
};

describe("tenant Douyin project schemas", () => {
  test("applies bounded list defaults and rejects client-controlled fields", () => {
    expect(TenantDouyinProjectListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(TenantDouyinProjectListQuerySchema.parse({
      page: "2",
      pageSize: "100",
      publicationStatus: "published",
    })).toEqual({ page: 2, pageSize: 100, publicationStatus: "published" });
    expect(TenantDouyinProjectListQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
    expect(TenantDouyinProjectListQuerySchema.safeParse({ tenant_id: TENANT_ID }).success)
      .toBe(false);
    expect(TenantDouyinProjectImagesQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(TenantDouyinProjectImagesQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
  });

  test("accepts stable project image references and parses their ownership", () => {
    expect(TenantDouyinProjectPublicationSchema.parse(validBody)).toEqual(validBody);
    expect(parseTenantProjectLogImageReference(objectKey)).toEqual({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    });
    expect(parseTenantProjectLogImageReference(validBody.public_image_urls[1]!))
      .toBeNull();
  });

  test("allows zero images for drafts but requires three unique images for publication", () => {
    expect(TenantDouyinProjectPublicationSchema.safeParse({
      ...validBody,
      publication_status: "draft",
      public_image_urls: [],
    }).success).toBe(true);
    expect(TenantDouyinProjectPublicationSchema.safeParse({
      ...validBody,
      public_image_urls: validBody.public_image_urls.slice(0, 2),
    }).success).toBe(false);
    expect(TenantDouyinProjectPublicationSchema.safeParse({
      ...validBody,
      public_image_urls: [objectKey, objectKey, objectKey],
    }).success).toBe(false);
  });

  test("rejects unsafe, legacy and wrong-shaped publication inputs", () => {
    for (const reference of [
      "http://cdn.example.test/project.jpg",
      "project-log/legacy.jpg",
      `public/project-log/projects/${PROJECT_ID}/${IMAGE_ID}.jpg`,
      `tenants/${TENANT_ID}/project-log/projects/${PROJECT_ID}/2026/13/21/${IMAGE_ID}.jpg`,
    ]) {
      expect(TenantDouyinProjectPublicationSchema.safeParse({
        ...validBody,
        publication_status: "draft",
        public_image_urls: [reference],
      }).success).toBe(false);
    }
    expect(TenantDouyinProjectPublicationSchema.safeParse({
      ...validBody,
      tenant_id: TENANT_ID,
    }).success).toBe(false);
    expect(TenantDouyinProjectPublicationSchema.safeParse({
      ...validBody,
      projectId: PROJECT_ID,
    }).success).toBe(false);
    expect(TenantDouyinProjectParamsSchema.safeParse({ projectId: "bad" }).success)
      .toBe(false);
  });
});
