import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  buildPlatformServiceTrialActionBody,
  describePlatformServiceTrialAssigneeChange,
} from "./platform-service-trial-action-body";
import { createBoundTrialAssigneeCandidate } from "./platform-service-trial-assignee-options";
import { buildTrialAssigneeFilterCandidatePath } from "./platform-service-trial-page-state";

const TRIAL_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_ASSIGNEE_ID = "22222222-2222-4222-8222-222222222222";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("platform service trial assignee integration", () => {
  test("all four entry points use the readable shared picker", () => {
    const actions = readSource("./platform-service-trial-action-dialog.tsx");
    const approval = readSource("./platform-service-trial-approval-fields.tsx");
    const filters = readSource("./platform-service-trial-filters.tsx");
    const page = readSource("../../app/(console)/platform/service-orders/page.tsx");
    const sources = `${actions}\n${approval}\n${filters}\n${page}`;
    const forbiddenCopy = [
      ["跟进人", "员工", " ID"].join(""),
      ["员工", " ID"].join(""),
      ["U", "U", "I", "D"].join(""),
    ];

    expect(approval).toContain("PlatformServiceTrialAssigneeCombobox");
    expect(actions).toContain("PlatformServiceTrialAssigneeCombobox");
    expect(filters).toContain("PlatformServiceTrialAssigneeCombobox");
    expect(page).toContain("buildTrialAssigneeFilterCandidatePath");
    for (const copy of forbiddenCopy) expect(sources).not.toContain(copy);
  });

  test("guided review requires a selectable person while standard mode can clear", () => {
    const approval = readSource("./platform-service-trial-approval-fields.tsx");
    const actions = readSource("./platform-service-trial-action-dialog.tsx");

    expect(approval).toContain('required={trialType === "guided"}');
    expect(approval).toContain('allowClear={trialType !== "guided"}');
    expect(actions).toContain("selectedAssignee?.selectable");
    expect(actions).toContain("createBoundTrialAssigneeCandidate(trial.assignee)");
  });

  test("assign has an explicit clear action and readable before-after summary", () => {
    const actions = readSource("./platform-service-trial-action-dialog.tsx");

    expect(actions).toContain("allowClear");
    expect(actions).toContain("describePlatformServiceTrialAssigneeChange");
    expect(actions).toContain("当前负责人");
    expect(actions).toContain("调整结果");
    expect(describePlatformServiceTrialAssigneeChange(null, null)).toEqual({
      current: "未分配",
      next: "保持未分配",
    });

    const current = createBoundTrialAssigneeCandidate({
      id: ACTIVE_ASSIGNEE_ID,
      name: "王运营",
      phone: "138****8000",
      status: "active",
    });
    expect(current).toMatchObject({ selectable: true, historical: false });
    expect(describePlatformServiceTrialAssigneeChange(current, null)).toEqual({
      current: "王运营 · 138****8000",
      next: "将取消当前分配",
    });
  });

  test("review and assign keep the existing mutation field contract", () => {
    const actions = readSource("./platform-service-trial-action-dialog.tsx");
    const common = {
      trial: { version: 3 },
      reason: "同意开通",
      assigneeEmployeeId: ACTIVE_ASSIGNEE_ID,
      trialType: "guided" as const,
      startsAt: "2026-08-14T08:00",
      trialDays: "30",
      graceDays: "7",
      extensionDays: "7",
      scope: ["core.customers" as const],
      idempotencyKey: TRIAL_ID,
    };

    expect(buildPlatformServiceTrialActionBody({ kind: "assign", ...common }))
      .toMatchObject({ assignee_employee_id: ACTIVE_ASSIGNEE_ID, expected_version: 3 });
    expect(buildPlatformServiceTrialActionBody({
      kind: "assign",
      ...common,
      assigneeEmployeeId: null,
    })).toMatchObject({ assignee_employee_id: null, expected_version: 3 });
    expect(buildPlatformServiceTrialActionBody({ kind: "approve", ...common }))
      .toMatchObject({
        decision: "approved",
        trial_type: "guided",
        assignee_employee_id: ACTIVE_ASSIGNEE_ID,
      });
    expect(actions).toContain("assignee_employee_id: assigneeEmployeeId");
  });

  test("filter submits a hidden internal value and reloads its readable active candidate", () => {
    const filters = readSource("./platform-service-trial-filters.tsx");
    const page = readSource("../../app/(console)/platform/service-orders/page.tsx");
    const pageState = readSource("./platform-service-trial-page-state.ts");

    expect(filters).toContain('type="hidden"');
    expect(filters).toContain('name="trialAssigneeEmployeeId"');
    expect(filters).toContain("initialCandidate");
    expect(filters).toContain("allowClear");
    expect(page).toContain("initialAssigneeCandidate");
    expect(pageState).toContain("includeEmployeeId");
    expect(buildTrialAssigneeFilterCandidatePath(ACTIVE_ASSIGNEE_ID)).toBe(
      `/platform/billing/service-trials/assignee-candidates?page=1&pageSize=20&includeEmployeeId=${ACTIVE_ASSIGNEE_ID}`,
    );
    expect(buildTrialAssigneeFilterCandidatePath("untrusted-value")).toBeNull();
    expect(buildTrialAssigneeFilterCandidatePath(undefined)).toBeNull();
  });

  test("bound inactive assignees remain readable, disabled and never expose their value", () => {
    const historical = createBoundTrialAssigneeCandidate({
      id: ACTIVE_ASSIGNEE_ID,
      name: "李顾问",
      phone: "139****9000",
      status: "suspended",
    });

    expect(historical).toMatchObject({
      selectable: false,
      historical: true,
    });
    expect(describePlatformServiceTrialAssigneeChange(historical, historical).current)
      .toBe("李顾问 · 139****9000 · 历史负责人（已停用）");
    expect(describePlatformServiceTrialAssigneeChange(historical, historical).current)
      .not.toContain(ACTIVE_ASSIGNEE_ID);
  });
});
