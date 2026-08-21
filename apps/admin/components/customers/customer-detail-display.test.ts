import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  customerDedupeResultLabel,
  customerFollowUpStateMeta,
  customerOriginLabel,
  customerSourceDisplayLabel,
  customerSourceLabel,
  customerStatusMeta,
  douyinAppointmentStatusLabel,
  formatDouyinBudgetRange,
} from "./customer-detail-display";

function hasEnglishEnumText(value: string) {
  return /[A-Za-z_]/.test(value);
}

function readCustomerDetailPageSource() {
  return readFileSync(
    new URL("../../app/(console)/customers/[id]/page.tsx", import.meta.url),
    "utf8",
  );
}

describe("customer detail display", () => {
  test("maps customer detail enum values to Chinese labels", () => {
    expect(customerStatusMeta("following")).toMatchObject({
      label: "跟进中",
      variant: "default",
    });
    expect(customerSourceLabel("platform_assigned")).toBe("平台分配客户");
    expect(customerSourceLabel("h5_campaign")).toBe("员工活动页");
    expect(customerOriginLabel("visitor_self_registered")).toBe("访客自助注册");
    expect(customerFollowUpStateMeta("overdue")).toMatchObject({
      label: "超期",
      variant: "danger",
    });
    expect(customerDedupeResultLabel("existing_customer")).toBe("老客户线索");
    expect(customerSourceDisplayLabel({
      display_label: "员工 H5 活动分享",
      source: "h5_campaign",
    })).toBe("员工活动页");

    const labels = [
      customerStatusMeta("following").label,
      customerSourceLabel("platform_assigned"),
      customerSourceLabel("h5_campaign"),
      customerOriginLabel("visitor_self_registered"),
      customerFollowUpStateMeta("overdue").label,
      customerDedupeResultLabel("existing_customer"),
      customerSourceDisplayLabel({
        display_label: "员工 H5 活动分享",
        source: "h5_campaign",
      }),
    ];

    expect(labels.some(hasEnglishEnumText)).toBe(false);
  });

  test("does not leak unknown English enum values to the detail card", () => {
    expect(customerStatusMeta("crm_sync_failed").label).toBe("未识别状态");
    expect(customerSourceLabel("crm_sync")).toBe("未识别来源");
    expect(customerOriginLabel("external_import")).toBe("未识别渠道");
    expect(customerFollowUpStateMeta("waiting_call").label).toBe("未识别跟进状态");
    expect(customerDedupeResultLabel("manual_merge")).toBe("未识别结果");
  });

  test("renders customer detail as Chinese summary cards instead of raw fields", () => {
    const page = readCustomerDetailPageSource();
    const dialog = readFileSync(
      new URL("./customer-detail-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("客户摘要");
    expect(page).toContain("资料与房产");
    expect(page).toContain("customerStatusMeta");
    expect(page).toContain("customerSourceLabel");
    expect(page).toContain("customerOriginLabel");
    expect(page).toContain("customerFollowUpStateMeta");
    expect(page).not.toContain("{customer.status}</Badge>");
    expect(page).not.toContain("value={customer.customer_origin || \"-\"}");
    expect(page).not.toContain("value={customer.source || \"-\"}");
    expect(page).not.toContain("value={customer.follow_up_state || \"-\"}");

    expect(dialog).toContain("客户摘要");
    expect(dialog).toContain("customerSourceLabel");
    expect(dialog).toContain("customerSourceDisplayLabel");
    expect(dialog).toContain("customerDedupeResultLabel");
    expect(dialog).not.toContain("sourceOptions.find");
    expect(dialog).not.toContain("item.display_label || item.source");
    expect(dialog).not.toContain("item.dedupe_result || \"-\"");
    expect(dialog).not.toContain(">{image}</a>");
    expect(dialog).toContain("查看截图 {index + 1}");
  });

  test("formats the stored Douyin appointment snapshot without recalculation", () => {
    expect(customerSourceDisplayLabel({
      display_label: "抖音小程序",
      source: "douyin",
    })).toBe("抖音小程序");
    expect(douyinAppointmentStatusLabel("pending_confirmation")).toBe("待确认");
    expect(douyinAppointmentStatusLabel("confirmed")).toBe("已确认");
    expect(douyinAppointmentStatusLabel("legacy_status")).toBe("状态未知");
    expect(formatDouyinBudgetRange(98_000, 128_000)).toBe("¥98,000 - ¥128,000");
    expect(formatDouyinBudgetRange(null, 128_000)).toBe("-");
  });

  test("shows safe Douyin source fields and never renders raw source metadata", () => {
    const dialog = readFileSync(
      new URL("./customer-detail-dialog.tsx", import.meta.url),
      "utf8",
    );
    const snapshot = readFileSync(
      new URL("./customer-douyin-source-snapshot.tsx", import.meta.url),
      "utf8",
    );

    expect(dialog).toContain("CustomerDouyinSourceSnapshot");
    expect(dialog).toContain('role="status"');
    expect(dialog).toContain('aria-live="polite"');
    expect(snapshot).toContain("抖音预约");
    expect(snapshot).toContain("预算区间");
    expect(snapshot).toContain("AI 建议");
    expect(snapshot).toContain("douyinAppointmentStatusLabel");
    expect(snapshot).toContain("formatDouyinBudgetRange");
    expect(snapshot).not.toMatch(/JSON\.stringify\s*\(\s*source\.metadata/);
    expect(snapshot).not.toMatch(/request_ip|user_agent|subject_hash|raw_response/);
  });
});
