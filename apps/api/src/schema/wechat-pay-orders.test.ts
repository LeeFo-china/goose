import { describe, expect, test } from "bun:test";
import {
  CreateWechatPayOrderSchema,
  WechatPayOrderListQuerySchema,
} from "./wechat-pay-orders";

const projectId = "11111111-1111-4111-8111-111111111111";
const receivablePlanId = "22222222-2222-4222-8222-222222222222";
const workflowTaskId = "33333333-3333-4333-8333-333333333333";

describe("wechat pay order schemas", () => {
  test("accepts workflow-bound project payment order creation input", () => {
    const result = CreateWechatPayOrderSchema.safeParse({
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: "10000.50",
      payer_openid: "  o-test-openid  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 10000.5,
      payer_openid: "o-test-openid",
    });
  });

  test("rejects invalid order amount and ids", () => {
    const result = CreateWechatPayOrderSchema.safeParse({
      project_id: "project-1",
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 0,
    });

    expect(result.success).toBe(false);
  });

  test("requires payer openid before order creation", () => {
    const result = CreateWechatPayOrderSchema.safeParse({
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 100,
    });

    expect(result.success).toBe(false);
  });

  test("parses paginated order list filters", () => {
    const result = WechatPayOrderListQuerySchema.safeParse({
      page: "2",
      pageSize: "50",
      status: "pending",
      project_id: projectId,
      workflow_task_id: workflowTaskId,
      receivable_plan_id: receivablePlanId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      page: 2,
      pageSize: 50,
      status: "pending",
      project_id: projectId,
      workflow_task_id: workflowTaskId,
      receivable_plan_id: receivablePlanId,
    });
  });

  test("rejects unsupported order status", () => {
    const result = WechatPayOrderListQuerySchema.safeParse({
      status: "confirmed",
    });

    expect(result.success).toBe(false);
  });
});
