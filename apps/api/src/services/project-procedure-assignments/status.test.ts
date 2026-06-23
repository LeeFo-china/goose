import { describe, expect, test } from "bun:test";
import {
  calculatePlannedEndDate,
  calculateRemainingDays,
  getEffectiveAssignmentStatus,
  hasDateRangeOverlap,
} from "./status";

describe("project procedure assignment status helpers", () => {
  test("calculates inclusive planned end date", () => {
    expect(calculatePlannedEndDate("2026-06-24", 3)).toBe("2026-06-26");
  });

  test("promotes planned assignment to in_progress on tenant day", () => {
    expect(
      getEffectiveAssignmentStatus({
        status: "planned",
        plannedStartDate: "2026-06-24",
        tenantToday: "2026-06-24",
      }),
    ).toBe("in_progress");
  });

  test("keeps future assignment planned", () => {
    expect(
      getEffectiveAssignmentStatus({
        status: "planned",
        plannedStartDate: "2026-06-25",
        tenantToday: "2026-06-24",
      }),
    ).toBe("planned");
  });

  test("detects inclusive date range overlap", () => {
    expect(
      hasDateRangeOverlap({
        leftStart: "2026-06-24",
        leftEnd: "2026-06-26",
        rightStart: "2026-06-26",
        rightEnd: "2026-06-28",
      }),
    ).toBe(true);
  });

  test("calculates overdue remaining days", () => {
    expect(
      calculateRemainingDays({
        plannedEndDate: "2026-06-20",
        tenantToday: "2026-06-24",
      }),
    ).toBe(-4);
  });
});
