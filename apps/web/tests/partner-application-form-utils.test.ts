import { describe, expect, mock, test } from "bun:test";

import {
  buildPartnerApplicationPayload,
  focusFirstInvalidField,
  normalizePartnerAttribution,
  validatePartnerApplicationForm,
} from "../components/official-site/partner-application-form-utils";

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("applicant_name", "信阳星河装饰");
  formData.set("contact_name", "李经理");
  formData.set("phone", "13800138000");
  formData.set("region_name", "河南信阳");
  return formData;
}

describe("partner application form helpers", () => {
  test("keeps SMS optional while validating required business fields", () => {
    expect(validatePartnerApplicationForm(validFormData(), true)).toEqual({});

    const invalid = new FormData();
    expect(validatePartnerApplicationForm(invalid, false)).toEqual({
      applicant_name: "请填写申请主体",
      contact_name: "请填写联系人",
      phone: "请输入正确的 11 位手机号",
      region_name: "请填写意向代理城市",
      privacy: "请先确认申请信息使用说明",
    });
  });

  test("bounds source URL and UTM values to the backend schema", () => {
    const longValue = "campaign".repeat(80);
    const href = `https://www.goodcms.cn/partners?utm_source=${longValue}`;
    const attribution = normalizePartnerAttribution(
      href,
      `?utm_source=${longValue}&utm_medium=${longValue}&utm_campaign=${longValue}`,
    );
    const payload = buildPartnerApplicationPayload(
      validFormData(),
      "company",
      true,
      attribution,
    );

    expect(payload.source_url).toBe("https://www.goodcms.cn/partners");
    expect(String(payload.utm_source)).toHaveLength(120);
    expect(String(payload.utm_medium)).toHaveLength(120);
    expect(String(payload.utm_campaign)).toHaveLength(120);
  });

  test("omits a source URL that cannot be made valid within 500 characters", () => {
    const attribution = normalizePartnerAttribution(
      `https://www.goodcms.cn/${"p".repeat(600)}`,
      "",
    );

    expect(attribution.sourceUrl).toBeUndefined();
  });

  test("keeps a valid source URL at the exact 500 character boundary", () => {
    const origin = "https://www.goodcms.cn/";
    const href = `${origin}${"p".repeat(500 - origin.length)}`;

    expect(normalizePartnerAttribution(href, "").sourceUrl).toBe(href);
    expect(href).toHaveLength(500);
  });

  test("focuses the first invalid form control in business order", () => {
    const phoneFocus = mock(() => undefined);
    const regionFocus = mock(() => undefined);
    const form = {
      elements: {
        namedItem(name: string) {
          if (name === "phone") return { focus: phoneFocus };
          if (name === "region_name") return { focus: regionFocus };
          return null;
        },
      },
    } as unknown as HTMLFormElement;

    expect(
      focusFirstInvalidField(form, {
        phone: "手机号错误",
        region_name: "城市错误",
      }),
    ).toBe("phone");
    expect(phoneFocus).toHaveBeenCalledTimes(1);
    expect(regionFocus).not.toHaveBeenCalled();
  });
});
