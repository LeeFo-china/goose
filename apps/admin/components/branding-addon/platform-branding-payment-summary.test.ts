import { describe, expect, test } from "bun:test";

import {
  getPaymentReadinessPresentation,
} from "./platform-branding-payment-summary";

describe("platform branding payment summary readiness", () => {
  test("never reports readiness when the server snapshot is unavailable", () => {
    expect(getPaymentReadinessPresentation(null)).toEqual({
      variant: "warning",
      label: "状态未确认",
      description: "完整状态请到支付配置查看",
      blockers: [],
    });
  });

  test("uses the server readiness verdict and blocker messages verbatim", () => {
    expect(getPaymentReadinessPresentation({
      ready: false,
      blockers: [
        { code: "MESSAGE_TOKEN_MISSING", message: "请先配置虚拟支付消息令牌" },
        { code: "ORIGINAL_ID_INVALID", message: "小程序原始 ID 格式不正确" },
      ],
    })).toEqual({
      variant: "warning",
      label: "2 项阻塞",
      description: "生产环境尚未满足虚拟支付启用条件",
      blockers: ["请先配置虚拟支付消息令牌", "小程序原始 ID 格式不正确"],
    });

    expect(getPaymentReadinessPresentation({
      ready: true,
      blockers: [],
    })).toEqual({
      variant: "success",
      label: "服务端判定已就绪",
      description: "生产环境与消息鉴权已满足启用条件",
      blockers: [],
    });
  });
});
