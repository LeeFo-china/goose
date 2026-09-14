import { expect, mock, test } from "bun:test";
import { ApiRequestError } from "../api/request";
import { choosePrivateImage, inspectPrivateImageBytes } from "./private-image";

test("private image inspection trusts bytes, not the filename or picker metadata", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
  expect(inspectPrivateImageBytes(jpeg)).toEqual({ bytes: jpeg, mimeType: "image/jpeg", sizeBytes: 4 });
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).buffer;
  expect(inspectPrivateImageBytes(png).mimeType).toBe("image/png");
});

test("HEIC, animation and oversize input are rejected before intent", () => {
  const heic = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]).buffer;
  expect(() => inspectPrivateImageBytes(heic)).toThrow("HEIC");
  const animatedWebp = new Uint8Array([82, 73, 70, 70, 20, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0, 2]).buffer;
  expect(() => inspectPrivateImageBytes(animatedWebp)).toThrow("静态");
  expect(() => inspectPrivateImageBytes(new ArrayBuffer(10 * 1024 * 1024 + 1))).toThrow("10 MiB");
});

test("picker rejects an oversized file before reading private bytes", async () => {
  const choose = mock((options: Parameters<typeof tt.chooseImage>[0]) => {
    options.success?.({ tempFiles: [{ path: "ttfile://temp/large", size: 10 * 1024 * 1024 + 1 }] } as never);
  });
  const read = mock((options: { fail?: () => void }) => { options.fail?.(); });
  const info = mock(() => undefined);
  await expect(choosePrivateImage(choose as typeof tt.chooseImage, read as never, info as never))
    .rejects.toThrow("10 MiB");
  expect(read).not.toHaveBeenCalled();
  expect(info).not.toHaveBeenCalled();
});

test("picker identifies an undeclared album privacy scope before any file access", async () => {
  const choose = mock((options: Parameters<typeof tt.chooseImage>[0]) => {
    options.fail?.({ errMsg: "chooseImage:fail api scope is not declared in the privacy agreement" });
  });
  const read = mock(() => undefined);
  const info = mock(() => undefined);
  await expect(choosePrivateImage(choose as typeof tt.chooseImage, read as never, info as never))
    .rejects.toMatchObject({ code: "IMAGE_PRIVACY_SCOPE_UNDECLARED" } satisfies Partial<ApiRequestError>);
  expect(read).not.toHaveBeenCalled();
  expect(info).not.toHaveBeenCalled();
});
