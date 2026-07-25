import { describe, expect, mock, test } from "bun:test";

import {
  WechatPaySettlementRuleService,
  type WechatPaySettlementRuleRecord,
} from "./wechat-pay-settlement-rules";

describe("WechatPaySettlementRuleService", () => {
  test("lists active settlement rules with pagination for tenant select options", async () => {
    const rule: WechatPaySettlementRuleRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      settlement_id: "716",
      qualification_type: "零售",
      label: "零售",
      rate_label: "0.6%",
      settlement_cycle_label: "T+1",
      requires_special_qualification: false,
      status: "active",
      sort_order: 10,
    };
    const listActive = mock(async () => ({
      list: [rule],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    }));
    const service = new WechatPaySettlementRuleService({
      repository: { listActive, findActiveRule: async () => null },
    });

    const result = await service.listTenantOptions({ page: 1, pageSize: 500 });

    expect(listActive).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
    expect(result.list[0]).toMatchObject({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      settlement_id: "716",
      qualification_type: "零售",
    });
  });

  test("validates official subject settlement industry combinations from repository data", async () => {
    const rule: WechatPaySettlementRuleRecord = {
      id: "22222222-2222-4222-8222-222222222222",
      subject_type: "SUBJECT_TYPE_INDIVIDUAL",
      settlement_id: "719",
      qualification_type: "餐饮",
      label: "餐饮",
      rate_label: "0.6%",
      settlement_cycle_label: "T+1",
      requires_special_qualification: false,
      status: "active",
      sort_order: 20,
    };
    const findActiveRule = mock(async () => rule);
    const service = new WechatPaySettlementRuleService({
      repository: {
        listActive: async () => ({
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
        findActiveRule,
      },
    });

    await expect(
      service.assertActiveRule({
        subject_type: "SUBJECT_TYPE_INDIVIDUAL",
        settlement_id: "719",
        qualification_type: "餐饮",
      }),
    ).resolves.toBeUndefined();

    expect(findActiveRule).toHaveBeenCalledWith({
      subjectType: "SUBJECT_TYPE_INDIVIDUAL",
      settlementId: "719",
      qualificationType: "餐饮",
    });
  });

  test("rejects inactive or unknown subject settlement industry combinations", async () => {
    const service = new WechatPaySettlementRuleService({
      repository: {
        listActive: async () => ({
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
        findActiveRule: async () => null,
      },
    });

    await expect(
      service.assertActiveRule({
        subject_type: "SUBJECT_TYPE_ENTERPRISE",
        settlement_id: "716",
        qualification_type: "餐饮",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_PAY_SETTLEMENT_RULE_INVALID",
    });
  });
});
