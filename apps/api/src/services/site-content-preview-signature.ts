import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SITE_CONTENT_PREVIEW_SIGNATURE_TOLERANCE_SECONDS = 300;

type PreviewSignatureContent = {
  timestamp: string;
  method: string;
  path: string;
  body: string;
};

export function buildSiteContentPreviewCanonical(input: PreviewSignatureContent) {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return [input.timestamp, input.method.toUpperCase(), input.path, bodyHash].join("\n");
}

export function signSiteContentPreviewRequest(
  input: PreviewSignatureContent & { secret: string },
) {
  return createHmac("sha256", input.secret)
    .update(buildSiteContentPreviewCanonical(input))
    .digest("hex");
}

export function verifySiteContentPreviewRequest(input: PreviewSignatureContent & {
  secret: string;
  signature: string;
  nowSeconds: number;
}) {
  if (!/^\d{10}$/.test(input.timestamp) || !/^[0-9a-f]{64}$/.test(input.signature)) {
    return false;
  }
  const timestampSeconds = Number(input.timestamp);
  if (Math.abs(input.nowSeconds - timestampSeconds) > SITE_CONTENT_PREVIEW_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = Buffer.from(signSiteContentPreviewRequest(input), "hex");
  const received = Buffer.from(input.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
