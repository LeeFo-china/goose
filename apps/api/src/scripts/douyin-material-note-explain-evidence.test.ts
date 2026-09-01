import { describe, expect, test } from "bun:test";

import { MaterialNoteExplainError } from "./douyin-material-note-explain-config";
import {
  MATERIAL_NOTE_EXPLAIN_CARDINALITY_LIMIT,
  MATERIAL_NOTE_EXPLAIN_ERROR_CODES,
  MATERIAL_NOTE_EXPLAIN_MANIFEST,
  MATERIAL_NOTE_EXPLAIN_QUERY_NAMES,
  MATERIAL_NOTE_EXPLAIN_THRESHOLDS,
  assertMaterialNoteExplainCurrentPlannerSettings,
  assertMaterialNoteExplainIndexMetadata,
  assertMaterialNoteExplainPlanEvidence,
  classifyMaterialNoteCardinality,
  parseMaterialNoteExplainPlan,
  type MaterialNoteExplainIndexMetadata,
  type MaterialNoteExplainQueryName,
} from "./douyin-material-note-explain-evidence";

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

function expectCode(callback: () => unknown, code: string): void {
  let caught: unknown;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(MaterialNoteExplainError);
  if (caught instanceof MaterialNoteExplainError) {
    expect(caught.code).toBe(code);
  }
}

function planRows(
  name: MaterialNoteExplainQueryName,
  overrides: Record<string, unknown> = {},
): unknown {
  const relation = MATERIAL_NOTE_EXPLAIN_MANIFEST[name].primaryRelation;
  return [{
    "QUERY PLAN": [{
      Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": relation,
        Schema: "public",
        Filter: "subject_hash = 'must-not-leak'",
        "Actual Rows": 7,
        "Actual Loops": 1,
        "Shared Hit Blocks": 11,
        "Shared Read Blocks": 12,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
        ...overrides,
      },
      Settings: {},
      "Planning Time": 1.25,
      "Execution Time": 2.5,
    }],
  }];
}

function validMetadata(
  name: MaterialNoteExplainQueryName,
): MaterialNoteExplainIndexMetadata[] {
  return MATERIAL_NOTE_EXPLAIN_MANIFEST[name].indexes.map((entry) => ({
    indexName: entry.name,
    schema: "public",
    relation: entry.relation,
    indisvalid: true,
    indisready: true,
  }));
}

describe("douyin material note EXPLAIN evidence manifest", () => {
  test("locks the three query names, thresholds, relations, and indexes", () => {
    expect(MATERIAL_NOTE_EXPLAIN_QUERY_NAMES).toEqual([
      "public_list",
      "tenant_keyword_list",
      "owned_active_list",
    ]);
    expect(MATERIAL_NOTE_EXPLAIN_CARDINALITY_LIMIT).toBe(1_000);
    expect(MATERIAL_NOTE_EXPLAIN_THRESHOLDS).toEqual({
      statementTimeoutMs: 5_000,
      planningMs: 50,
      executionMs: 250,
      sharedReadBlocks: 20_000,
      tempBlocks: 0,
    });
    expect(MATERIAL_NOTE_EXPLAIN_ERROR_CODES).toEqual([
      "INVALID_PLAN",
      "NON_DEFAULT_PLANNER",
      "INVALID_CARDINALITY",
      "INDEX_RELATION_MISMATCH",
      "INDEX_METADATA_INVALID",
      "PLANNING_THRESHOLD",
      "EXECUTION_THRESHOLD",
      "SHARED_READ_THRESHOLD",
      "TEMP_BLOCKS",
      "UNAPPROVED_INDEX",
      "LARGE_TABLE_SEQ_SCAN",
      "LARGE_TABLE_INDEX_REQUIRED",
    ]);
    expect(MATERIAL_NOTE_EXPLAIN_MANIFEST.public_list.primaryRelation)
      .toBe("douyin_material_notes");
    expect(MATERIAL_NOTE_EXPLAIN_MANIFEST.tenant_keyword_list.primaryRelation)
      .toBe("douyin_material_note_versions");
    expect(MATERIAL_NOTE_EXPLAIN_MANIFEST.owned_active_list.primaryRelation)
      .toBe("douyin_material_note_claims");
    const indexes = Object.values(MATERIAL_NOTE_EXPLAIN_MANIFEST)
      .flatMap((entry) => entry.indexes.map((index) => index.name));
    expect(new Set(indexes)).toEqual(new Set([
      "douyin_material_notes_public_idx",
      "douyin_material_notes_tenant_idx",
      "douyin_material_note_versions_tenant_note_idx",
      "douyin_material_note_versions_title_trgm_idx",
      "douyin_material_note_versions_summary_trgm_idx",
      "douyin_material_note_versions_category_trgm_idx",
      "douyin_material_note_claims_owned_idx",
      "douyin_material_note_claims_tenant_note_history_idx",
    ]));
  });

  test("classifies only safe bounded cardinalities", () => {
    expect(classifyMaterialNoteCardinality(0)).toBe("small");
    expect(classifyMaterialNoteCardinality(999)).toBe("small");
    expect(classifyMaterialNoteCardinality(1_000)).toBe("large");
    for (const value of [-1, 1.5, 1_001, Number.MAX_SAFE_INTEGER]) {
      expectCode(
        () => classifyMaterialNoteCardinality(value),
        "INVALID_CARDINALITY",
      );
    }
  });
});

describe("douyin material note EXPLAIN plan policy", () => {
  test("accepts a small primary-table sequential scan and redacts predicates", () => {
    const parsed = parseMaterialNoteExplainPlan(
      planRows("public_list"),
      "public_list",
    );
    const registry = assertMaterialNoteExplainCurrentPlannerSettings(
      PLANNER_ROWS,
    );
    expect(() => assertMaterialNoteExplainPlanEvidence(parsed, 7, registry))
      .not.toThrow();
    expect(JSON.stringify(parsed)).not.toContain("subject_hash");
    expect(JSON.stringify(parsed)).not.toContain("must-not-leak");
    expect(parsed.actualRows).toBe(7);
    expect(parsed.actualLoops).toBe(1);
  });

  test("rejects a large primary-table sequential scan", () => {
    const parsed = parseMaterialNoteExplainPlan(
      planRows("tenant_keyword_list"),
      "tenant_keyword_list",
    );
    expectCode(
      () => assertMaterialNoteExplainPlanEvidence(
        parsed,
        1_000,
        assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS),
      ),
      "LARGE_TABLE_SEQ_SCAN",
    );
  });

  test("requires an approved primary-table index for a large plan", () => {
    const approved = parseMaterialNoteExplainPlan(
      planRows("owned_active_list", {
        "Node Type": "Index Scan",
        "Index Name": "douyin_material_note_claims_owned_idx",
      }),
      "owned_active_list",
    );
    expect(() => assertMaterialNoteExplainPlanEvidence(
      approved,
      1_000,
      assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS),
    )).not.toThrow();

    const missing = parseMaterialNoteExplainPlan(
      planRows("owned_active_list", {
        "Node Type": "Bitmap Heap Scan",
      }),
      "owned_active_list",
    );
    expectCode(
      () => assertMaterialNoteExplainPlanEvidence(
        missing,
        1_000,
        assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS),
      ),
      "LARGE_TABLE_INDEX_REQUIRED",
    );
  });

  test("rejects planner index names outside the fixed query manifest", () => {
    const mixed = planRows("owned_active_list", {
      "Node Type": "Bitmap Heap Scan",
      Plans: [
        {
          "Node Type": "BitmapOr",
          Plans: [
            {
              "Node Type": "Bitmap Index Scan",
              "Index Name": "douyin_material_note_claims_owned_idx",
            },
            {
              "Node Type": "Bitmap Index Scan",
              "Index Name": "customer_specific_secret_index",
            },
          ],
        },
      ],
    });
    expectCode(
      () => parseMaterialNoteExplainPlan(mixed, "owned_active_list"),
      "UNAPPROVED_INDEX",
    );
  });

  test("rejects malformed plans and threshold violations", () => {
    expectCode(
      () => parseMaterialNoteExplainPlan([], "public_list"),
      "INVALID_PLAN",
    );
    for (const [overrides, code] of [
      [{ "Shared Read Blocks": 20_001 }, "SHARED_READ_THRESHOLD"],
      [{ "Temp Written Blocks": 1 }, "TEMP_BLOCKS"],
    ] as const) {
      const parsed = parseMaterialNoteExplainPlan(
        planRows("public_list", overrides),
        "public_list",
      );
      expectCode(
        () => assertMaterialNoteExplainPlanEvidence(
          parsed,
          1,
          assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS),
        ),
        code,
      );
    }
    const slowPlanning = planRows("public_list") as Array<Record<string, unknown>>;
    ((slowPlanning[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!)
      ["Planning Time"] = 50.01;
    expectCode(
      () => assertMaterialNoteExplainPlanEvidence(
        parseMaterialNoteExplainPlan(slowPlanning, "public_list"),
        1,
        assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS),
      ),
      "PLANNING_THRESHOLD",
    );
    const slowExecution = planRows("public_list") as Array<Record<string, unknown>>;
    ((slowExecution[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!)
      ["Execution Time"] = 250.01;
    expectCode(
      () => assertMaterialNoteExplainPlanEvidence(
        parseMaterialNoteExplainPlan(slowExecution, "public_list"),
        1,
        assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS),
      ),
      "EXECUTION_THRESHOLD",
    );
  });
});

describe("douyin material note EXPLAIN metadata and planner", () => {
  test("requires every approved index to be public, valid, ready, and correctly related", () => {
    for (const name of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
      expect(() => assertMaterialNoteExplainIndexMetadata(
        name,
        validMetadata(name),
      )).not.toThrow();

      const missing = validMetadata(name).slice(1);
      expectCode(
        () => assertMaterialNoteExplainIndexMetadata(name, missing),
        "INDEX_METADATA_INVALID",
      );

      const wrongRelation = validMetadata(name);
      wrongRelation[0] = { ...wrongRelation[0]!, relation: "other_table" };
      expectCode(
        () => assertMaterialNoteExplainIndexMetadata(name, wrongRelation),
        "INDEX_RELATION_MISMATCH",
      );

      const unready = validMetadata(name);
      unready[0] = { ...unready[0]!, indisready: false };
      expectCode(
        () => assertMaterialNoteExplainIndexMetadata(name, unready),
        "INDEX_METADATA_INVALID",
      );
    }
  });

  test("rejects non-default or incomplete planner evidence", () => {
    expect(assertMaterialNoteExplainCurrentPlannerSettings(PLANNER_ROWS))
      .toBeInstanceOf(Map);
    expectCode(
      () => assertMaterialNoteExplainCurrentPlannerSettings([
        { ...PLANNER_ROWS[0]!, current: "off", rawValue: "off" },
        PLANNER_ROWS[1],
      ]),
      "NON_DEFAULT_PLANNER",
    );
    expectCode(
      () => assertMaterialNoteExplainCurrentPlannerSettings([
        PLANNER_ROWS[0],
      ]),
      "NON_DEFAULT_PLANNER",
    );
    expect(() => assertMaterialNoteExplainCurrentPlannerSettings([
      ...PLANNER_ROWS,
      {
        name: "effective_cache_size",
        current: "128MB",
        rawValue: "16384",
        bootValue: "524288",
        category: "Query Tuning / Cost-Based Vacuum Delay",
        source: "configuration file",
      },
    ])).not.toThrow();
  });
});
