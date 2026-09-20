import { describe, expect, test } from "bun:test";
import { getTemplateConfirmationState, getTemplateSelectabilityState } from
  "./platform-douyin-template-rules";

const status = {
  template_app_id: "tt0d647bd99301341b01",
  latest_draft: {
    version: "0.1.4",
    description: "租户发布闭环",
    created_at: 1_786_608_000,
  },
  current_template: null,
  is_latest_confirmed: false,
};

describe("getTemplateConfirmationState", () => {
  test("offers confirmation only when a newer complete draft is available", () => {
    expect(getTemplateConfirmationState(status)).toEqual({
      canConfirm: true,
      label: "发现待确认草稿",
      tone: "warning",
    });
  });

  test("marks the latest draft confirmed without another provider action", () => {
    expect(getTemplateConfirmationState({
      ...status,
      is_latest_confirmed: true,
    })).toEqual({
      canConfirm: false,
      label: "当前模板已确认",
      tone: "success",
    });
  });

  test("fails closed when the template app has no complete draft", () => {
    expect(getTemplateConfirmationState({
      ...status,
      latest_draft: null,
    })).toEqual({
      canConfirm: false,
      label: "暂无可用草稿",
      tone: "neutral",
    });
  });
});

describe("getTemplateSelectabilityState", () => {
  const template = {
    id: "00000000-0000-4000-8000-000000000001",
    template_id: "78149", template_version: "0.1.4", description: "稳定模板",
    channel: "default" as const, is_current: false, is_tenant_selectable: true,
    confirmed_at: "2026-09-20T10:00:00.000Z",
    selectability_updated_at: "2026-09-20T10:00:00.000Z",
  };

  test("locks the recommended template in the tenant allowlist", () => {
    expect(getTemplateSelectabilityState({ ...template, is_current: true })).toEqual({
      disabled: true,
      label: "推荐版本，租户可选",
      help: "请先确认新的推荐模板",
    });
  });

  test("describes a mutable historical template", () => {
    expect(getTemplateSelectabilityState(template)).toEqual({
      disabled: false, label: "租户可选", help: null,
    });
  });
});
