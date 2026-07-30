import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(
  new URL("./h5-page-editor.tsx", import.meta.url),
  "utf8",
);

describe("H5 page editor layout", () => {
  test("owns vertical scrolling inside the fixed admin shell", () => {
    expect(editorSource).toContain(
      'className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6"',
    );
  });
});
