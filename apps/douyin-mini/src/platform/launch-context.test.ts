import { describe, expect, test } from "bun:test";
import { DOUYIN_ENTRY_PATH_VALUES as CANONICAL_ENTRY_PATHS } from
  "../../../../packages/domain/src/douyin-miniapp";

import * as models from "../models";
import { captureLaunchContext } from "./launch-context";

describe("launch context entry-path compatibility", () => {
  test("keeps the complete mini runtime enum exactly equal to the canonical domain source", async () => {
    const domain = await import(
      "../../../../packages/domain/src/douyin-miniapp"
    );
    expect(Reflect.get(models, "DOUYIN_ENTRY_PATH_VALUES"))
      .toEqual(domain.DOUYIN_ENTRY_PATH_VALUES);
    const productionSources = await Promise.all([
      Bun.file(`${__dirname}/launch-context.ts`).text(),
      Bun.file(`${__dirname}/analytics.ts`).text(),
    ]);
    expect(productionSources.join("\n")).not.toContain("packages/domain");
    expect(productionSources.join("\n")).not.toContain("@gooes/domain");
  });

  test("captures every canonical entry path without normalization loss", () => {
    for (const entryPath of CANONICAL_ENTRY_PATHS) {
      expect(captureLaunchContext({
        path: `/${entryPath}`,
        scene: "021001",
        query: {},
      }).entry_path).toBe(entryPath);
    }
  });

  test("preserves the budget cold-start page accepted by the API", () => {
    expect(captureLaunchContext({
      path: "/pages/budget/index",
      scene: "021001",
      query: {},
    }).entry_path).toBe("pages/budget/index");
  });

  test("falls back unknown paths to the canonical home page", () => {
    expect(captureLaunchContext({
      path: "/pages/admin/index",
      scene: "021001",
      query: {},
    }).entry_path).toBe("pages/home/index");
  });
});
