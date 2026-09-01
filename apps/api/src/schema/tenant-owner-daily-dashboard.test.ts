import { describe, expect, test } from "bun:test";

import { TenantOwnerProjectGanttQuerySchema } from "./tenant-owner-daily-dashboard";

describe("TenantOwnerProjectGanttQuerySchema", () => {
  test("parses and normalizes gantt filters", () => {
    expect(TenantOwnerProjectGanttQuerySchema.parse({
      page: "2",
      pageSize: "20",
      keyword: "  星河湾  ",
      window_start: "2026-09-01",
      window_end: "2026-09-30",
      timezone: "Asia/Shanghai",
      risk: "delayed",
    })).toEqual({
      page: 2,
      pageSize: 20,
      keyword: "星河湾",
      window_start: "2026-09-01",
      window_end: "2026-09-30",
      timezone: "Asia/Shanghai",
      risk: "delayed",
    });
  });

  test("treats blank optional filters as absent", () => {
    expect(TenantOwnerProjectGanttQuerySchema.parse({
      keyword: " ",
      window_start: "",
      window_end: "undefined",
      risk: "null",
    })).toEqual({
      page: 1,
      pageSize: 20,
      timezone: "Asia/Shanghai",
    });
  });

  test.each([
    [{ window_start: "2026-09-01" }, "排期开始和结束日期必须同时提供"],
    [{ window_end: "2026-09-30" }, "排期开始和结束日期必须同时提供"],
    [
      { window_start: "2026-09-30", window_end: "2026-09-01" },
      "排期开始日期不能晚于结束日期",
    ],
    [{ timezone: "Mars/Olympus" }, "无效的时区"],
    [{ risk: "all" }, "Invalid option"],
  ])("rejects invalid gantt filter %#", (query, message) => {
    const result = TenantOwnerProjectGanttQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join(" "))
        .toContain(message);
    }
  });
});
