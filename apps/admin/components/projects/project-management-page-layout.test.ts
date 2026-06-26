import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readProjectManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/projects/page.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/projects/loading.tsx", import.meta.url),
      "utf8",
    ),
    shell: readFileSync(
      new URL("./projects-client-shell.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Project management page layout", () => {
  test("keeps list and loading states inside a fixed-height workspace", () => {
    const { page, loading, shell } = readProjectManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).not.toContain("min-h-[calc(100vh-6.5rem)]");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");

    expect(shell).toContain("flex min-h-0 flex-1 flex-col");
    expect(shell).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(shell).toContain("min-h-0 flex-1 overflow-auto");
  });
});
