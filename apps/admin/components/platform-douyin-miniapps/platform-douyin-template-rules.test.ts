import { describe, expect, test } from "bun:test";
import { getTemplateConfirmationState } from
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
