import { describe, expect, test } from "bun:test";
import { TaskCenterTodoListQuerySchema } from "./task-center";

describe("TaskCenterTodoListQuerySchema", () => {
  test("accepts billing payment due todo filter", () => {
    expect(TaskCenterTodoListQuerySchema.safeParse({
      type: "billing_payment_due",
      page: "1",
      pageSize: "20",
    }).success).toBe(true);
  });
});
