import { describe, expect, test } from "bun:test";

import {
  MATERIAL_NOTE_EXPLAIN_CONFIRMATION,
  MATERIAL_NOTE_EXPLAIN_ENV,
  MaterialNoteExplainError,
} from "./douyin-material-note-explain-config";
import {
  MATERIAL_NOTE_EXPLAIN_QUERY_NAMES,
  MATERIAL_NOTE_EXPLAIN_THRESHOLDS,
} from "./douyin-material-note-explain-evidence";
import {
  runMaterialNoteExplainCli,
  type MaterialNoteExplainCliDependencies,
  type MaterialNoteExplainSummary,
} from "./douyin-material-note-explain";

const DATABASE_URL =
  "postgresql://dev-reader:secret@db.example.test:5432/gooes";

function summary(): MaterialNoteExplainSummary {
  const query = {
    cardinality: 7,
    cardinalityClass: "small" as const,
    nodeTypes: ["Seq Scan"],
    indexNames: [] as string[],
    planningMs: 1,
    executionMs: 2,
    actualRows: 1,
    actualLoops: 1,
    sharedHitBlocks: 1,
    sharedReadBlocks: 0,
    tempReadBlocks: 0,
    tempWrittenBlocks: 0,
  };
  return {
    gate: "douyin_material_note_queries",
    fixtureTag: "Task10-A-20260902",
    queryCount: 3,
    thresholds: MATERIAL_NOTE_EXPLAIN_THRESHOLDS,
    queries: Object.fromEntries(
      MATERIAL_NOTE_EXPLAIN_QUERY_NAMES.map((name) => [name, { ...query }]),
    ) as MaterialNoteExplainSummary["queries"],
  };
}

function harness(
  overrides: Partial<MaterialNoteExplainCliDependencies> = {},
): {
  readonly dependencies: MaterialNoteExplainCliDependencies;
  readonly stdout: string[];
  readonly stderr: string[];
  readonly exitCodes: number[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const dependencies: MaterialNoteExplainCliDependencies = {
    env: {
      [MATERIAL_NOTE_EXPLAIN_ENV.confirmation]:
        MATERIAL_NOTE_EXPLAIN_CONFIRMATION,
      [MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl]: DATABASE_URL,
    },
    async runGate() {
      return summary();
    },
    writeStdout(line) {
      stdout.push(line);
    },
    writeStderr(line) {
      stderr.push(line);
    },
    setExitCode(code) {
      exitCodes.push(code);
    },
    ...overrides,
  };
  return { dependencies, stdout, stderr, exitCodes };
}

describe("douyin material note EXPLAIN CLI", () => {
  test("prints exactly one sanitized JSON summary on success", async () => {
    const state = harness();
    await runMaterialNoteExplainCli(state.dependencies);

    expect(state.stderr).toEqual([]);
    expect(state.exitCodes).toEqual([]);
    expect(state.stdout).toHaveLength(1);
    expect(JSON.parse(state.stdout[0]!)).toEqual(summary());
    expect(state.stdout[0]).not.toContain(DATABASE_URL);
    expect(state.stdout[0]).not.toContain("secret");
  });

  test("prints only a stable config error without echoing secrets", async () => {
    const state = harness({
      env: {
        [MATERIAL_NOTE_EXPLAIN_ENV.databaseUrl]: DATABASE_URL,
      },
    });
    await runMaterialNoteExplainCli(state.dependencies);

    expect(state.stdout).toEqual([]);
    expect(state.stderr).toEqual([
      "DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:CONFIRMATION_REQUIRED",
    ]);
    expect(state.exitCodes).toEqual([1]);
    expect(state.stderr.join(" ")).not.toContain(DATABASE_URL);
    expect(state.stderr.join(" ")).not.toContain("secret");
  });

  test("preserves stable gate errors and normalizes unknown failures", async () => {
    for (const [failure, expected] of [
      [
        new MaterialNoteExplainError(
          "REPRESENTATIVE_CLAIM_MISSING",
          "sensitive subject",
        ),
        "REPRESENTATIVE_CLAIM_MISSING",
      ],
      [new Error("sensitive database failure"), "DATABASE_FAILURE"],
    ] as const) {
      const state = harness({
        async runGate() {
          throw failure;
        },
      });
      await runMaterialNoteExplainCli(state.dependencies);

      expect(state.stdout).toEqual([]);
      expect(state.stderr).toEqual([
        `DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:${expected}`,
      ]);
      expect(state.exitCodes).toEqual([1]);
      expect(state.stderr.join(" ")).not.toContain("sensitive");
    }
  });
});
