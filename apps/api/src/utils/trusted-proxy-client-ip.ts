import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const MAX_CLOCK_SKEW_SECONDS = 60;

type HeaderValue = string | string[] | undefined;

interface RequestLike {
  readonly headers: Record<string, HeaderValue>;
  readonly ip?: string;
}

function firstHeader(headers: Record<string, HeaderValue>, name: string): string {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function verifySignedClientIp(
  headers: Record<string, HeaderValue>,
  secret: string | undefined,
  now = Date.now(),
): string | null {
  if (!secret) return null;
  const ip = firstHeader(headers, "x-gooes-client-ip");
  const timestamp = firstHeader(headers, "x-gooes-client-ip-timestamp");
  const signature = firstHeader(headers, "x-gooes-client-ip-signature");
  if (isIP(ip) === 0 || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) {
    return null;
  }

  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (age > MAX_CLOCK_SKEW_SECONDS) return null;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${ip}`)
    .digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected)
    ? ip
    : null;
}

export function resolveTrustedClientIp(
  request: RequestLike,
  secret = process.env.GOOES_WEB_PROXY_SHARED_SECRET,
  now = Date.now(),
): string | null {
  return verifySignedClientIp(request.headers, secret, now) ?? request.ip ?? null;
}
