import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const CLIENT_IP_HEADER = "x-gooes-client-ip";
const TIMESTAMP_HEADER = "x-gooes-client-ip-timestamp";
const SIGNATURE_HEADER = "x-gooes-client-ip-signature";

export function buildSignedClientIpHeaders(
  clientIp: string | null,
  secret: string,
  now = Date.now(),
): Headers {
  const headers = new Headers();
  const normalizedIp = clientIp?.trim() ?? "";
  if (!secret || isIP(normalizedIp) === 0) return headers;

  const timestamp = Math.floor(now / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${normalizedIp}`)
    .digest("hex");
  headers.set(CLIENT_IP_HEADER, normalizedIp);
  headers.set(TIMESTAMP_HEADER, timestamp);
  headers.set(SIGNATURE_HEADER, signature);
  return headers;
}
