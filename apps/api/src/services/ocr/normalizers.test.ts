import { describe, expect, test } from "bun:test";

import { normalizeOcrResponse } from "./normalizers";

describe("OCR provider normalizers", () => {
  test("normalizes business license fields, period and copy warning", () => {
    const result = normalizeOcrResponse("business_license", {
      Name: "示例装饰工程有限公司",
      RegNum: "91410000TEST123456",
      Address: "河南省固始县示例路 1 号",
      Person: "张三",
      Period: "2020年01月01日至长期",
      RecognizeWarnCode: [-9102],
      RequestId: "request-license",
    });

    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "license_name", value: "示例装饰工程有限公司" }),
      expect.objectContaining({ key: "license_code", value: "91410000TEST123456" }),
      expect.objectContaining({ key: "legal_representative_name", value: "张三" }),
      expect.objectContaining({ key: "license_period_begin", value: "2020-01-01" }),
      expect.objectContaining({ key: "license_period_end", value: "长期" }),
    ]));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "DOCUMENT_COPY_SUSPECTED",
    }));
    expect(result.providerRequestId).toBe("request-license");
  });

  test("normalizes encrypted ID card front sensitive fields", () => {
    const result = normalizeOcrResponse("id_card_front", {
      Name: "李四",
      IdNum: "411500199001010011",
      Address: "河南省固始县测试地址",
      AdvancedInfo: JSON.stringify({
        Quality: 88,
        WarnInfos: [-9107],
      }),
      RequestId: "request-id-front",
    });

    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "identity_name", value: "李四" }),
      expect.objectContaining({
        key: "identity_number",
        value: "411500199001010011",
        sensitive: true,
      }),
      expect.objectContaining({
        key: "identity_address",
        value: "河南省固始县测试地址",
        sensitive: true,
      }),
    ]));
    expect(result.quality).toEqual({ score: 88 });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "DOCUMENT_REFLECTION_SUSPECTED",
    }));
  });

  test("normalizes ID card back validity including long-term", () => {
    const result = normalizeOcrResponse("id_card_back", {
      Authority: "固始县公安局",
      ValidDate: "2020.01.01-长期",
      RequestId: "request-id-back",
    });

    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "identity_period_begin", value: "2020-01-01" }),
      expect.objectContaining({ key: "identity_period_end", value: "长期" }),
    ]));
  });

  test("normalizes bank account fields and quality warning", () => {
    const result = normalizeOcrResponse("bank_card", {
      CardNo: "6222021234567890",
      BankInfo: "中国工商银行",
      CardType: "借记卡",
      QualityValue: 42,
      WarningCode: [-9111],
      RequestId: "request-bank",
    });

    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "settlement_account_number",
        value: "6222021234567890",
        sensitive: true,
      }),
      expect.objectContaining({ key: "settlement_bank_name", value: "中国工商银行" }),
      expect.objectContaining({ key: "settlement_card_type", value: "借记卡" }),
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "IMAGE_QUALITY_LOW" }),
      expect.objectContaining({ code: "DOCUMENT_BORDER_INCOMPLETE" }),
    ]));
  });

  test("rejects malformed provider responses", () => {
    expect(() => normalizeOcrResponse("business_license", {
      RequestId: "request-empty",
    })).toThrow(expect.objectContaining({ code: "OCR_RESULT_INVALID" }));
  });
});
