import { describe, expect, test } from "bun:test";
import { ocr } from "tencentcloud-sdk-nodejs-ocr";

describe("Tencent OCR SDK compatibility", () => {
  test("exports the 2018-11-19 client actions used by phase 1", () => {
    const prototype = ocr.v20181119.Client.prototype;

    expect(typeof prototype.BizLicenseOCR).toBe("function");
    expect(typeof prototype.RecognizeEncryptedIDCardOCR).toBe("function");
    expect(typeof prototype.BankCardOCR).toBe("function");
  });
});
