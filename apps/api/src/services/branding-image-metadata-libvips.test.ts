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
});
