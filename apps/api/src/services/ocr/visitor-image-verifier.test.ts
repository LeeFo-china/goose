import { beforeAll, describe, expect, mock, test } from "bun:test";
import sharp from "sharp";

import type {
  VisitorOcrPlatformFileObjectRecord,
} from "@/repositories/visitor-onboarding-file-objects";

import { verifyVisitorOcrImage } from "./visitor-image-verifier";

type Fetcher = NonNullable<
  Parameters<typeof verifyVisitorOcrImage>[0]["fetcher"]
>;

const SIGNED_URL = "https://signed.example.test/license";
const ETAG = "license-etag";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

let validPng: Buffer;
let validJpeg: Buffer;

beforeAll(async () => {
  validPng = await createImage("png");
  validJpeg = await createImage("jpeg");
});

function createImage(format: "png" | "jpeg") {
  return sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  }).toFormat(format).toBuffer();
}

function file(
  bytes: Buffer,
  mimeType: "image/png" | "image/jpeg" = "image/png",
): VisitorOcrPlatformFileObjectRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: null,
    owner_type: "visitor",
    owner_visitor_id: "visitor-1",
    scene: "tenant_onboarding_license",
    provider: "tencent_cos",
    bucket: "private",
    region: "ap-guangzhou",
    object_key: "visitor/license.png",
    mime_type: mimeType,
    size_bytes: bytes.length,
    checksum: ETAG,
    visibility: "private",
    public_url: null,
    status: "active",
    deleted_at: null,
  };
}

function response(
  body: Uint8Array | string,
  contentType = "image/png",
  etag = ETAG,
  status = 206,
) {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      etag: `"${etag}"`,
    },
  });
}

function verify(input: {
  bytes?: Buffer;
  file?: VisitorOcrPlatformFileObjectRecord;
  fetcher?: Fetcher;
}) {
  const bytes = input.bytes ?? validPng;
  const targetFile = input.file ?? file(bytes);
  const signedUrlResolver = mock(async () => SIGNED_URL);
  const fetcher = input.fetcher ?? mock(async () => response(bytes));
  return {
    fetcher,
    signedUrlResolver,
    result: verifyVisitorOcrImage({
      file: targetFile,
      maxSizeBytes: MAX_SIZE_BYTES,
      signedUrlResolver,
      fetcher,
    }),
  };
}

describe("verifyVisitorOcrImage", () => {
  test("accepts a decoded PNG and sends bounded conditional request headers", async () => {
    const invocation = verify({});

    await expect(invocation.result).resolves.toMatchObject({
      signedUrl: SIGNED_URL,
      mimeType: "image/png",
      sizeBytes: validPng.length,
      width: 32,
      height: 24,
    });
    expect(invocation.fetcher).toHaveBeenCalledWith(
      SIGNED_URL,
      expect.objectContaining({
        headers: {
          "if-match": `"${ETAG}"`,
          range: `bytes=0-${MAX_SIZE_BYTES}`,
        },
        redirect: "error",
      }),
    );
  });

  test("accepts a decoded JPEG", async () => {
    const targetFile = file(validJpeg, "image/jpeg");
    const invocation = verify({
      bytes: validJpeg,
      file: targetFile,
      fetcher: mock(async () =>
        response(validJpeg, "image/jpeg")
      ) as Fetcher,
    });

    await expect(invocation.result).resolves.toMatchObject({
      mimeType: "image/jpeg",
      sizeBytes: validJpeg.length,
    });
  });

  test("rejects a body that is not a real image", async () => {
    const bytes = Buffer.from("not-image");
    const invocation = verify({ bytes, file: file(bytes) });

    await expect(invocation.result).rejects.toMatchObject({
      code: "OCR_FILE_FORMAT_UNSUPPORTED",
      details: undefined,
    });
  });

  test("rejects response content type mismatch", async () => {
    const invocation = verify({
      fetcher: mock(async () =>
        response(validPng, "image/jpeg")
      ) as Fetcher,
    });

    await expect(invocation.result).rejects.toMatchObject({
      code: "OCR_FILE_FORMAT_UNSUPPORTED",
      details: undefined,
    });
  });

  test("rejects an oversized streamed body", async () => {
    const oversized = Buffer.alloc(MAX_SIZE_BYTES + 1);
    const invocation = verify({
      file: { ...file(validPng), size_bytes: MAX_SIZE_BYTES },
      fetcher: mock(async () =>
        response(oversized)
      ) as Fetcher,
    });

    await expect(invocation.result).rejects.toMatchObject({
      code: "OCR_FILE_TOO_LARGE",
      details: undefined,
    });
  });

  test("rejects response ETag mismatch", async () => {
    const invocation = verify({
      fetcher: mock(async () =>
        response(validPng, "image/png", "changed-etag")
      ) as Fetcher,
    });

    await expect(invocation.result).rejects.toMatchObject({
      code: "OCR_FILE_ACCESS_DENIED",
      details: undefined,
    });
  });

  test("sanitizes signed URL and fetch failures", async () => {
    const invocation = verify({
      fetcher: mock(async () => {
        throw new TypeError(`failed to fetch ${SIGNED_URL}?secret=value`);
      }) as Fetcher,
    });

    let caught: unknown;
    try {
      await invocation.result;
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "OCR_FILE_ACCESS_DENIED",
      details: undefined,
    });
    expect(String((caught as Error).message)).not.toContain(SIGNED_URL);
    expect(String((caught as Error).message)).not.toContain("secret");
  });
});
