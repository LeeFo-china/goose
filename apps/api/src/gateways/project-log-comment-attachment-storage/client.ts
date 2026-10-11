import COS from "cos-nodejs-sdk-v5";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { validateCosSignedReadUrl } from "@/gateways/rendering-library-storage/signed-read-url";
import { PROJECT_COMMENT_ATTACHMENT_MAX_BYTES, ProjectCommentAttachmentMimeSchema } from "@/schema/project-log-comment-attachments";
import { attachmentStorageFailed, invalidAttachment, readVerifiedAttachment } from "./verify";

export interface CommentAttachmentLocation { bucket: string; region: string; objectKey: string; rawObjectKey: string }
export interface CommentAttachmentDeclaration extends CommentAttachmentLocation { mimeType: string; sizeBytes: number }
export interface CommentAttachmentVerified { mimeType: "image/jpeg" | "image/png" | "image/webp"; sizeBytes: number; width: number; height: number; checksum: string; etag: string; objectKey: string }
export interface CommentAttachmentStoragePort {
  allocate(input: { tenantId: string; logId: string; uploadId: string }): Promise<CommentAttachmentLocation>;
  signPut(input: CommentAttachmentDeclaration): Promise<{ uploadUrl: string; headers: Record<string, string>; expiresAt: string }>;
  finalize(input: CommentAttachmentDeclaration): Promise<CommentAttachmentVerified>;
  signRead(input: CommentAttachmentLocation): Promise<{ url: string; expiresAt: string }>;
  signReads(input: CommentAttachmentLocation[]): Promise<Array<{ url: string; expiresAt: string }>>;
  remove(input: CommentAttachmentLocation): Promise<void>;
}
interface Config { bucket: string; region: string; secretId: string; secretKey: string }
export interface AttachmentCosPort {
  getBucket(params: COS.GetBucketParams): Promise<Pick<COS.GetBucketResult, "Contents" | "IsTruncated">>;
  getAuth(params: COS.GetAuthParams): string;
  getObjectUrl(params: COS.GetObjectUrlParams): string;
  headObject(params: COS.HeadObjectParams): Promise<COS.HeadObjectResult>;
  getObject(params: COS.GetObjectParams): Promise<COS.GetObjectResult>;
  putObject(params: COS.PutObjectParams): Promise<unknown>;
  deleteObject(params: COS.DeleteObjectParams): Promise<unknown>;
}
interface Dependencies { loadConfig: () => Promise<Config>; createCos?: (options: COS.COSOptions) => AttachmentCosPort }
const TTL_SECONDS = 300;
const Bucket = z.string().max(63).regex(/^[a-z0-9][a-z0-9-]*-\d+$/);
const Region = z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/);
const ConfigSchema = z.object({ bucket: Bucket, region: Region, secretId: z.string().trim().min(1), secretKey: z.string().trim().min(1) });
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const finalKey = new RegExp(`^private/project-log-project-comments/${uuid}/${uuid}/${uuid}/final(?:/[a-f0-9]{64})?$`);
function assertLocation(input: CommentAttachmentLocation): void {
  if (!Bucket.safeParse(input.bucket).success || !Region.safeParse(input.region).success
    || !finalKey.test(input.objectKey) || input.rawObjectKey !== input.objectKey.replace(/\/final(?:\/[a-f0-9]{64})?$/, "/raw")) throw Errors.forbidden();
}
function assertDeclaration(input: CommentAttachmentDeclaration): void {
  assertLocation(input);
  if (!ProjectCommentAttachmentMimeSchema.safeParse(input.mimeType).success || !Number.isSafeInteger(input.sizeBytes)
    || input.sizeBytes <= 0 || input.sizeBytes > PROJECT_COMMENT_ATTACHMENT_MAX_BYTES) invalidAttachment();
}
function params(input: CommentAttachmentLocation, key = input.objectKey) { return { Bucket: input.bucket, Region: input.region, Key: key }; }

export class ProjectLogCommentAttachmentStorage implements CommentAttachmentStoragePort {
  constructor(private readonly dependencies: Dependencies) {}
  private async config(): Promise<Config> {
    try { return ConfigSchema.parse(await this.dependencies.loadConfig()); } catch { return attachmentStorageFailed(); }
  }
  private cos(config: Config): AttachmentCosPort {
    return (this.dependencies.createCos ?? ((options) => new COS(options)))({ SecretId: config.secretId,
      SecretKey: config.secretKey, Protocol: "https:", Timeout: 30000, FollowRedirect: false });
  }
  async allocate(input: { tenantId: string; logId: string; uploadId: string }): Promise<CommentAttachmentLocation> {
    if (![input.tenantId, input.logId, input.uploadId].every(id => z.uuid().safeParse(id).success)) throw Errors.forbidden();
    const prefix = `private/project-log-project-comments/${input.tenantId}/${input.logId}/${input.uploadId}`;
    const { bucket, region } = await this.config();
    return { bucket, region, objectKey: `${prefix}/final`, rawObjectKey: `${prefix}/raw` };
  }
  async signPut(input: CommentAttachmentDeclaration) {
    assertDeclaration(input);
    const cos = this.cos(await this.config());
    const headers = { "Content-Type": input.mimeType, "Content-Length": String(input.sizeBytes), "x-cos-acl": "private",
      "x-cos-forbid-overwrite": "true" };
    try {
      // SDK omits Content-Type from signing; actual byte decoding is authoritative on complete.
      const auth = cos.getAuth({ ...params(input, input.rawObjectKey), Method: "PUT", Expires: TTL_SECONDS, Headers: headers, ForceSignHost: true });
      const url = new URL(`https://${input.bucket}.cos.${input.region}.myqcloud.com/${input.rawObjectKey}?${auth}`);
      if (url.searchParams.get("q-header-list") !== "content-length;host;x-cos-acl;x-cos-forbid-overwrite") return attachmentStorageFailed();
      const times = url.searchParams.get("q-sign-time")?.split(";").map(Number);
      if (times?.length !== 2 || !times.every(Number.isSafeInteger) || times[1]! - times[0]! !== TTL_SECONDS) return attachmentStorageFailed();
      return { uploadUrl: url.href, headers, expiresAt: new Date(times[1]! * 1000).toISOString() };
    } catch { return attachmentStorageFailed(); }
  }
  async finalize(input: CommentAttachmentDeclaration): Promise<CommentAttachmentVerified> {
    assertDeclaration(input);
    const cos = this.cos(await this.config());
    if (input.objectKey.endsWith("/final") === false) throw Errors.forbidden();
    const { bytes, ...verified } = await readVerifiedAttachment(cos, input);
    const objectKey = `${input.objectKey}/${verified.checksum}`;
    // Only the server ever writes this key. Replayed raw PUTs cannot mutate the published bytes.
    // Content addressing preserves immutability even if bucket versioning ignores forbid-overwrite.
    try {
      await cos.putObject({ ...params(input, objectKey), Body: bytes, ContentLength: bytes.length, ContentType: verified.mimeType,
        ACL: "private", CacheControl: "private, no-store", Headers: { "x-cos-forbid-overwrite": "true", "x-cos-meta-sha256": verified.checksum } });
    } catch {
      let existing: COS.HeadObjectResult;
      try { existing = await cos.headObject(params(input, objectKey)); } catch { return attachmentStorageFailed(); }
      if (existing.statusCode !== 200 || existing.headers?.["x-cos-meta-sha256"] !== verified.checksum
        || existing.headers?.["content-length"] !== String(bytes.length)
        || existing.headers?.["content-type"] !== verified.mimeType) return attachmentStorageFailed();
    }
    return { ...verified, objectKey };
  }
  async signRead(input: CommentAttachmentLocation): Promise<{ url: string; expiresAt: string }> {
    const [result] = await this.signReads([input]);
    if (!result) return attachmentStorageFailed();
    return result;
  }
  async signReads(inputs: CommentAttachmentLocation[]): Promise<Array<{ url: string; expiresAt: string }>> {
    if (inputs.length > 900) throw Errors.badRequest("附件批量范围超限");
    if (!inputs.length) return [];
    for (const input of inputs) {
      assertLocation(input);
      if (!/\/final\/[a-f0-9]{64}$/.test(input.objectKey)) throw Errors.forbidden();
    }
    // One cached config read/client per request, all signatures computed locally; no per-file settings I/O.
    const config = await this.config();
    const cos = this.cos(config);
    try {
      return inputs.map(input => {
        const signed = cos.getObjectUrl({ ...params(input), Sign: true, Method: "GET", Expires: TTL_SECONDS, Protocol: "https:" });
        const result = validateCosSignedReadUrl(signed, { bucket: input.bucket, region: input.region, object_key: input.objectKey }, config.secretId, TTL_SECONDS);
        if (!result) return attachmentStorageFailed();
        return result;
      });
    } catch { return attachmentStorageFailed(); }
  }
  /** Only call after repository atomically fences an unreferenced orphan against completion/attach. */
  async remove(input: CommentAttachmentLocation): Promise<void> {
    assertLocation(input);
    const cos = this.cos(await this.config());
    const prefix = input.rawObjectKey.replace(/raw$/, "final/");
    try {
      // Include content-addressed variants left by failed/racing completions. Bound work per tick.
      const page = await cos.getBucket({ Bucket: input.bucket, Region: input.region, Prefix: prefix, MaxKeys: 100 });
      if (!Array.isArray(page.Contents) || page.Contents.length > 100) return attachmentStorageFailed();
      const keys = page.Contents.map(object => object.Key);
      if (keys.some(key => !key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length)))) return attachmentStorageFailed();
      for (const key of keys) await cos.deleteObject(params(input, key));
      await cos.deleteObject(params(input, input.rawObjectKey));
      // Keep the SQL cleanup row retryable; the next tick continues at the remaining objects.
      if (page.IsTruncated !== "false") return attachmentStorageFailed();
    } catch { return attachmentStorageFailed(); }
  }
}
