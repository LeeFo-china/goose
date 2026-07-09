import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  buildPictureAssetCreatePayload,
  resolvePictureAssetCreateTitle,
} from "./picture-asset-dialog-utils";

function readPictureAssetDialog() {
  return readFileSync(
    new URL("./picture-asset-dialog.tsx", import.meta.url),
    "utf8",
  );
}

describe("Picture asset dialog multi upload", () => {
  test("derives per-file titles when creating multiple assets", () => {
    expect(resolvePictureAssetCreateTitle({
      formTitle: "",
      fileName: "modern-kitchen.webp",
      index: 0,
      total: 2,
    })).toBe("modern-kitchen");

    expect(resolvePictureAssetCreateTitle({
      formTitle: "案例图",
      fileName: "ignored.png",
      index: 1,
      total: 3,
    })).toBe("案例图 2");
  });

  test("builds one create payload per uploaded file object", () => {
    const payload = buildPictureAssetCreatePayload({
      basePayload: {
        title: "",
        description: "北欧风客厅",
        sort_order: 100,
        status: "published",
        category_ids: ["category-1"],
      },
      fileName: "living-room.jpg",
      fileObjectId: "file-object-id",
      index: 0,
      total: 1,
    });

    expect(payload).toEqual({
      title: "living-room",
      description: "北欧风客厅",
      sort_order: 100,
      status: "published",
      category_ids: ["category-1"],
      file_object_id: "file-object-id",
    });
  });

  test("allows selecting multiple files and creates assets one by one", () => {
    const source = readPictureAssetDialog();

    expect(source).toContain("useState<File[]>([])");
    expect(source).toContain("Array.from(event.target.files ?? [])");
    expect(source).toContain("multiple");
    expect(source).toContain("for (const [index, selectedFile] of filesToUpload.entries())");
    expect(source).toContain("buildPictureAssetCreatePayload");
  });
});
