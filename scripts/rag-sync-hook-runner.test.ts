import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("RAG sync hook runner", () => {
  test("provides a repository-local guarded runner for git hooks", () => {
    const runnerUrl = new URL("./rag-sync-hook-runner.mjs", import.meta.url);

    expect(existsSync(runnerUrl)).toBe(true);

    const source = readFileSync(runnerUrl, "utf8");
    expect(source).toContain("rag-sync.lock");
    expect(source).toContain("GOOES_RAG_SYNC_TIMEOUT_MS");
    expect(source).toContain("GOOES_RAG_SYNC_KILL_GRACE_MS");
    expect(source).toContain("manual recovery");
    expect(source).toContain("sync timeout after");
    expect(source).toContain("spawn(");
    expect(source).toContain("killChildTree");
    expect(source).toContain("exit=timeout");
    expect(source).toContain("uncaughtException");
    expect(source).toContain("unhandledRejection");
    expect(source).toContain("SIGHUP");
    expect(source).toContain("exit=signal:");
  });

  test("git hooks schedule the guarded runner through nohup", () => {
    const postMerge = readSource(".githooks/post-merge");
    const postCommit = readSource(".githooks/post-commit");

    expect(postMerge).toContain("nohup");
    expect(postMerge).toContain("scripts/rag-sync-hook-runner.mjs --event post-merge --force");
    expect(postMerge).not.toContain("node scripts/post-commit-rag-sync.mjs --force");

    expect(postCommit).toContain("nohup");
    expect(postCommit).toContain("scripts/rag-sync-hook-runner.mjs --event post-commit");
    expect(postCommit).not.toContain("node scripts/post-commit-rag-sync.mjs");
  });
});
