import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { formatTrialTenantContact } from "./platform-service-trial-rules";

describe("平台试用装企联系方式", () => {
  test("同时展示联系人和手机号并为缺失事实提供明确空态", () => {
    expect(formatTrialTenantContact({
      contact_name: "张**",
      contact_phone: "138****8000",
    })).toBe("张** · 138****8000");
    expect(formatTrialTenantContact({
      contact_name: "张**",
      contact_phone: null,
    })).toBe("张**");
    expect(formatTrialTenantContact({
      contact_name: null,
      contact_phone: "138****8000",
    })).toBe("138****8000");
    expect(formatTrialTenantContact({
      contact_name: null,
      contact_phone: null,
    })).toBe("未留联系方式");
  });

  test("列表使用装企主联系方式且详情区分装企与申请联系人", () => {
    const table = readFileSync(
      new URL("./platform-service-trial-table.tsx", import.meta.url),
      "utf8",
    );
    const detail = readFileSync(
      new URL("./platform-service-trial-detail.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("formatTrialTenantContact(row.original.tenant)");
    expect(table).not.toContain("row.original.tenant.slug}");
    for (const label of [
      "装企联系人",
      "装企联系电话",
      "申请联系人",
      "申请联系电话",
    ]) {
      expect(detail).toContain(label);
    }
  });
});
