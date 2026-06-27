import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readPictureLibraryPage() {
  return readFileSync(
    new URL("../../app/(console)/platform/picture-library/page.tsx", import.meta.url),
    "utf8",
  );
}

describe("Picture library page tabs", () => {
  test("uses the local shadcn tabs composition for every tab", () => {
    const page = readPictureLibraryPage();

    expect(page).toContain('from "@/components/ui/tabs"');
    expect(page).toContain("const PICTURE_LIBRARY_TABS");
    expect(page).toContain("PICTURE_LIBRARY_TABS.map");
    expect(page).toContain("<TabsList>");
    expect(page).toContain("<TabsTrigger");
    expect(page).toContain("<TabsContent");
    expect(page).not.toContain("<TabsList className=");
    expect(page).not.toContain("aria-pressed");
    expect(page).not.toContain("<button");
  });
});
