import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";
import { Errors } from "@/errors/error-factory";
import { PROJECT_COMMENT_ATTACHMENT_MAX_BYTES } from "@/schema/project-log-comment-attachments";

export function invalidAttachment(): never {
  throw Errors.business(422, "评论图片内容、类型或大小校验失败", "COMMENT_ATTACHMENT_INVALID");
}
export function attachmentStorageFailed(): never {
  throw Errors.business(502, "评论图片存储暂不可用", "COMMENT_ATTACHMENT_STORAGE_FAILED");
}
function strongEtag(value: unknown): string {
  if (typeof value !== "string" || !/^"?[a-zA-Z0-9-]+"?$/.test(value)
    || value.startsWith('"') !== value.endsWith('"')) return invalidAttachment();
  return `"${value.replaceAll('"', '')}"`;
}
/** Stream is capped even if an upstream ignores Range. IfMatch binds HEAD to downloaded bytes. */
export async function readVerifiedAttachment(cos: Pick<COS, "headObject" | "getObject">,
  input: { bucket: string; region: string; rawObjectKey: string; mimeType: string; sizeBytes: number }) {
  const params = { Bucket: input.bucket, Region: input.region, Key: input.rawObjectKey };
  let head: COS.HeadObjectResult;
  try { head = await cos.headObject(params); } catch { return attachmentStorageFailed(); }
  if (head.statusCode !== 200 || head.headers?.["content-length"] !== String(input.sizeBytes)) return invalidAttachment();
  const etag = strongEtag(head.ETag);
  const bytes = Buffer.alloc(input.sizeBytes);
  let received = 0;
  let overflow = false;
  const output = new Writable({ highWaterMark: 64 * 1024, write(chunk: Buffer, _encoding, callback) {
    if (!Buffer.isBuffer(chunk) || chunk.length > bytes.length - received) {
      overflow = true;
      return callback(Errors.badRequest("评论图片超过声明大小"));
    }
    chunk.copy(bytes, received); received += chunk.length; callback();
  } });
  const [stream, request] = await Promise.allSettled([finished(output), Promise.resolve()
    .then(() => cos.getObject({ ...params, IfMatch: etag, Range: `bytes=0-${PROJECT_COMMENT_ATTACHMENT_MAX_BYTES}`, Output: output }))
    .catch((error: unknown) => { output.destroy(); throw error; })]);
  if (overflow) return invalidAttachment();
  if (stream.status === "rejected" || request.status === "rejected") return attachmentStorageFailed();
  if (![200, 206].includes(request.value.statusCode ?? 0) || received !== input.sizeBytes
    || strongEtag(request.value.ETag) !== etag) return invalidAttachment();
  try {
    // Reject decompression bombs while accepting normal phone-sized photos.
    const options = { failOn: "error", limitInputPixels: 40_000_000 } as const;
    const metadata = await sharp(bytes, options).metadata();
    const mimeType = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, "image/jpeg" | "image/png" | "image/webp">)[metadata.format ?? ""];
    if (!mimeType || mimeType !== input.mimeType || !metadata.width || !metadata.height) return invalidAttachment();
    // A valid header alone is insufficient: decoding catches truncated/corrupt payloads.
    await sharp(bytes, options).resize(1, 1, { fit: "fill" }).raw().toBuffer();
    return { bytes, mimeType, sizeBytes: received, width: metadata.width, height: metadata.height,
      checksum: createHash("sha256").update(bytes).digest("hex"), etag };
  } catch { return invalidAttachment(); }
}
