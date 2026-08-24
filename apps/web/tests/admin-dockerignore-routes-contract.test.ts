import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const dockerignore = readFileSync(
  new URL(".dockerignore", repositoryRoot),
  "utf8",
);

function meaningfulDockerignoreLines(): string[] {
  return dockerignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

describe("admin Docker build context contract", () => {
  test("keeps admin app route reports directories in the Docker context", () => {
    const lines = meaningfulDockerignoreLines();
    const broadReportsIndex = lines.findIndex(
      (line) => line === "reports" || line === "**/reports",
    );
    const routeReportsIndex = lines.indexOf("!apps/admin/app/**/reports");
    const routeReportFilesIndex = lines.indexOf("!apps/admin/app/**/reports/**");

    expect(broadReportsIndex).toBeGreaterThanOrEqual(0);
    expect(routeReportsIndex).toBeGreaterThan(broadReportsIndex);
    expect(routeReportFilesIndex).toBeGreaterThan(routeReportsIndex);
  });
});
