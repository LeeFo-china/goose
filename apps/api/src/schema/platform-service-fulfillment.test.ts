import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";

import {
  PlatformServiceAcceptancePreparationSchema,
  PlatformServiceFulfillmentRecordSchema,
  PlatformServiceOrderListQuerySchema,
  PlatformServiceOverdueAcceptanceConfirmSchema,
  PlatformServiceRefundReviewSchema,
  PlatformServiceWorkOrderAssignSchema,
  PlatformServiceWorkOrderListQuerySchema,
  PlatformServiceWorkOrderTransitionSchema,
} from "./platform-service-fulfillment";

describe("platform service fulfillment schemas", () => {
  test("defaults and bounds platform service order list pagination", () => {
    expect(PlatformServiceOrderListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(PlatformServiceOrderListQuerySchema.safeParse({
      pageSize: 101,
    }).success).toBe(false);
  });

  test("parses strict platform service order filters", () => {
    expect(PlatformServiceOrderListQuerySchema.parse({
      keyword: " TSO202608 ",
      tenantKeyword: " 示例装企 ",
      paymentStatus: "paid",
      serviceStatus: "deploying",
    })).toMatchObject({
      keyword: "TSO202608",
      tenantKeyword: "示例装企",
      paymentStatus: "paid",
      serviceStatus: "deploying",
    });
    expect(PlatformServiceOrderListQuerySchema.safeParse({
      keyword: "x".repeat(121),
    }).success).toBe(false);
    expect(PlatformServiceOrderListQuerySchema.safeParse({
      unknown: true,
    }).success).toBe(false);
  });

  test("parses work-order list filters without waiting_payment", () => {
    expect(PlatformServiceWorkOrderListQuerySchema.parse({
      status: "training",
      assigneeEmployeeId: randomUUID(),
      keyword: "TSO",
    })).toMatchObject({
      page: 1,
      pageSize: 20,
      status: "training",
      keyword: "TSO",
    });
    expect(PlatformServiceWorkOrderListQuerySchema.safeParse({
      status: "waiting_payment",
    }).success).toBe(false);
  });

  test("requires expected version for work-order assignment and transitions", () => {
    expect(PlatformServiceWorkOrderAssignSchema.safeParse({
      assignee_employee_id: randomUUID(),
      expected_version: 1,
      remark: "安排实施负责人",
    }).success).toBe(true);
    expect(PlatformServiceWorkOrderAssignSchema.safeParse({
      assignee_employee_id: randomUUID(),
      expected_version: 0,
    }).success).toBe(false);
    expect(PlatformServiceWorkOrderTransitionSchema.safeParse({
      to_status: "deploying",
      expected_version: 2,
      remark: "服务器已开始部署",
      metadata: { source: "admin" },
    }).success).toBe(true);
    expect(PlatformServiceWorkOrderTransitionSchema.safeParse({
      to_status: "waiting_payment",
      expected_version: 2,
    }).success).toBe(false);
  });

  test("validates fulfillment record evidence and attachment bounds", () => {
    const valid = {
      record_type: "server_configuration",
      title: "服务器安全基线配置",
      content: "已完成防火墙、安全组和运行环境配置。",
      occurred_at: "2026-08-04T10:00:00+08:00",
      file_ids: [randomUUID(), randomUUID()],
    };
    expect(PlatformServiceFulfillmentRecordSchema.safeParse(valid).success)
      .toBe(true);
    expect(PlatformServiceFulfillmentRecordSchema.safeParse({
      ...valid,
      record_type: "delivery",
    }).success).toBe(false);
    expect(PlatformServiceFulfillmentRecordSchema.safeParse({
      ...valid,
      file_ids: Array.from({ length: 11 }, () => randomUUID()),
    }).success).toBe(false);
  });

  test("validates acceptance preparation without customer confirmation action", () => {
    expect(PlatformServiceAcceptancePreparationSchema.safeParse({
      status: "submitted",
      summary: "客户专属系统环境已部署，服务器配置及首次操作培训已完成。",
      file_ids: [randomUUID()],
    }).success).toBe(true);
    expect(PlatformServiceAcceptancePreparationSchema.safeParse({
      status: "accepted",
      summary: "客户已确认",
    }).success).toBe(false);
  });

  test("validates platform overdue acceptance confirmation", () => {
    expect(PlatformServiceOverdueAcceptanceConfirmSchema.safeParse({
      expected_version: 3,
      remark: "客户超过 3 天未确认，平台依据履约材料确认验收。",
    }).success).toBe(true);
    expect(PlatformServiceOverdueAcceptanceConfirmSchema.safeParse({
      expected_version: 0,
      remark: "版本错误",
    }).success).toBe(false);
    expect(PlatformServiceOverdueAcceptanceConfirmSchema.safeParse({
      expected_version: 3,
      remark: "",
    }).success).toBe(false);
  });

  test("validates refund review decision and expected version", () => {
    expect(PlatformServiceRefundReviewSchema.safeParse({
      decision: "rejected",
      expected_version: 1,
      review_remark: "服务已开始实施，不符合退款条件",
    }).success).toBe(true);
    expect(PlatformServiceRefundReviewSchema.safeParse({
      decision: "approved",
      expected_version: 0,
    }).success).toBe(false);
    expect(PlatformServiceRefundReviewSchema.safeParse({
      decision: "refund",
      expected_version: 1,
    }).success).toBe(false);
  });
});
