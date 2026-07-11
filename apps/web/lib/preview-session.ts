import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PREVIEW_SESSION_COOKIE_NAME = "gooes_site_preview";
export const PREVIEW_SESSION_TTL_SECONDS = 15 * 60;

const PreviewSessionPayloadSchema = z.strictObject({
  entryId: z.uuid(),
  versionId: z.uuid(),
  path: z.string().regex(/^\/(?:articles|cases|cities)\/[a-z0-9]+(?:-[a-z0-9]+)*$/).max(220),
  expiresAt: z.number().int().positive(),
});

export type PreviewSession = z.infer<typeof PreviewSessionPayloadSchema>;

interface CreatePreviewSessionInput {
  readonly entryId: string;
  readonly versionId: string;
  readonly path: string;
  readonly secret: string;
  readonly nowMs?: number;
}

export function createPreviewSession(input: CreatePreviewSessionInput): string {
  assertSessionSecret(input.secret);
  const payload = PreviewSessionPayloadSchema.parse({
    entryId: input.entryId,
    versionId: input.versionId,
    path: input.path,
    expiresAt: Math.floor((input.nowMs ?? Date.now()) / 1_000) + PREVIEW_SESSION_TTL_SECONDS,
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload, input.secret)}`;
}

export function readPreviewSession(
  value: string | undefined,
  secret: string,
  nowMs = Date.now(),
): PreviewSession | null {
  if (!value || !isSessionSecretValid(secret)) return null;
  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra || !/^[0-9a-f]{64}$/.test(signature)) return null;

  const expected = Buffer.from(signPayload(encodedPayload, secret), "hex");
  const received = Buffer.from(signature, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const parsed = PreviewSessionPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.expiresAt <= Math.floor(nowMs / 1_000)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function buildPreviewSessionCookie(value: string): string {
  return [
    `${PREVIEW_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${PREVIEW_SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function buildExpiredPreviewSessionCookie(): string {
  return [
    `${PREVIEW_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function getPreviewSessionSecret(): string {
  const secret = process.env.GOOES_PREVIEW_SESSION_SECRET?.trim() ?? "";
  assertSessionSecret(secret);
  return secret;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function isSessionSecretValid(secret: string): boolean {
  return secret.length >= 32;
}

function assertSessionSecret(secret: string): void {
  if (!isSessionSecretValid(secret)) {
    throw new Error("Preview session secret 未配置");
  }
}
