import { describe, expect, test } from "bun:test";
import {
  buildProjectHealthBackendQuery,
  buildProjectHealthFilterHref,
  buildProjectHealthHref,
  buildProjectHealthResetHref,
} from "./project-health-query";

describe("project health query helpers", () => {
  test("builds canonical project health href with encoded non-empty filters", () => {
    expect(
      buildProjectHealthHref({
        page: 2,
        severity: "danger",
        riskType: "procedure_overdue",
        keyword: "湖畔",
      }),
    ).toBe(
      "/project-health?page=2&severity=danger&risk_type=procedure_overdue&keyword=%E6%B9%96%E7%95%94",
    );
  });

  test("defaults invalid pages to page 1 and skips empty filters", () => {
    expect(
      buildProjectHealthHref({
        page: "abc",
        severity: "",
        riskType: null,
        keyword: " ",
      }),
    ).toBe("/project-health?page=1");
  });

  test("resets page when filters change", () => {
    expect(
      buildProjectHealthFilterHref(
        { page: 5, severity: "warning", keyword: "旧关键词" },
        { severity: "danger", keyword: "新关键词" },
      ),
    ).toBe(
      "/project-health?page=1&severity=danger&keyword=%E6%96%B0%E5%85%B3%E9%94%AE%E8%AF%8D",
    );
  });

  test("builds reset href", () => {
    expect(buildProjectHealthResetHref()).toBe("/project-health?page=1");
  });

  test("builds backend query with fixed page size", () => {
    expect(
      buildProjectHealthBackendQuery({
        page: 3,
        severity: "warning",
        riskType: "service_ticket",
        keyword: "投诉",
      }),
    ).toBe(
      "page=3&pageSize=20&severity=warning&risk_type=service_ticket&keyword=%E6%8A%95%E8%AF%89",
    );
  });
});
