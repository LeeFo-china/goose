import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { readBoundedBody } from "./bounded-body";

export const MAX_REVALIDATION_BODY_BYTES = 32 * 1024;
// Replays inside this window can only repeat idempotent cache invalidation.
export const REVALIDATION_SIGNATURE_TOLERANCE_SECONDS = 300;

export function buildRevalidationCanonical(input: {
  timestamp: string;
  method: string;
  path: string;
  body: string | Uint8Array;
}): string {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return [input.timestamp, input.method.toUpperCase(), input.path, bodyHash].join("\n");
}

const RevalidationPathSchema = z.string()
  .max(220)
  .regex(/^\/(?:articles|cases|cities)\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
const RevalidationTagSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^site-content(?:-path)?:[a-z0-9]+(?:[-_:][a-z0-9]+)*$/);
const RevalidationPayloadSchema = z.strictObject({
  entryId: z.uuid(),
  paths: z.array(RevalidationPathSchema).min(1).max(10),
  tags: z.array(RevalidationTagSchema).min(1).max(11),
}).superRefine(({ paths, tags }, context) => {
  const collections = new Set(paths.map((path) => path.split("/")[1]));
  if (collections.size !== 1) {
    context.addIssue({ code: "custom", path: ["paths"], message: "缓存失效路径必须属于同一内容类型" });
    return;
  }
  const collection = collections.values().next().value;
  const contentType = collection === "articles" ? "article" : collection === "cases" ? "case" : "city";
  const expectedTags = new Set([
    `site-content:${contentType}`,
    ...paths.map((path) => `site-content-path:${contentType}:${path.split("/")[2]}`),
  ]);
  const actualTags = new Set(tags);
  if (actualTags.size !== expectedTags.size || [...actualTags].some((tag) => !expectedTags.has(tag))) {
    context.addIssue({ code: "custom", path: ["tags"], message: "缓存失效标签与内容不匹配" });
  }
});

interface RevalidateHandlerDependencies {
  readonly secret?: string;
  readonly nowMs?: number;
  readonly revalidatePath: (path: string) => unknown;
  readonly revalidateTag: (tag: string) => unknown;
}

export function createRevalidateHandler(dependencies: RevalidateHandlerDependencies) {
  return async function handleRevalidation(request: Request): Promise<Response> {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REVALIDATION_BODY_BYTES) {
      await request.body?.cancel().catch(() => undefined);
      return jsonError(413, "PAYLOAD_TOO_LARGE", "请求内容不能超过 32KB");
    }

    let bodyResult;
    try {
      bodyResult = await readBoundedBody(
        request.body,
        MAX_REVALIDATION_BODY_BYTES,
        request.signal,
      );
    } catch {
      return jsonError(400, "INVALID_REQUEST_BODY", "请求内容读取失败");
    }
    if (bodyResult.status === "too_large") {
      return jsonError(413, "PAYLOAD_TOO_LARGE", "请求内容不能超过 32KB");
    }

    const secret = dependencies.secret
      ?? process.env.GOOES_WEB_REVALIDATE_SHARED_SECRET?.trim()
      ?? "";
    const signature = request.headers.get("x-gooes-revalidation-signature");
    const timestamp = request.headers.get("x-gooes-revalidation-timestamp");
    if (!isValidSignature({
      body: bodyResult.bytes,
      signature,
      timestamp,
      secret,
      method: request.method,
      path: new URL(request.url).pathname,
      nowSeconds: Math.floor((dependencies.nowMs ?? Date.now()) / 1_000),
    })) {
      return jsonError(401, "INVALID_REVALIDATION_SIGNATURE", "缓存失效签名无效");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyResult.bytes));
    } catch {
      return jsonError(400, "INVALID_REVALIDATION_BODY", "缓存失效请求格式无效");
    }
    const parsed = RevalidationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "INVALID_REVALIDATION_BODY", "缓存失效请求格式无效");
    }

    for (const tag of new Set(parsed.data.tags)) dependencies.revalidateTag(tag);
    for (const path of new Set(parsed.data.paths)) dependencies.revalidatePath(path);

    return Response.json(
      { data: { revalidated: true, entryId: parsed.data.entryId }, message: "success" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  };
}

function isValidSignature(input: {
  body: Uint8Array;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  method: string;
  path: string;
  nowSeconds: number;
}): boolean {
  if (
    input.secret.length < 32
    || !input.signature
    || !/^[0-9a-f]{64}$/.test(input.signature)
    || !input.timestamp
    || !/^\d{10}$/.test(input.timestamp)
    || Math.abs(input.nowSeconds - Number(input.timestamp)) > REVALIDATION_SIGNATURE_TOLERANCE_SECONDS
  ) return false;
  const canonical = buildRevalidationCanonical({
    timestamp: input.timestamp,
    method: input.method,
    path: input.path,
    body: input.body,
  });
  const expected = createHmac("sha256", input.secret).update(canonical).digest();
  const received = Buffer.from(input.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    { success: false, code, message },
    { status, headers: { "cache-control": "no-store" } },
  );
}
