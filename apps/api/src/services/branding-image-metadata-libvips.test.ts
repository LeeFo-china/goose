import { describe, expect, test } from "bun:test";

import { parseBrandLogoImageMetadata } from "./branding-image-metadata";

// Generated independently:
// magick -size 16x12 xc:'#336699' -strip /tmp/branding-logo-static.png
// magick -size 16x12 xc:'#336699' -strip -quality 90 /tmp/branding-logo-static.jpg
// cwebp -quiet -lossless /tmp/branding-logo-static.png -o /tmp/branding-logo-static.webp
const STATIC_FIXTURES = [
  [
    "PNG",
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAMAQMAAABRKa/CAAAAA1BMVEUzZpk7I4HSAAAAC0lEQVQI12NgIAwAACQAAS4ecaAAAAAASUVORK5CYII=",
    "image/png",
  ],
  [
    "JPEG",
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAMABADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCRK2l4AAD/2Q==",
    "image/jpeg",
  ],
  [
    "WebP",
    "UklGRh4AAABXRUJQVlA4TBEAAAAvD8ACAAdQs840s/+BiOh/AAA=",
    "image/webp",
  ],
] as const;

const STRUCTURALLY_VALID_BUT_UNDECODABLE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAQAAAAFACAYAAABTKqIKAAAAC0lEQVR4AQEAAP//AAAAAYnWrl8AAAAASUVORK5CYII=";

// Generated independently:
// magick -size 128x128 xc:red -size 128x128 xc:blue -set delay 10 -loop 0 APNG:/tmp/branding-logo-animated.png
const ANIMATED_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAACAAAAAgAAAAAAAAAAAAAEACgAA4PBDiwAAAjBJREFUeJzt3NlOwzAUAFGK/P9/TFuJvJg6Tm2u4zFhzhNrhDS5TrqY2+Pzo8+99o3agaq/0GDUMfPjRP6e8RL9B/x3BoAZABYMsK2tY1fV3ovS3+YEwIYHiE9D7QiRyVjrzifnBMDaAjxu+SfFt8+4EpTy4697X9/LCYBdPcA2uuXQLuPqAZZXD/Bj3c/X3K/iR3+3CudXjvarSHkvVH4lO87C5/7GCYAZAGYAWKovvPnyWa77m8g9+L3ycftvXYETADMAzACwgwCj7tOvtmqP5QTADgJ4lzKDEwAbHWD5Zx9X4wTADAAzAMwAMAPADAAzACwNfvbGRwCdnACYAWAGgO1eAzY+rzmDEwBLe2e65/48TgBsdwLazdkZcGVOAMwAMAPAGgNcZ0/WapwAmAFgBoA1Bqit+14PopwAmAFgBoC5PwDmBMDcHwBzAmDuD4A5ATADwAwAC74eUDw+cPXv5ATADAAzACwYwMe9UU4AzAAwA8BeApSvAZR8j9BITgDsbYByGjzrR3ICYLt7xMpXgD3rz+IEwNLes5uaxwmAjf5fEerkBMC8BsCcANhLAFf/2ZwAmAFgBoC5TxjmBMCCuyQV5QTADAAzACy9ucNxx8vJnADYwfuCvnnun8wJgBkAZgBY8P+GKsoJgBkAZgCYAWAGgBkAZgCYAWAGgBkAZgCYAWAGgBkAZgCYAWAGgBkAZgCYAWAGgBkAZgCYAWAGgBkAZgCYAWAGgBkAZgDYEw1NS8f6TiWgAAAAGmZjVEwAAAABAAAAgAAAAIAAAAAAAAAAAAABAAoAAHuDqV8AAAF4ZmRBVAAAAAJ4nO3ZzQqCQBhAUZN5/0euIDeG0R/mXXTOQmgwCC7fjNJpmi7TI/Ptetqsr+8+P/wmnxj1D/h3AsQEiN0FWPZ9O/uRTEDsRYDtE5L52JcJiI159WF56ncSHMkExMb2XZcjmYCYADEBYgLEBIgN77otExATICZAbNjxWyYgJkBMgNhPAqz/Y3DGPGcCYgLEBIjtFmB+Y915sGUCYgLEBIjtFsD+/h0TEBMgJkBMgJgAMQFiAsQEiAkQEyAmQEyAmAAxAWICxASICRATICZATICYADEBYgLEBIgJEBMgJkBMgJgAMQFiAsQEiAkQEyAmQEyAmAAxAWICxASICRATICZATICYADEBYgLEBIgJEBMgJkBMgJgAMQFiAsQEiAkQEyAmQEyAmAAxAWICxASICRATICZATICYADEBYgLEBIgJEBMgJkBMgJgAMQFiAsQEiAkQEyAmQEyAmAAxAWICxASICRATICZATICYADEBYgLEro2ODvkrbcotAAAAAElFTkSuQmCC";

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

describe("parseBrandLogoImageMetadata libvips contract", () => {
  test.each(STATIC_FIXTURES)(
    "fully decodes an independently encoded %s",
    async (_name, base64, mimeType) => {
      await expect(parseBrandLogoImageMetadata(fromBase64(base64))).resolves
        .toEqual({ mimeType, width: 16, height: 12 });
    },
  );

  test("rejects a structurally complete PNG with an invalid pixel stream", async () => {
    await expect(
      Promise.resolve(parseBrandLogoImageMetadata(
        fromBase64(STRUCTURALLY_VALID_BUT_UNDECODABLE_PNG),
      )),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
  });

  test("rejects an independently encoded two-frame APNG", async () => {
    await expect(
      parseBrandLogoImageMetadata(fromBase64(ANIMATED_PNG)),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
  });

  test("rejects a PNG chunk length that exceeds the remaining input", async () => {
    const input = fromBase64(STATIC_FIXTURES[0][1]);
    input.set([0xff, 0xff, 0xff, 0xff], input.byteLength - 12);

    await expect(parseBrandLogoImageMetadata(input)).rejects.toMatchObject({
      statusCode: 400,
      code: "BRANDING_LOGO_FILE_INVALID",
    });
  });
});
