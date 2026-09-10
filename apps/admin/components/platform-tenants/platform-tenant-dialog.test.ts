import { describe, expect, test } from "bun:test";

import { buildAddressPayload } from "./platform-tenant-dialog";

describe("platform tenant address payload", () => {
  test("normalizes a legacy confirmed timestamp before sending the tenant update", () => {
    const formData = addressFormData("2026-09-10T18:20:30+08:00");

    expect(buildAddressPayload(formData).address_confirmed_at)
      .toBe("2026-09-10T10:20:30.000Z");
  });

  test("omits an invalid legacy confirmed timestamp instead of echoing it", () => {
    const body = JSON.parse(JSON.stringify(buildAddressPayload(addressFormData("legacy-invalid"))));

    expect(body).not.toHaveProperty("address_confirmed_at");
  });
});

function addressFormData(confirmedAt: string): FormData {
  const formData = new FormData();
  formData.set("address", "河南省郑州市金水区示例路 1 号");
  formData.set("address_source", "tencent_suggestion");
  formData.set("address_confirmed_at", confirmedAt);
  return formData;
}
