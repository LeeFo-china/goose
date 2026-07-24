import { describe, expect, test } from "bun:test";
import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
} from "node:crypto";

import {
  buildWechatPayApplymentMediaMultipart,
  buildWechatPayApplymentSubmitRequest,
} from "./wechat-pay-applyment-request-builder";

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

const source = {
  subject_type: "SUBJECT_TYPE_ENTERPRISE" as const,
  merchant_short_name: "晴天装饰",
  license_name: "固始晴天装饰工程有限公司",
  license_code: "91411525MA00000000",
  license_address: "河南省信阳市固始县示例大道1号",
  license_period_begin: "2020-01-01",
  license_period_end: "长期",
  legal_representative_name: "张三",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD" as const,
  identity_period_begin: "2020-01-01",
  identity_period_end: "2040-01-01",
  contact_type: "LEGAL" as const,
  contact_identity_doc_type: null,
  contact_identity_period_begin: null,
  contact_identity_period_end: null,
  service_phone: "0376-1234567",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE" as const,
  settlement_bank_name: "中国银行",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_branch_id: "104515080123",
  settlement_id: "716",
  qualification_type: "零售批发/生活娱乐/网上商城/其他",
};

const sensitive = {
  identity_name: "张三",
  identity_number: "41000019900101001X",
  identity_address: "河南省信阳市固始县示例路1号",
  contact_name: "李四",
  contact_phone: "13800000000",
  contact_email: "admin@example.com",
  contact_identity_number: null,
  contact_identity_address: null,
  bank_account_name: "固始晴天装饰工程有限公司",
  bank_account_number: "6212345678901234",
};

const media = {
  license_copy: "media-license",
  legal_representative_id_card_front: "media-id-front",
  legal_representative_id_card_back: "media-id-back",
  business_scene_material: ["media-mini-program"],
};

describe("buildWechatPayApplymentSubmitRequest", () => {
  test("maps an enterprise legal-contact application and encrypts every sensitive field", () => {
    const request = buildWechatPayApplymentSubmitRequest({
      businessCode: "1561816121_WPA202607010001",
      serviceProviderAppId: "wxbac3b1e168fd968a",
      publicKeyPem: keys.publicKey,
      source,
      sensitive,
      media,
    });

    expect(request).toMatchObject({
      business_code: "1561816121_WPA202607010001",
      contact_info: {
        contact_type: "LEGAL",
      },
      subject_info: {
        subject_type: "SUBJECT_TYPE_ENTERPRISE",
        business_license_info: {
          license_copy: "media-license",
          license_number: "91411525MA00000000",
          merchant_name: "固始晴天装饰工程有限公司",
          legal_person: "张三",
        },
        identity_info: {
          id_doc_type: "IDENTIFICATION_TYPE_IDCARD",
          id_card_info: {
            id_card_copy: "media-id-front",
            id_card_national: "media-id-back",
            card_period_begin: "2020-01-01",
            card_period_end: "2040-01-01",
          },
        },
      },
      business_info: {
        merchant_shortname: "晴天装饰",
        service_phone: "0376-1234567",
        sales_info: {
          sales_scenes_type: ["SALES_SCENES_MINI_PROGRAM"],
          mini_program_info: {
            mini_program_appid: "wxbac3b1e168fd968a",
            mini_program_pics: ["media-mini-program"],
          },
        },
      },
      settlement_info: {
        settlement_id: "716",
        qualification_type: "零售批发/生活娱乐/网上商城/其他",
      },
      bank_account_info: {
        bank_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
        account_bank: "中国银行",
        bank_branch_id: "104515080123",
        bank_name: "中国银行股份有限公司固始支行",
      },
    });
    expect(request.contact_info).not.toHaveProperty("contact_id_number");
    expect(decrypt(request.contact_info.contact_name)).toBe("李四");
    expect(decrypt(request.contact_info.mobile_phone)).toBe("13800000000");
    expect(decrypt(request.contact_info.contact_email)).toBe(
      "admin@example.com",
    );
    expect(decrypt(
      request.subject_info.identity_info.id_card_info.id_card_name,
    )).toBe("张三");
    expect(decrypt(
      request.subject_info.identity_info.id_card_info.id_card_number,
    )).toBe("41000019900101001X");
    expect(decrypt(
      request.subject_info.identity_info.id_card_info.id_card_address ?? "",
    )).toBe("河南省信阳市固始县示例路1号");
    expect(decrypt(request.bank_account_info.account_name)).toBe(
      "固始晴天装饰工程有限公司",
    );
    expect(decrypt(request.bank_account_info.account_number)).toBe(
      "6212345678901234",
    );

    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("41000019900101001X");
    expect(serialized).not.toContain("13800000000");
    expect(serialized).not.toContain("6212345678901234");
  });

  test("adds agent identity fields only for a SUPER contact", () => {
    const request = buildWechatPayApplymentSubmitRequest({
      businessCode: "1561816121_WPA202607010002",
      serviceProviderAppId: "wxbac3b1e168fd968a",
      publicKeyPem: keys.publicKey,
      source: {
        ...source,
        contact_type: "SUPER",
        contact_identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
        contact_identity_period_begin: "2021-01-01",
        contact_identity_period_end: "2041-01-01",
      },
      sensitive: {
        ...sensitive,
        contact_identity_number: "410000198801010013",
        contact_identity_address: "河南省信阳市固始县经办人地址",
      },
      media: {
        ...media,
        contact_id_card_front: "media-contact-front",
        contact_id_card_back: "media-contact-back",
      },
    });

    expect(request.contact_info).toMatchObject({
      contact_type: "SUPER",
      contact_id_doc_type: "IDENTIFICATION_TYPE_IDCARD",
      contact_id_doc_copy: "media-contact-front",
      contact_id_doc_copy_back: "media-contact-back",
      contact_period_begin: "2021-01-01",
      contact_period_end: "2041-01-01",
    });
    expect(decrypt(request.contact_info.contact_id_number ?? "")).toBe(
      "410000198801010013",
    );
  });

  test("rejects missing required SUPER contact media", () => {
    expect(() => buildWechatPayApplymentSubmitRequest({
      businessCode: "1561816121_WPA202607010003",
      serviceProviderAppId: "wxbac3b1e168fd968a",
      publicKeyPem: keys.publicKey,
      source: {
        ...source,
        contact_type: "SUPER",
        contact_identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
        contact_identity_period_begin: "2021-01-01",
        contact_identity_period_end: "2041-01-01",
      },
      sensitive: {
        ...sensitive,
        contact_identity_number: "410000198801010013",
      },
      media,
    })).toThrowError(expect.objectContaining({
      code: "WECHAT_PAY_APPLYMENT_REQUEST_SOURCE_INVALID",
      details: {
        missing: expect.arrayContaining(["media.contact_id_card_front"]),
      },
    }));
  });

  test("rejects enterprise personal accounts at the request boundary", () => {
    expect(() => buildWechatPayApplymentSubmitRequest({
      businessCode: "1561816121_WPA202607010004",
      serviceProviderAppId: "wxbac3b1e168fd968a",
      publicKeyPem: keys.publicKey,
      source: {
        ...source,
        settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
      },
      sensitive,
      media,
    })).toThrowError(expect.objectContaining({
      code: "WECHAT_PAY_APPLYMENT_REQUEST_SOURCE_INVALID",
      details: {
        missing: expect.arrayContaining([
          "source.settlement_account_type",
        ]),
      },
    }));
  });
});

describe("buildWechatPayApplymentMediaMultipart", () => {
  test("uses the exact meta JSON for signing and CRLF multipart framing", () => {
    const file = Buffer.from([0x41, 0x00, 0x42]);
    const result = buildWechatPayApplymentMediaMultipart({
      boundary: "gooes-boundary-1",
      filename: "license.png",
      sha256: "a".repeat(64),
      contentType: "image/png",
      file,
    });
    const metaJson = JSON.stringify({
      filename: "license.png",
      sha256: "a".repeat(64),
    });
    const expected = Buffer.concat([
      Buffer.from(
        "--gooes-boundary-1\r\n" +
        'Content-Disposition: form-data; name="meta"\r\n' +
        "Content-Type: application/json\r\n\r\n" +
        `${metaJson}\r\n` +
        "--gooes-boundary-1\r\n" +
        'Content-Disposition: form-data; name="file"; filename="license.png"\r\n' +
        "Content-Type: image/png\r\n\r\n",
      ),
      file,
      Buffer.from("\r\n--gooes-boundary-1--\r\n"),
    ]);

    expect(result.metaJson).toBe(metaJson);
    expect(result.contentType).toBe(
      "multipart/form-data; boundary=gooes-boundary-1",
    );
    expect(Buffer.from(result.body)).toEqual(expected);
  });
});

function decrypt(ciphertext: string) {
  return privateDecrypt(
    {
      key: keys.privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(ciphertext, "base64"),
  ).toString("utf8");
}
