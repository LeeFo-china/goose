import { describe, expect, test } from "bun:test";
import {
  assertReceivableWorkflowTaskCandidate,
  findReceivableWorkflowTaskCandidate,
  parseFinanceReceivablesPhase2SmokeConfig,
  runFinanceReceivablesPhase2Smoke,
} from "./finance-receivables-phase2-smoke";

const receivableTaskPayload = {
  data: {
    list: [
      {
        id: "task-1",
        business_type: "project",
        business_id: "project-1",
        actions: [
          {
            key: "complete",
            label: "确认中期款",
            task_id: "task-1",
            node_key: "payment_stage_2",
            node_type: "confirmation",
            business_domain: "payment_collection",
            business_action: "confirm_payment",
            disabled: false,
            requires_reason: false,
            output_fields: [
              {
                name: "receivable_context",
                label: "应收信息",
                type: "receivable_summary",
                required: false,
                readonly: true,
                receivable_plan_id: "plan-1",
                receivable_amount: 10000,
                receivable_paid_amount: 0,
                receivable_remaining_amount: 10000,
                receivable_status: "pending",
              },
              {
                name: "amount",
                label: "入账金额",
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
};

describe("parseFinanceReceivablesPhase2SmokeConfig", () => {
  test("normalizes read-only config and explicit write switches", () => {
    expect(parseFinanceReceivablesPhase2SmokeConfig({
      GOOES_API_BASE_URL: " http://127.0.0.1:3300/ ",
      FINANCE_RECEIVABLES_SMOKE_EMPLOYEE_TOKEN: " token ",
      FINANCE_RECEIVABLES_SMOKE_PROJECT_ID: " project-1 ",
      FINANCE_RECEIVABLES_SMOKE_TASK_ID: " task-1 ",
      FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE: "true",
      FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON: '{"amount":10000}',
    })).toEqual({
      ok: true,
      config: {
        baseUrl: "http://127.0.0.1:3300",
        employeeToken: "token",
        projectId: "project-1",
        taskId: "task-1",
        allowWrite: true,
        completeOutput: { amount: 10000 },
      },
    });
  });

  test("reports required config and invalid write payload", () => {
    expect(parseFinanceReceivablesPhase2SmokeConfig({
      FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE: "true",
      FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON: "[]",
    })).toEqual({
      ok: false,
      errors: [
        "GOOES_API_BASE_URL is required",
        "FINANCE_RECEIVABLES_SMOKE_EMPLOYEE_TOKEN is required",
        "FINANCE_RECEIVABLES_SMOKE_TASK_ID is required when write smoke is enabled",
        "FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON must be a JSON object",
      ],
    });
  });
});

describe("findReceivableWorkflowTaskCandidate", () => {
  test("finds a payment task that exposes receivable context", () => {
    expect(findReceivableWorkflowTaskCandidate(receivableTaskPayload)).toEqual({
      taskId: "task-1",
      projectId: "project-1",
      actionKey: "complete",
      nodeKey: "payment_stage_2",
      receivablePlanId: "plan-1",
      receivableAmount: 10000,
      receivableRemainingAmount: 10000,
      receivableStatus: "pending",
    });
  });

  test("returns null when no receivable task is present", () => {
    expect(findReceivableWorkflowTaskCandidate({
      data: {
        list: [{ id: "task-2", actions: [] }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    })).toBeNull();
  });
});

describe("assertReceivableWorkflowTaskCandidate", () => {
  test("rejects malformed pagination and missing receivable context", () => {
    expect(() =>
      assertReceivableWorkflowTaskCandidate({
        data: {
          list: [{ id: "task-1", actions: [{ output_fields: [] }] }],
          pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
        },
      }),
    ).toThrow("workflow tasks pagination.pageSize must be between 1 and 100");
  });
});

describe("runFinanceReceivablesPhase2Smoke", () => {
  test("performs read-only checks and reports sample_missing without writes", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({
        data: {
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      }), { status: 200 });
    };

    await expect(runFinanceReceivablesPhase2Smoke({
      config: {
        baseUrl: "https://api.example.com",
        employeeToken: "token",
        projectId: null,
        taskId: null,
        allowWrite: false,
        completeOutput: null,
      },
      fetchImpl,
    })).resolves.toEqual({
      ok: true,
      mode: "read_only",
      candidate: null,
      checks: [
        { name: "finance receivables", ok: true },
        { name: "workflow tasks", ok: true },
      ],
      status: "sample_missing",
    });

    expect(calls).toEqual([
      "https://api.example.com/finance/receivables?page=1&pageSize=20",
      "https://api.example.com/workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project",
    ]);
  });

  test("requires explicit allowWrite before completing a task", async () => {
    await expect(runFinanceReceivablesPhase2Smoke({
      config: {
        baseUrl: "https://api.example.com",
        employeeToken: "token",
        projectId: null,
        taskId: "task-1",
        allowWrite: false,
        completeOutput: { amount: 10000 },
      },
      fetchImpl: async () => new Response(JSON.stringify(receivableTaskPayload), {
        status: 200,
      }),
    })).rejects.toThrow("Write smoke requires FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE=true");
  });
});
