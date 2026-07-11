import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const workflowPath = new URL(".github/workflows/verify-web-deployment-gate.yml", repositoryRoot);
const validator = new URL("scripts/validate-web-gate-inputs.mjs", repositoryRoot).pathname;

function namedStep(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

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

  test("exposes the proxy secret only to steps that run compose or the signed probe", () => {
    const gate = readFileSync(workflowPath, "utf8");
    const production = readFileSync(
      new URL(".github/workflows/deploy-docker-services.yml", repositoryRoot),
      "utf8",
    );
    const development = readFileSync(
      new URL(".github/workflows/deploy-dev.yml", repositoryRoot),
      "utf8",
    );

    expect(gate.slice(gate.indexOf("  verify:"), gate.indexOf("    steps:"))).not.toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET",
    );
    expect(production.slice(production.indexOf("  deploy:"), production.indexOf("    steps:"))).not.toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET",
    );
    expect(namedStep(gate, "Verify API revision and health")).toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET: ${{ secrets.GOOES_WEB_PROXY_SHARED_SECRET }}",
    );
    expect(namedStep(gate, "Run isolated atomic reservation smoke")).not.toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET",
    );
    expect(namedStep(production, "Pull latest images")).toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET: ${{ secrets.GOOES_WEB_PROXY_SHARED_SECRET }}",
    );
    expect(namedStep(production, "Recreate services")).toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET: ${{ secrets.GOOES_WEB_PROXY_SHARED_SECRET }}",
    );
    expect(namedStep(production, "Roll back production web")).toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET: ${{ secrets.GOOES_WEB_PROXY_SHARED_SECRET }}",
    );
    expect(namedStep(development, "Deploy dev services")).toContain(
      "GOOES_WEB_PROXY_SHARED_SECRET: ${{ secrets.GOOES_WEB_PROXY_SHARED_SECRET }}",
    );
  });
});
