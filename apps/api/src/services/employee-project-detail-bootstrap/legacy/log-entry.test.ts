import { describe, expect, mock, test } from "bun:test";

describe("employee project detail log entry", () => {
  test("uses exact bundle log total when building first-page pagination", async () => {
    const { buildLogsFromBundle } = await import("./log-entry");
    const result = buildLogsFromBundle.call(
      {
        buildCommentAggregateMap: mock(() => new Map()),
      },
      {
        project: {
          id: "project-1",
        },
        members: [],
        acceptance_rows: [],
        log_stage_rows: [],
        latest_log_rows: [],
        logs: {
          rows: Array.from({ length: 5 }, (_, index) => ({
            id: `log-${index + 1}`,
          })),
          has_more: true,
          total: 28,
          comment_counts: [],
        },
      },
      5,
    );

    expect(result.rows).toHaveLength(5);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 5,
      total: 28,
      totalPages: 6,
    });
  });
});
