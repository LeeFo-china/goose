import { expect, mock, test } from "bun:test";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";
import { Writable } from "node:stream";

const tenant = "11111111-1111-4111-8111-111111111111";
const log = "22222222-2222-4222-8222-222222222222";
const upload = "33333333-3333-4333-8333-333333333333";
const config = { bucket: "comments-123456", region: "ap-guangzhou", secretId: "test-id", secretKey: "test-key" };
async function fixture() {
  const module = await import("./client");
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
  const state = { bytes, declared: bytes.length, etag: '"abc"', mime: "image/png", final: null as COS.PutObjectParams | null };
  const sdk = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
  const cos = {
    getBucket: mock(async (): Promise<Pick<COS.GetBucketResult, "Contents" | "IsTruncated">> => ({ Contents: [], IsTruncated: "false" })),
    getAuth: sdk.getAuth.bind(sdk), getObjectUrl: sdk.getObjectUrl.bind(sdk),
    headObject: mock(async (): Promise<COS.HeadObjectResult> => ({ ETag: state.etag, statusCode: 200,
      headers: { "content-length": String(state.declared), "content-type": state.mime } })),
    getObject: mock(async (params: COS.GetObjectParams): Promise<COS.GetObjectResult> => {
      if (params.Output instanceof Writable) {
        await new Promise<void>((resolve, reject) => { params.Output!.once("error", reject); params.Output!.once("finish", resolve); (params.Output as Writable).end(state.bytes); });
      }
      return { ETag: state.etag, statusCode: 206, Body: state.bytes };
    }),
    putObject: mock(async (params: COS.PutObjectParams) => { state.final = params; return { ETag: '"final"', statusCode: 200 }; }),
    deleteObject: mock(async () => ({})),
  };
  const storage = new module.ProjectLogCommentAttachmentStorage({ loadConfig: async () => config, createCos: () => cos });
  const location = await storage.allocate({ tenantId: tenant, logId: log, uploadId: upload });
  return { storage, cos, state, location };
}
test("private PUT signs exact staging key and ACL; GET signs final only for 300 seconds", async () => {
  const f = await fixture();
  const signed = await f.storage.signPut({ ...f.location, mimeType: "image/png", sizeBytes: f.state.bytes.length });
  expect(signed.headers["x-cos-acl"]).toBe("private");
  expect(new URL(signed.uploadUrl).pathname).toBe(`/${f.location.rawObjectKey}`);
  expect(new URL(signed.uploadUrl).searchParams.get("q-header-list")).toContain("x-cos-acl");
  const final = { ...f.location, objectKey: `${f.location.objectKey}/${"a".repeat(64)}` };
  const read = await f.storage.signRead(final);
  const [start, end] = new URL(read.url).searchParams.get("q-sign-time")!.split(";").map(Number);
  expect(end! - start!).toBe(300);
  expect(new URL(read.url).pathname).toBe(`/${final.objectKey}`);
  await expect(f.storage.signRead({ ...f.location, objectKey: f.location.rawObjectKey })).rejects.toMatchObject({ statusCode: 403 });
});
test("freezes verified actual bytes to an unsigned private final key, never copies mutable raw", async () => {
  const f = await fixture();
  const verified = await f.storage.finalize({ ...f.location, mimeType: "image/png", sizeBytes: f.state.bytes.length });
  expect(verified).toMatchObject({ mimeType: "image/png", sizeBytes: f.state.bytes.length, width: 8, height: 6 });
  expect(f.cos.getObject).toHaveBeenCalledWith(expect.objectContaining({ IfMatch: '"abc"', Range: "bytes=0-10485760" }));
  expect(f.state.final).toMatchObject({ Key: verified.objectKey, ACL: "private", Body: f.state.bytes,
    Headers: expect.objectContaining({ "x-cos-forbid-overwrite": "true" }) });
  expect(f.state.final!.Key).not.toBe(f.location.rawObjectKey);
});
test("rejects spoofed MIME, truncation, weak ETag, oversized HEAD and actual body", async () => {
  for (const kind of ["fake", "truncated", "etag", "head", "body"] as const) {
    const f = await fixture(); const declared = f.state.bytes.length;
    if (kind === "fake") f.state.bytes = Buffer.alloc(declared, 65);
    if (kind === "truncated") f.state.bytes = f.state.bytes.subarray(0, 32);
    if (kind === "etag") f.state.etag = 'W/"abc"';
    if (kind === "head") f.state.declared = 10485761;
    if (kind === "body") f.state.bytes = Buffer.alloc(10485761);
    await expect(f.storage.finalize({ ...f.location, mimeType: "image/png", sizeBytes: declared })).rejects.toMatchObject({ code: "COMMENT_ATTACHMENT_INVALID" });
    expect(f.cos.putObject).not.toHaveBeenCalled();
  }
});

test("changed staging bytes produce different final keys even with versioning enabled", async () => {
  const f = await fixture();
  const first = await f.storage.finalize({ ...f.location, mimeType: "image/png", sizeBytes: f.state.bytes.length });
  f.state.bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "blue" } }).png().toBuffer();
  f.state.declared = f.state.bytes.length;
  const second = await f.storage.finalize({ ...f.location, mimeType: "image/png", sizeBytes: f.state.bytes.length });
  expect(second.objectKey).not.toBe(first.objectKey);
  expect(second.objectKey).toEndWith(second.checksum);
});
test("540 attachment GET signatures use one config load and no storage I/O", async () => {
  const { ProjectLogCommentAttachmentStorage } = await import("./client");
  const configLoader = mock(async () => config);
  const storage = new ProjectLogCommentAttachmentStorage({ loadConfig: configLoader });
  const location = { bucket: config.bucket, region: config.region,
    objectKey: `private/project-log-project-comments/${tenant}/${log}/${upload}/final/${"a".repeat(64)}`,
    rawObjectKey: `private/project-log-project-comments/${tenant}/${log}/${upload}/raw` };
  expect(await storage.signReads(Array.from({ length: 540 }, () => location))).toHaveLength(540);
  expect(configLoader).toHaveBeenCalledTimes(1);
  await storage.signReads([]); expect(configLoader).toHaveBeenCalledTimes(1);
  await expect(storage.signReads(Array.from({ length: 901 }, () => location))).rejects.toMatchObject({ statusCode: 400 });
});
test("cleanup bounds listing to assigned prefix, removes raw and hash variants, retries truncated pages", async () => {
  const f = await fixture();
  const key = `${f.location.objectKey}/${"a".repeat(64)}`;
  // Partial object fields are irrelevant to deletion; SDK row type is exercised by transport separately.
  const object: COS.CosObject = { Key: key, LastModified: "2026-01-01T00:00:00Z", ETag: '"a"', Size: "12", StorageClass: "STANDARD", Owner: { ID: "owner" } };
  f.cos.getBucket.mockResolvedValue({ Contents: [object], IsTruncated: "false" });
  await f.storage.remove(f.location);
  expect(f.cos.getBucket).toHaveBeenCalledWith(expect.objectContaining({ Prefix: `${f.location.objectKey}/`, MaxKeys: 100 }));
  expect(f.cos.deleteObject).toHaveBeenCalledWith(expect.objectContaining({ Key: key }));
  expect(f.cos.deleteObject).toHaveBeenCalledWith(expect.objectContaining({ Key: f.location.rawObjectKey }));
  f.cos.getBucket.mockResolvedValue({ Contents: [], IsTruncated: "true" });
  await expect(f.storage.remove(f.location)).rejects.toMatchObject({ code: "COMMENT_ATTACHMENT_STORAGE_FAILED" });
  f.cos.deleteObject.mockClear();
  f.cos.getBucket.mockResolvedValue({ Contents: [{ ...object, Key: "private/someone-else/file" }], IsTruncated: "false" });
  await expect(f.storage.remove(f.location)).rejects.toMatchObject({ code: "COMMENT_ATTACHMENT_STORAGE_FAILED" });
  expect(f.cos.deleteObject).not.toHaveBeenCalled();
});
