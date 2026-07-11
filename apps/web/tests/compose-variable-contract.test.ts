import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);

function requiredVariables(path: string): string[] {
  const source = readFileSync(new URL(path, repositoryRoot), "utf8");
  return [...source.matchAll(/\$\{([A-Z0-9_]+):\?/g)].map((match) => match[1] ?? "");
}

describe("Web-only compose variable contract", () => {
  test("does not require unrelated API, Admin, or worker images", () => {
    expect(requiredVariables("deploy/docker-compose.web-dev.yml").sort()).toEqual([
      "GOOES_PREVIEW_SESSION_SECRET",
      "GOOES_PREVIEW_SHARED_SECRET",
      "GOOES_WEB_IMAGE",
      "GOOES_WEB_PROXY_SHARED_SECRET",
      "GOOES_WEB_REVALIDATE_SHARED_SECRET",
    ]);
  });

  test("requires an explicit immutable production Web image", () => {
    expect(requiredVariables("deploy/docker-compose.web.yml")).toContain("GOOES_WEB_IMAGE");
  });
});
