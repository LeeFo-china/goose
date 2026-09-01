import { describe, expect, test } from "bun:test";

import {
  MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG,
  MaterialNoteExplainError,
  type MaterialNoteExplainConfig,
} from "./douyin-material-note-explain-config";
import {
  MATERIAL_NOTE_EXPLAIN_MANIFEST,
  MATERIAL_NOTE_EXPLAIN_QUERY_NAMES,
  type MaterialNoteExplainIndexMetadata,
} from "./douyin-material-note-explain-evidence";
import {
  MATERIAL_NOTE_EXPLAIN_QUERIES,
  runMaterialNoteExplainGate,
  type MaterialNoteExplainDatabase,
  type MaterialNoteExplainDependencies,
  type MaterialNoteExplainSql,
} from "./douyin-material-note-explain";

const CONFIG: MaterialNoteExplainConfig = {
  databaseUrl: "postgresql://privileged:secret@dev.example.test/gooes",
};
const FIXTURE = {
  noteId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  installationId: "33333333-3333-4333-8333-333333333333",
};
const SUBJECT_HASH = "a".repeat(64);

type QueryName = typeof MATERIAL_NOTE_EXPLAIN_QUERY_NAMES[number];
type EventName =
  | "set-transaction"
  | "statement-timeout"
  | "guard-start"
  | "guard-end"
  | "role"
  | "planner"
  | "fixture"
  | "claim"
  | "metadata"
  | `count:${QueryName}`
  | `explain:${QueryName}`;

interface HarnessOptions {
  readonly responses?: Partial<Record<EventName, unknown>>;
  readonly failures?: Partial<Record<EventName, unknown>>;
  readonly closeFailure?: unknown;
}

const PLANNER_ROWS = [
  {
    name: "enable_seqscan",
    current: "on",
    rawValue: "on",
    bootValue: "on",
    category: "Query Tuning / Planner Method Configuration",
    source: "default",
  },
  {
    name: "plan_cache_mode",
    current: "auto",
    rawValue: "auto",
    bootValue: "auto",
    category: "Query Tuning / Other Planner Options",
    source: "default",
  },
];

const METADATA_BY_NAME = new Map<string, MaterialNoteExplainIndexMetadata>();
for (const queryName of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
  for (const index of MATERIAL_NOTE_EXPLAIN_MANIFEST[queryName].indexes) {
    METADATA_BY_NAME.set(index.name, {
      indexName: index.name,
      schema: "public",
      relation: index.relation,
      indisvalid: true,
      indisready: true,
    });
  }
}
const METADATA_ROWS = [...METADATA_BY_NAME.values()];

function plan(name: QueryName): unknown {
  return [{
    "QUERY PLAN": [{
      Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": MATERIAL_NOTE_EXPLAIN_MANIFEST[name].primaryRelation,
        Schema: "public",
        "Actual Rows": 1,
        "Actual Loops": 1,
        "Shared Hit Blocks": 1,
        "Shared Read Blocks": 0,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
      },
      Settings: {},
      "Planning Time": 1,
      "Execution Time": 2,
    }],
  }];
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/g, " ").trim();
}

function classify(text: string, guardCount: number): EventName {
  const sql = normalize(text);
  if (sql === "set transaction isolation level repeatable read, read only") {
    return "set-transaction";
  }
  if (sql === "set local statement_timeout = '5000ms'") {
    return "statement-timeout";
  }
  if (sql.includes("pg_backend_pid()")) {
    return guardCount === 0 ? "guard-start" : "guard-end";
  }
  if (sql.includes("from pg_roles")) return "role";
  if (sql.includes("from pg_settings")) return "planner";
  if (sql.includes("from pg_index")) return "metadata";
  if (sql.includes("public.douyin_miniapp_installations as installation") &&
    sql.includes('as "noteid"')) {
    return "fixture";
  }
  if (sql.startsWith("select claim.subject_hash")) return "claim";
  if (sql.startsWith("select count(*)::integer")) {
    if (sql.includes("douyin_material_note_versions")) {
      return "count:tenant_keyword_list";
    }
    if (sql.includes("douyin_material_note_claims")) {
      return "count:owned_active_list";
    }
    return "count:public_list";
  }
  if (sql.startsWith("explain ")) {
    if (sql.includes("-- tenant_keyword_list")) {
      return "explain:tenant_keyword_list";
    }
    if (sql.includes("-- owned_active_list")) {
      return "explain:owned_active_list";
    }
    return "explain:public_list";
  }
  throw new Error("unclassified SQL in test harness");
}

function defaultResponse(event: EventName): unknown {
  if (event.startsWith("set-") || event === "statement-timeout") return [];
  if (event.startsWith("guard-")) {
    return [{
      backendPid: 4242,
      readOnly: "on",
      isolation: "repeatable read",
    }];
  }
  if (event === "role") return [{ rolsuper: false, rolbypassrl: true }];
  if (event === "planner") return PLANNER_ROWS;
  if (event === "fixture") return [FIXTURE];
  if (event === "claim") return [{ subjectHash: SUBJECT_HASH }];
  if (event.startsWith("count:")) return [{ count: 7 }];
  if (event === "metadata") return METADATA_ROWS;
  return plan(event.slice("explain:".length) as QueryName);
}

function makeHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const calls: Array<{
    readonly event: EventName;
    readonly text: string;
    readonly values?: unknown[];
  }> = [];
  let guardCount = 0;
  let beginCount = 0;
  const sql: MaterialNoteExplainSql = {
    async unsafe(text, values) {
      const event = classify(text, guardCount);
      if (event.startsWith("guard-")) guardCount += 1;
      events.push(event);
      calls.push({ event, text, values });
      if (Object.hasOwn(options.failures ?? {}, event)) {
        throw options.failures![event];
      }
      return Object.hasOwn(options.responses ?? {}, event)
        ? options.responses![event]
        : defaultResponse(event);
    },
  };
  const database: MaterialNoteExplainDatabase = {
    async begin<Result>(
      callback: (transaction: MaterialNoteExplainSql) => Promise<Result>,
    ): Promise<Result> {
      beginCount += 1;
      events.push("begin");
      return callback(sql);
    },
    async close(): Promise<void> {
      events.push("close");
      if (options.closeFailure !== undefined) throw options.closeFailure;
    },
  };
  const dependencies: MaterialNoteExplainDependencies = {
    createDatabase(databaseUrl) {
      expect(databaseUrl).toBe(CONFIG.databaseUrl);
      return database;
    },
  };
  return { beginCount: () => beginCount, calls, dependencies, events };
}

async function captureFailure(
  options: HarnessOptions,
): Promise<{ readonly error: MaterialNoteExplainError; readonly events: string[] }> {
  const harness = makeHarness(options);
  let caught: unknown;
  try {
    await runMaterialNoteExplainGate(CONFIG, harness.dependencies);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(MaterialNoteExplainError);
  return {
    error: caught as MaterialNoteExplainError,
    events: harness.events,
  };
}

describe("douyin material note EXPLAIN SQL", () => {
  test("exports three read-only parameterized and bounded query shapes", () => {
    expect(Object.keys(MATERIAL_NOTE_EXPLAIN_QUERIES))
      .toEqual([...MATERIAL_NOTE_EXPLAIN_QUERY_NAMES]);
    for (const [name, text] of Object.entries(
      MATERIAL_NOTE_EXPLAIN_QUERIES,
    )) {
      expect(normalize(text)).toStartWith(
        "explain (analyze, buffers, settings, verbose, format json)",
      );
      expect(text).toContain(`-- ${name}`);
      expect(normalize(text)).toContain("limit 20");
      expect(text).not.toMatch(
        /^\s*(?:insert|update|delete|merge|create|alter|drop|truncate|analyze)\b/i,
      );
    }

    const publicSql = normalize(MATERIAL_NOTE_EXPLAIN_QUERIES.public_list);
    expect(publicSql).toContain("note.status = 'published'");
    expect(publicSql).toContain("claim.subject_hash = $3::text");
    expect(publicSql).toContain(
      "order by note.published_at desc, note.id desc",
    );

    const keywordSql = normalize(
      MATERIAL_NOTE_EXPLAIN_QUERIES.tenant_keyword_list,
    );
    expect(keywordSql).toContain("version.title ilike $2 escape");
    expect(keywordSql).toContain("version.summary ilike $2 escape");
    expect(keywordSql).toContain("version.category ilike $2 escape");
    expect(keywordSql).toContain(
      "order by note.updated_at desc, note.id desc",
    );

    const ownedSql = normalize(
      MATERIAL_NOTE_EXPLAIN_QUERIES.owned_active_list,
    );
    expect(ownedSql).toContain("claim.removed_at is null");
    expect(ownedSql).toContain(
      "order by claim.claimed_at desc, claim.id desc",
    );
  });

  test("runs one guarded transaction in the exact evidence order", async () => {
    const harness = makeHarness();
    const summary = await runMaterialNoteExplainGate(
      CONFIG,
      harness.dependencies,
    );

    expect(harness.beginCount()).toBe(1);
    expect(harness.events).toEqual([
      "begin",
      "set-transaction",
      "statement-timeout",
      "guard-start",
      "role",
      "planner",
      "fixture",
      "claim",
      "count:public_list",
      "count:tenant_keyword_list",
      "count:owned_active_list",
      "metadata",
      "explain:public_list",
      "explain:tenant_keyword_list",
      "explain:owned_active_list",
      "guard-end",
      "close",
    ]);
    expect(summary.gate).toBe("douyin_material_note_queries");
    expect(summary.queryCount).toBe(3);
    expect(Object.keys(summary.queries)).toEqual([
      ...MATERIAL_NOTE_EXPLAIN_QUERY_NAMES,
    ]);
    expect(JSON.stringify(summary)).not.toContain(FIXTURE.tenantId);
    expect(JSON.stringify(summary)).not.toContain(FIXTURE.installationId);
    expect(JSON.stringify(summary)).not.toContain(FIXTURE.noteId);
    expect(JSON.stringify(summary)).not.toContain(SUBJECT_HASH);
  });

  test("uses the fixed fixture and exact plan bindings", async () => {
    const harness = makeHarness();
    await runMaterialNoteExplainGate(CONFIG, harness.dependencies);

    expect(harness.calls.find((call) => call.event === "fixture")!.values)
      .toEqual([MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG]);
    expect(harness.calls.find((call) => call.event === "claim")!.values)
      .toEqual([
        FIXTURE.tenantId,
        FIXTURE.installationId,
        FIXTURE.noteId,
      ]);
    expect(harness.calls.filter((call) => call.event.startsWith("explain:"))
      .map((call) => call.values)).toEqual([
        [FIXTURE.tenantId, FIXTURE.installationId, SUBJECT_HASH],
        [FIXTURE.tenantId, `%${MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG}%`],
        [FIXTURE.tenantId, FIXTURE.installationId, SUBJECT_HASH],
      ]);
  });
});

describe("douyin material note EXPLAIN guards", () => {
  test("requires one published fixture and one active merchant installation", async () => {
    for (const rows of [
      [],
      [FIXTURE, FIXTURE],
      [{ ...FIXTURE, noteId: "invalid" }],
      [{ noteId: FIXTURE.noteId, tenantId: FIXTURE.tenantId }],
    ]) {
      const { error } = await captureFailure({
        responses: { fixture: rows },
      });
      expect(error.code).toBe("INVALID_FIXTURE");
    }
  });

  test("requires at least one real active claim without creating one", async () => {
    const { error, events } = await captureFailure({
      responses: { claim: [] },
    });
    expect(events).toEqual([
      "begin",
      "set-transaction",
      "statement-timeout",
      "guard-start",
      "role",
      "planner",
      "fixture",
      "claim",
      "close",
    ]);
    expect(error.code).toBe("REPRESENTATIVE_CLAIM_MISSING");
  });

  test("rejects malformed subject hashes and transaction changes", async () => {
    const invalidClaim = await captureFailure({
      responses: { claim: [{ subjectHash: "not-a-hash" }] },
    });
    expect(invalidClaim.error.code).toBe("INVALID_FIXTURE");

    const changedBackend = await captureFailure({
      responses: {
        "guard-end": [{
          backendPid: 9999,
          readOnly: "on",
          isolation: "repeatable read",
        }],
      },
    });
    expect(changedBackend.error.code).toBe("TRANSACTION_GUARD_INVALID");
  });

  test("normalizes statement timeout and close failures", async () => {
    const timeout = await captureFailure({
      failures: {
        "explain:public_list": { code: "57014", message: "secret timeout" },
      },
    });
    expect(timeout.error.code).toBe("QUERY_TIMEOUT");
    expect(timeout.error.message).not.toContain("secret");

    const close = await captureFailure({
      closeFailure: new Error("secret close failure"),
    });
    expect(close.error.code).toBe("DATABASE_CLOSE_FAILED");
    expect(close.error.message).not.toContain("secret");
  });
});
