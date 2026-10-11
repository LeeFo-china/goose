import { beforeEach, expect, test } from "bun:test";
import COS from "cos-nodejs-sdk-v5";
import { PROJECT_LOG_STAGE_CODE_VALUES } from "@gooes/domain";
import { CreateProjectLogSchema, UpdateProjectLogSchema } from "@/schema/project-logs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let resolver: typeof import("./file-url-resolver");
const config = { secretId: "test-id", secretKey: "test-key", bucket: "comments-1250000000", region: "ap-guangzhou" };
const key = "private/project-log-project-comments/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/final/" + "a".repeat(64);
const signed = new COS({ SecretId: config.secretId, SecretKey: config.secretKey }).getObjectUrl({
  Bucket: config.bucket, Region: config.region, Key: key, Sign: true, Expires: 300, Protocol: "https:",
});
const normalUrl = "https://images.example.com/normal.jpg";
const createPayload = { project_id: "11111111-1111-4111-8111-111111111111", stage_code: PROJECT_LOG_STAGE_CODE_VALUES[0], content: "施工记录" };

beforeEach(async () => {
  resolver = await import("./file-url-resolver");
  resolver.setPlatformCosAccessConfigCache({ ...config, publicBaseUrl: "https://cdn.example.com" });
});

test("does not forward a live private comment capability through generic public output or fallback", () => {
  expect(new URL(signed).searchParams.has("q-signature")).toBe(true);
  expect(resolver.resolveStoredFileUrl(signed)).toBeNull();
  expect(resolver.resolveStoredFileUrlList([normalUrl, signed])).toEqual([normalUrl]);
  expect(resolver.resolveStoredFileUrlList(JSON.stringify([signed, normalUrl]))).toEqual([normalUrl]);
});

const reservedReferences = [
  ["raw key", key],
  ["staging key", key.replace(/final\/.+$/, "raw")],
  ["signed URL", signed],
  ["encoded path", `https://cdn.example.com/${encodeURIComponent(key)}?q-signature=secret`],
  ["double encoding", `https://cdn.example.com/${encodeURIComponent(encodeURIComponent(key))}`],
  ["encoded scene letters", signed.replace("private/project-log-project-comments", "%70rivate/project-log-project-%63omments")],
  ["protocol relative", `//cdn.example.com/${key}`],
  ["backslash alias", `https:\\cdn.example.com\\${key.replaceAll("/", "\\")}`],
  ["dot segment alias", `https://cdn.example.com/private/unrelated/../project-log-project-comments/file`],
  ["malformed host", `https://[invalid/${key}`],
  ["malformed percent escape", `https://cdn.example.com/${key}%ZZ`],
  ["malformed UTF-8 before encoded path", `https://[invalid/%FF/${encodeURIComponent(key)}`],
] as const;

test.each(reservedReferences)("blocks reserved reference: %s", (_label, reference) => {
  for (const images of [[reference], JSON.stringify([reference]), reference]) {
    expect(CreateProjectLogSchema.safeParse({ ...createPayload, images }).success).toBe(false);
    expect(UpdateProjectLogSchema.safeParse({ images }).success).toBe(false);
  }
  expect(resolver.resolveStoredFileUrl(reference)).toBeNull();
  expect(resolver.resolveStoredFileUrlList([reference, normalUrl])).toEqual([normalUrl]);
});

test("preserves unrelated normal images, private files and legacy image representations", async () => {
  const otherPrivate = "https://cdn.example.com/private/tenant-onboarding-license/file.jpg?q-signature=existing";
  const similarName = "https://cdn.example.com/private/project-log-project-comments-archive/file.jpg";
  const images = [normalUrl, otherPrivate, similarName, "tenants/tenant-1/project-log/projects/project-1/image.jpg", "legacy/image.jpg"];
  const resolved = images.map(image => resolver.resolveStoredFileUrl(image))
    .filter((url): url is string => url !== null);
  expect(resolved).toHaveLength(images.length);
  expect(resolved.slice(0, 3)).toEqual(images.slice(0, 3));
  expect(resolved[3]).toContain("q-signature=");
  expect(resolved[4]).toContain("/storage/v1/object/public/project-logs/legacy/image.jpg");
  // Signing can cross a second boundary; compare paths, not time-dependent signatures.
  const paths = (urls: string[]) => urls.map(url => new URL(url).pathname);
  expect(paths(resolver.resolveStoredFileUrlList(images))).toEqual(paths(resolved));
  expect(paths(resolver.resolveStoredFileUrlList(JSON.stringify(images)))).toEqual(paths(resolved));
  for (const value of [images, JSON.stringify(images), null, undefined]) {
    expect(CreateProjectLogSchema.safeParse({ ...createPayload, images: value }).success).toBe(true);
    expect(UpdateProjectLogSchema.safeParse({ images: value }).success).toBe(true);
  }
  expect(await resolver.resolveSignedStoredFileUrl("private/tenant-onboarding-license/file.jpg")).toContain("q-signature=");
});
