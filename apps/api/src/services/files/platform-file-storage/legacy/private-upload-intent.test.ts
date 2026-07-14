import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

type IntentModule = {
  createPrivateUploadIntent(input: {
    secretKey: string;
    objectKey: string;
    visitorId: string;
    mimeType: string;
    sizeBytes: number;
    expiresAtSeconds: number;
  }): string;
  verifyPrivateUploadIntent(input: {
    token: string;
    secretKey: string;
    objectKey: string;
    visitorId: string;
    mimeType: string;
    sizeBytes: number;
    nowSeconds: number;
  }): unknown;
};

async function loadIntentModule(): Promise<IntentModule | null> {
  const modulePath = `./${"private-upload-intent"}`;
  return await import(modulePath).catch(() => null) as IntentModule | null;
}

const intentInput = {
  secretKey: "cos-secret-key",
  objectKey: "private/tenant-onboarding-license/visitors/hash/license.jpg",
  visitorId: "visitor-sensitive-id",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  expiresAtSeconds: 1_700_000_600,
};

describe("private upload intent", () => {
  test("binds exact upload fields without serializing the raw visitor ID", async () => {
    const intent = await loadIntentModule();
    expect(intent).not.toBeNull();
    if (!intent) return;

    const token = intent.createPrivateUploadIntent(intentInput);
    const payload = Buffer.from(token.split(".")[1] ?? "", "base64url").toString();
    const verified = intent.verifyPrivateUploadIntent({
      token,
      ...intentInput,
      nowSeconds: 1_700_000_000,
    });

    expect(token).toStartWith("v1.");
    expect(payload).not.toContain(intentInput.visitorId);
    expect(payload).toContain(
      createHash("sha256").update(intentInput.visitorId).digest("hex"),
    );
    expect(verified).toEqual({
      objectKey: intentInput.objectKey,
      visitorHash: createHash("sha256").update(intentInput.visitorId).digest("hex"),
      mimeType: intentInput.mimeType,
      sizeBytes: intentInput.sizeBytes,
      expiresAtSeconds: intentInput.expiresAtSeconds,
    });
  });

  test("rejects tampered and expired intents", async () => {
    const intent = await loadIntentModule();
    expect(intent).not.toBeNull();
    if (!intent) return;
    const token = intent.createPrivateUploadIntent(intentInput);
    const [version, payload, signature = ""] = token.split(".");
    const tampered = `${version}.${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;

    expect(intent.verifyPrivateUploadIntent({
      token: tampered,
      ...intentInput,
      nowSeconds: 1_700_000_000,
    })).toBeNull();
    expect(intent.verifyPrivateUploadIntent({
      token,
      ...intentInput,
      nowSeconds: intentInput.expiresAtSeconds,
    })).toBeNull();
  });

  test("rejects a wrong visitor or any mismatched declared field", async () => {
    const intent = await loadIntentModule();
    expect(intent).not.toBeNull();
    if (!intent) return;
    const token = intent.createPrivateUploadIntent(intentInput);
    const verify = (overrides: Record<string, unknown>) =>
      intent.verifyPrivateUploadIntent({
        token,
        ...intentInput,
        nowSeconds: 1_700_000_000,
        ...overrides,
      });

    expect(verify({ visitorId: "visitor-other" })).toBeNull();
    expect(verify({ objectKey: `${intentInput.objectKey}.other` })).toBeNull();
    expect(verify({ mimeType: "image/png" })).toBeNull();
    expect(verify({ sizeBytes: intentInput.sizeBytes + 1 })).toBeNull();
  });
});
