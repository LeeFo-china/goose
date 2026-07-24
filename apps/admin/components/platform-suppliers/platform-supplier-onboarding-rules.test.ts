import { describe, expect, test } from "bun:test";

import {
  mapBusinessLicenseOcrFields,
  normalizeCreditCode,
} from "./platform-supplier-onboarding-rules";

describe("platform supplier onboarding rules", () => {
  test("maps supplier business license OCR fields into editable form values", () => {
    expect(mapBusinessLicenseOcrFields([
      {
        key: "license_name",
        label: "营业执照主体名称",
        value: "晴天建材有限公司",
        normalized: true,
        sensitive: false,
        confidence: null,
      },
      {
        key: "license_code",
        label: "统一社会信用代码",
        value: "91411525ma9g000000",
        normalized: true,
        sensitive: false,
        confidence: null,
      },
      {
        key: "license_address",
        label: "注册地址",
        value: "河南省信阳市固始县示例路 1 号",
        normalized: true,
        sensitive: false,
        confidence: null,
      },
      {
        key: "license_period_begin",
        label: "营业期限开始日期",
        value: "2026-07-24",
        normalized: true,
        sensitive: false,
        confidence: null,
      },
      {
        key: "license_period_end",
        label: "营业期限结束日期",
        value: "长期",
        normalized: true,
        sensitive: false,
        confidence: null,
      },
      {
        key: "legal_representative_name",
        label: "法定代表人",
        value: "张三",
        normalized: true,
        sensitive: false,
        confidence: null,
      },
    ])).toEqual({
      legalName: "晴天建材有限公司",
      name: "晴天建材有限公司",
      creditCode: "91411525MA9G000000",
      registeredAddressText: "河南省信阳市固始县示例路 1 号",
      licenseValidFrom: "2026-07-24",
      licenseValidUntil: "",
      legalRepresentativeName: "张三",
    });
  });

  test("normalizes credit code for duplicate checks and submissions", () => {
    expect(normalizeCreditCode(" 91411525ma9g000000 ")).toBe(
      "91411525MA9G000000",
    );
  });
});
