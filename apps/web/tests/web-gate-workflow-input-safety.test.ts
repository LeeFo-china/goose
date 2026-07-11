import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const workflowPath = new URL(".github/workflows/verify-web-deployment-gate.yml", repositoryRoot);
const validator = new URL("scripts/validate-web-gate-inputs.mjs", repositoryRoot).pathname;

describe("web gate workflow input safety", () => {
  test("never interpolates workflow inputs directly into a run block", () => {
    const lines = readFileSync(workflowPath, "utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^(\s*)run:\s*\|/.exec(lines[index] ?? "");
      if (!match) continue;
      const indent = match[1]?.length ?? 0;
      const runLines = [];
      while (
        index + 1 < lines.length &&
        (/^\s*$/.test(lines[index + 1] ?? "") ||
          (lines[index + 1]?.match(/^\s*/)?.[0].length ?? 0) > indent)
      ) {
        runLines.push(lines[index + 1] ?? "");
        index += 1;
      }
      expect(runLines.join("\n")).not.toMatch(/\$\{\{\s*(?:github\.event\.)?inputs\./);
    }
  });

  test("rejects shell payloads and malformed immutable inputs", () => {
    for (const args of [
      ["development; touch /tmp/pwn", "a".repeat(40), "20260711120000"],
      ["development", "$(touch /tmp/pwn)", "20260711120000"],
      ["production", "a".repeat(40), "20260711120000;echo pwn"],
    ]) {
      expect(Bun.spawnSync(["node", validator, ...args]).exitCode).toBe(1);
    }
  });
});
