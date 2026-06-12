import { describe, expect, test } from "bun:test";
import {
  assertPhase5SmokePayload,
  buildPhase5SmokeChecks,
  parsePhase5SmokeConfig,
} from "./phase5-workflow-smoke";

describe("parsePhase5SmokeConfig", () => {
  test("normalizes base url and required tokens from env", () => {
    expect(parsePhase5SmokeConfig({
      GOOES_API_BASE_URL: "https://api.example.com/",
      PHASE5_SMOKE_EMPLOYEE_TOKEN: " employee-token ",
      PHASE5_SMOKE_CUSTOMER_TOKEN: " customer-token ",
      PHASE5_SMOKE_PROJECT_ID: "project-1",
    })).toEqual({
      ok: true,
      config: {
        baseUrl: "https://api.example.com",
        employeeToken: "employee-token",
        customerToken: "customer-token",
        customerProjectId: null,
        projectId: "project-1",
      },
    });
  });

  test("reports missing base url and employee token", () => {
    expect(parsePhase5SmokeConfig({})).toEqual({
      ok: false,
      errors: [
        "GOOES_API_BASE_URL is required",
        "PHASE5_SMOKE_EMPLOYEE_TOKEN is required",
      ],
    });
  });
});

describe("buildPhase5SmokeChecks", () => {
  test("builds employee, customer, and optional project checks", () => {
    const checks = buildPhase5SmokeChecks({
      baseUrl: "https://api.example.com",
      employeeToken: "employee-token",
      customerToken: "customer-token",
      customerProjectId: "customer-project-1",
      projectId: "project-1",
    });

    expect(checks.map((check) => [check.name, check.url, check.token])).toEqual([
      [
        "workflow tasks",
        "https://api.example.com/workflow-tasks?page=1&pageSize=20",
        "employee-token",
      ],
      [
        "task center todos",
        "https://api.example.com/task-center/todos?page=1&pageSize=20",
        "employee-token",
      ],
      [
        "customer bootstrap",
        "https://api.example.com/customer/bootstrap?page=1&pageSize=20",
        "customer-token",
      ],
      [
        "customer project detail bootstrap",
        "https://api.example.com/customer/projects/customer-project-1/detail-bootstrap",
        "customer-token",
      ],
      [
        "project workflow state",
        "https://api.example.com/workflow-subjects/project/project-1/state",
        "employee-token",
      ],
    ]);
  });
});

describe("assertPhase5SmokePayload", () => {
  test("accepts workflow task action metadata and paginated payloads", () => {
    expect(() =>
      assertPhase5SmokePayload("workflow tasks", {
        data: {
          list: [
            {
              id: "task-1",
              actions: [
                {
                  key: "complete",
                  label: "项目签约",
                  task_id: "task-1",
                  node_key: "proposal_confirmed",
                  node_type: "task",
                  business_domain: "project_status",
                  business_action: "sign_contract",
                  requires_reason: false,
                  disabled: false,
                  output_fields: [
                    {
                      name: "signed_amount",
                      label: "签约金额",
                      type: "number",
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      })
    ).not.toThrow();
  });

  test("rejects workflow task actions without output field metadata", () => {
    expect(() =>
      assertPhase5SmokePayload("workflow tasks", {
        data: {
          list: [
            {
              id: "task-1",
              actions: [
                {
                  key: "complete",
                  label: "完成",
                  task_id: "task-1",
                  node_key: "proposal_confirmed",
                  node_type: "task",
                  business_domain: "project_status",
                  business_action: "sign_contract",
                  requires_reason: false,
                  disabled: false,
                },
              ],
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      })
    ).toThrow("workflow tasks action[0] missing output_fields");
  });
});
