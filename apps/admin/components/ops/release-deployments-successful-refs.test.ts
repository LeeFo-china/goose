import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("release successful refs copy", () => {
  test("labels embedded successful refs as deployed sources including automatic dev deploys", () => {
    const sectionsSource = readFileSync(join(import.meta.dir, "release-deployments-sections.tsx"), "utf8");

    expect(sectionsSource).toContain("选择已部署来源");
    expect(sectionsSource).toContain("自动开发部署");
    expect(sectionsSource).not.toContain("选择发布来源");
  });
});
