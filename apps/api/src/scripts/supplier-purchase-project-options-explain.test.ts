import { describe, expect, test } from "bun:test";

import type { ProjectOptionExplainConfig } from
  "./supplier-purchase-project-options-explain-config";
import {
  PROJECT_OPTION_EXPLAIN_QUERY_NAMES,
  buildProjectOptionExplainQueries,
  runProjectOptionExplainGate,
} from "./supplier-purchase-project-options-explain";

const CONFIG: ProjectOptionExplainConfig = {
  databaseUrl: "postgresql://reader:secret@dev.example.test/gooes",
  tenantId: "72000000-0000-4000-8000-000000000001",
  window: {
    updatedAtFrom: "2026-08-22T03:04:05.000Z",
    updatedAtTo: "2026-08-29T03:04:05.000Z",
  },
  keyword: "脱敏关键词",
  visibleProjectIds: ["72000000-0000-4000-8000-000000000002"],
  pageSize: 100,
};

function explainPlan(indexName: string) {
  return [{
    "QUERY PLAN": [{
      Plan: {
        "Node Type": "Index Scan",
        "Index Name": indexName,
        "Shared Hit Blocks": 1,
        "Shared Read Blocks": 2,
        "Temp Read Blocks": 0,
        "Temp Written Blocks": 0,
      },
      "Planning Time": 1,
      "Execution Time": 2,
    }],
  }];
}

describe("supplier purchase project option EXPLAIN runner", () => {
  test("defines the exact bounded read query shapes", () => {
    const queries = buildProjectOptionExplainQueries(CONFIG);
    expect(queries.map(({ name }) => name)).toEqual(
      [...PROJECT_OPTION_EXPLAIN_QUERY_NAMES],
    );
    for (const query of queries) {
      const normalized = query.text.toLowerCase().replaceAll(/\s+/g, " ");
      expect(normalized).toStartWith(
        "explain (analyze, buffers, settings, format json)",
      );
      expect(normalized).toContain("from public.projects as project");
      expect(normalized).toContain("project.tenant_id = $1::uuid");
      expect(normalized).toContain("project.updated_at >= $2::timestamptz");
      expect(normalized).not.toMatch(/\b(?:insert|update|delete|merge|create|alter|drop|truncate)\b/);
      if (query.name.endsWith("_page")) {
        expect(normalized).toContain("select project.id, project.name, project.status");
        expect(query.limit).toBeLessThanOrEqual(100);
      } else {
        expect(normalized).toContain("select count(*)::bigint as total");
      }
    }
    expect(queries[0]!.text).toContain(
      "order by project.updated_at desc, project.id desc",
    );
    expect(queries[2]!.text).toContain("project.name ilike $4 escape E'\\\\'");
    expect(queries[4]!.text).toContain("project.id = any($5::uuid[])");

    const withoutVisible = buildProjectOptionExplainQueries({
      ...CONFIG,
      visibleProjectIds: null,
    });
    expect(withoutVisible.map(({ name }) => name)).toEqual(
      PROJECT_OPTION_EXPLAIN_QUERY_NAMES.slice(0, 4),
    );
    expect(() => buildProjectOptionExplainQueries({
      ...CONFIG,
      pageSize: 101,
    })).toThrow("page size");
  });

  test("binds every page limit at the exact final parameter position", () => {
    const queries = buildProjectOptionExplainQueries(CONFIG);
    const expected = [
      ["tenant_time_page", "$4", 4],
      ["tenant_time_keyword_page", "$5", 5],
      ["bounded_visible_page", "$6", 6],
    ] as const;

    for (const [name, placeholder, valueCount] of expected) {
      const query = queries.find((candidate) => candidate.name === name)!;
      expect(query.text).toContain(`limit ${placeholder}::integer`);
      expect(query.text).not.toContain("limit 100");
      expect(query.values).toHaveLength(valueCount);
      expect(query.values.at(-1)).toBe(CONFIG.pageSize);
    }
    expect(queries[0]!.values).toEqual([
      CONFIG.tenantId,
      CONFIG.window.updatedAtFrom,
      CONFIG.window.updatedAtTo,
      CONFIG.pageSize,
    ]);
    expect(queries[2]!.values).toEqual([
      CONFIG.tenantId,
      CONFIG.window.updatedAtFrom,
      CONFIG.window.updatedAtTo,
      `%${CONFIG.keyword}%`,
      CONFIG.pageSize,
    ]);
    expect(queries[4]!.values).toEqual([
      CONFIG.tenantId,
      CONFIG.window.updatedAtFrom,
      CONFIG.window.updatedAtTo,
      `%${CONFIG.keyword}%`,
      CONFIG.visibleProjectIds,
      CONFIG.pageSize,
    ]);
  });

  test("sets transaction read-only before cardinality and EXPLAIN queries", async () => {
    const events: string[] = [];
    const queryTexts: string[] = [];
    const sql = {
      array(values: unknown[], typeName: string) {
        events.push(`array:${typeName}:${values.length}`);
        return values;
      },
      async unsafe(text: string) {
        queryTexts.push(text);
        if (/set transaction read only/i.test(text)) {
          events.push("read-only");
          return [];
        }
        if (/set local statement_timeout/i.test(text)) {
          events.push("statement-timeout");
          return [];
        }
        if (/select count\(\*\)::integer as count/i.test(text) &&
          !/^\s*explain/i.test(text)) {
          events.push("cardinality");
          return [{ count: 1000 }];
        }
        events.push("explain");
        return explainPlan(
          /name ilike/i.test(text)
            ? "projects_name_purchase_batch_trgm_idx"
            : "projects_tenant_updated_id_purchase_batch_idx",
        );
      },
    };
    const database = {
      async begin<Result>(callback: (transaction: typeof sql) => Promise<Result>) {
        events.push("begin");
        return callback(sql);
      },
      async close() {
        events.push("close");
      },
    };

    const summary = await runProjectOptionExplainGate(CONFIG, {
      createDatabase: () => database,
    });

    expect(events[0]).toBe("begin");
    expect(events[1]).toBe("read-only");
    expect(events[2]).toBe("statement-timeout");
    expect(events.indexOf("read-only")).toBeLessThan(
      events.indexOf("statement-timeout"),
    );
    expect(events.indexOf("statement-timeout")).toBeLessThan(
      events.indexOf("cardinality"),
    );
    expect(queryTexts[1]).toBe("set local statement_timeout = '5000ms'");
    expect(events.filter((event) => event === "explain")).toHaveLength(5);
    expect(events.at(-1)).toBe("close");
    expect(queryTexts.filter((text) => /^\s*explain/i.test(text)))
      .toHaveLength(5);

    const serialized = JSON.stringify(summary);
    for (const secret of [
      CONFIG.databaseUrl,
      CONFIG.tenantId,
      CONFIG.keyword,
      ...CONFIG.visibleProjectIds!,
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(summary).toMatchObject({
      gate: "supplier_purchase_project_options",
      explainQueryCount: 5,
      cardinalityBucket: "large",
      visibleProjectCount: 1,
      thresholds: { statementTimeoutMs: 5_000 },
    });
  });

  test("sanitizes a callback failure propagated by begin", async () => {
    const events: string[] = [];
    const sensitiveFailure = [
      CONFIG.databaseUrl,
      CONFIG.tenantId,
      CONFIG.keyword,
    ].join("|");
    const sql = {
      array(values: unknown[]) {
        return values;
      },
      async unsafe(text: string) {
        if (/set transaction read only/i.test(text)) {
          events.push("read-only");
          return [];
        }
        if (/set local statement_timeout/i.test(text)) {
          events.push("statement-timeout");
          return [];
        }
        events.push("callback-query");
        throw new Error(sensitiveFailure);
      },
    };
    const database = {
      async begin<Result>(callback: (transaction: typeof sql) => Promise<Result>) {
        events.push("begin");
        try {
          return await callback(sql);
        } catch (error) {
          events.push("begin-failed");
          throw error;
        }
      },
      async close() {
        events.push("close");
      },
    };

    let failure: unknown;
    try {
      await runProjectOptionExplainGate(CONFIG, {
        createDatabase: () => database,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "DATABASE_FAILURE",
      message: "database query failed",
    });
    const output = String(failure);
    for (const secret of [
      CONFIG.databaseUrl,
      CONFIG.tenantId,
      CONFIG.keyword,
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(events).toEqual([
      "begin",
      "read-only",
      "statement-timeout",
      "callback-query",
      "begin-failed",
      "close",
    ]);
  });
});
