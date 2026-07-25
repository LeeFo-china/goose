import {
  normalizeWechatPayQualificationType,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import { encryptWechatPaySensitiveField } from "@/services/wechat-pay-applyment-crypto";
import type { ApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";

export type WechatPayApplymentRequestSource = {
  subject_type: "SUBJECT_TYPE_ENTERPRISE" | "SUBJECT_TYPE_INDIVIDUAL";
  merchant_short_name: string;
  license_name: string;
  license_code: string;
  license_address?: string | null;
  license_period_begin?: string | null;
  license_period_end?: string | null;
  legal_representative_name: string;
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD";
  identity_period_begin: string;
  identity_period_end: string;
  contact_type: "LEGAL" | "SUPER";
  contact_identity_doc_type?: "IDENTIFICATION_TYPE_IDCARD" | null;
  contact_identity_period_begin?: string | null;
  contact_identity_period_end?: string | null;
  service_phone: string;
  settlement_account_type:
    | "BANK_ACCOUNT_TYPE_CORPORATE"
    | "BANK_ACCOUNT_TYPE_PERSONAL";
  settlement_bank_name: string;
  settlement_bank_full_name?: string | null;
  settlement_bank_branch_id?: string | null;
  settlement_id: string;
  qualification_type: string;
};

export type WechatPayApplymentMediaIds = {
  license_copy: string;
  legal_representative_id_card_front: string;
  legal_representative_id_card_back: string;
  contact_id_card_front?: string | null;
  contact_id_card_back?: string | null;
  business_scene_material?: readonly string[];
};

export type WechatPayApplymentSubmitRequest = {
  business_code: string;
  contact_info: {
    contact_type: "LEGAL" | "SUPER";
    contact_name: string;
    contact_id_doc_type?: "IDENTIFICATION_TYPE_IDCARD";
    contact_id_number?: string;
    contact_id_doc_copy?: string;
    contact_id_doc_copy_back?: string;
    contact_period_begin?: string;
    contact_period_end?: string;
    mobile_phone: string;
    contact_email: string;
  };
  subject_info: {
    subject_type: "SUBJECT_TYPE_ENTERPRISE" | "SUBJECT_TYPE_INDIVIDUAL";
    business_license_info: {
      license_copy: string;
      license_number: string;
      merchant_name: string;
      legal_person: string;
      license_address?: string;
      period_begin?: string;
      period_end?: string;
    };
    identity_info: {
      id_doc_type: "IDENTIFICATION_TYPE_IDCARD";
      id_card_info: {
        id_card_copy: string;
        id_card_national: string;
        id_card_name: string;
        id_card_number: string;
        id_card_address?: string;
        card_period_begin: string;
        card_period_end: string;
      };
    };
  };
  business_info: {
    merchant_shortname: string;
    service_phone: string;
    sales_info: {
      sales_scenes_type: ["SALES_SCENES_MINI_PROGRAM"];
      mini_program_info: {
        mini_program_appid: string;
        mini_program_pics?: string[];
      };
    };
  };
  settlement_info: {
    settlement_id: string;
    qualification_type: string;
  };
  bank_account_info: {
    bank_account_type:
      | "BANK_ACCOUNT_TYPE_CORPORATE"
      | "BANK_ACCOUNT_TYPE_PERSONAL";
    account_name: string;
    account_bank: string;
    bank_branch_id?: string;
    bank_name?: string;
    account_number: string;
  };
};

export type WechatPayApplymentMediaContentType =
  | "image/jpeg"
  | "image/png"
  | "image/bmp";

export function buildWechatPayApplymentSubmitRequest(input: {
  businessCode: string;
  serviceProviderAppId: string;
  publicKeyPem: string;
  source: WechatPayApplymentRequestSource;
  sensitive: ApplymentSensitivePayload;
  media: WechatPayApplymentMediaIds;
}): WechatPayApplymentSubmitRequest {
  assertRequestSource(input);
  const qualificationType = normalizeWechatPayQualificationType(
    input.source.qualification_type,
  );
  const encrypt = (value: string) =>
    encryptWechatPaySensitiveField(value, input.publicKeyPem);

  return {
    business_code: input.businessCode,
    contact_info: buildContactInfo(input, encrypt),
    subject_info: {
      subject_type: input.source.subject_type,
      business_license_info: {
        license_copy: input.media.license_copy,
        license_number: input.source.license_code,
        merchant_name: input.source.license_name,
        legal_person: input.source.legal_representative_name,
        ...(input.source.license_address
          ? { license_address: input.source.license_address }
          : {}),
        ...(input.source.license_period_begin
          ? { period_begin: input.source.license_period_begin }
          : {}),
        ...(input.source.license_period_end
          ? { period_end: input.source.license_period_end }
          : {}),
      },
      identity_info: {
        id_doc_type: input.source.identity_doc_type,
        id_card_info: {
          id_card_copy: input.media.legal_representative_id_card_front,
          id_card_national: input.media.legal_representative_id_card_back,
          id_card_name: encrypt(input.sensitive.identity_name),
          id_card_number: encrypt(input.sensitive.identity_number),
          ...(input.sensitive.identity_address
            ? {
              id_card_address: encrypt(input.sensitive.identity_address),
            }
            : {}),
          card_period_begin: input.source.identity_period_begin,
          card_period_end: input.source.identity_period_end,
        },
      },
    },
    business_info: {
      merchant_shortname: input.source.merchant_short_name,
      service_phone: input.source.service_phone,
      sales_info: {
        sales_scenes_type: ["SALES_SCENES_MINI_PROGRAM"],
        mini_program_info: {
          mini_program_appid: input.serviceProviderAppId,
          ...(input.media.business_scene_material?.length
            ? {
              mini_program_pics: [...input.media.business_scene_material],
            }
            : {}),
        },
      },
    },
    settlement_info: {
      settlement_id: input.source.settlement_id,
      qualification_type: qualificationType,
    },
    bank_account_info: {
      bank_account_type: input.source.settlement_account_type,
      account_name: encrypt(input.sensitive.bank_account_name),
      account_bank: input.source.settlement_bank_name,
      ...(input.source.settlement_bank_branch_id
        ? { bank_branch_id: input.source.settlement_bank_branch_id }
        : {}),
      ...(input.source.settlement_bank_full_name
        ? { bank_name: input.source.settlement_bank_full_name }
        : {}),
      account_number: encrypt(input.sensitive.bank_account_number),
    },
  };
}

export function buildWechatPayApplymentMediaMultipart(input: {
  boundary: string;
  filename: string;
  sha256: string;
  contentType: WechatPayApplymentMediaContentType;
  file: Uint8Array;
}): { body: Uint8Array; contentType: string; metaJson: string } {
  assertMediaMultipartInput(input);
  const metaJson = JSON.stringify({
    filename: input.filename,
    sha256: input.sha256.toLowerCase(),
  });
  const prefix = Buffer.from(
    `--${input.boundary}\r\n` +
    'Content-Disposition: form-data; name="meta"\r\n' +
    "Content-Type: application/json\r\n\r\n" +
    `${metaJson}\r\n` +
    `--${input.boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${input.filename}"\r\n` +
    `Content-Type: ${input.contentType}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${input.boundary}--\r\n`);
  return {
    body: Buffer.concat([prefix, Buffer.from(input.file), suffix]),
    contentType: `multipart/form-data; boundary=${input.boundary}`,
    metaJson,
  };
}

function buildContactInfo(
  input: Parameters<typeof buildWechatPayApplymentSubmitRequest>[0],
  encrypt: (value: string) => string,
): WechatPayApplymentSubmitRequest["contact_info"] {
  const base = {
    contact_type: input.source.contact_type,
    contact_name: encrypt(input.sensitive.contact_name),
    mobile_phone: encrypt(input.sensitive.contact_phone),
    contact_email: encrypt(input.sensitive.contact_email),
  } as const;
  if (input.source.contact_type === "LEGAL") return base;

  return {
    ...base,
    contact_id_doc_type: input.source.contact_identity_doc_type ?? undefined,
    contact_id_number: encrypt(input.sensitive.contact_identity_number ?? ""),
    contact_id_doc_copy: input.media.contact_id_card_front ?? undefined,
    contact_id_doc_copy_back: input.media.contact_id_card_back ?? undefined,
    contact_period_begin:
      input.source.contact_identity_period_begin ?? undefined,
    contact_period_end: input.source.contact_identity_period_end ?? undefined,
  };
}

function assertRequestSource(
  input: Parameters<typeof buildWechatPayApplymentSubmitRequest>[0],
): void {
  const missing: string[] = [];
  if (!/^[A-Za-z0-9_]{1,124}$/.test(input.businessCode)) {
    missing.push("business_code");
  }
  if (!input.serviceProviderAppId.trim()) missing.push("service_provider_appid");
  for (const [field, value] of [
    ["media.license_copy", input.media.license_copy],
    [
      "media.legal_representative_id_card_front",
      input.media.legal_representative_id_card_front,
    ],
    [
      "media.legal_representative_id_card_back",
      input.media.legal_representative_id_card_back,
    ],
  ] as const) {
    if (!value.trim()) missing.push(field);
  }
  if (
    input.source.subject_type === "SUBJECT_TYPE_ENTERPRISE" &&
    !input.sensitive.identity_address?.trim()
  ) {
    missing.push("sensitive.identity_address");
  }
  if (
    input.source.subject_type === "SUBJECT_TYPE_ENTERPRISE" &&
    input.source.settlement_account_type !== "BANK_ACCOUNT_TYPE_CORPORATE"
  ) {
    missing.push("source.settlement_account_type");
  }
  if (!input.source.settlement_id.trim()) {
    missing.push("source.settlement_id");
  }
  if (!input.source.qualification_type.trim()) {
    missing.push("source.qualification_type");
  }
  if (input.source.contact_type === "SUPER") {
    for (const [field, value] of [
      ["source.contact_identity_doc_type", input.source.contact_identity_doc_type],
      [
        "source.contact_identity_period_begin",
        input.source.contact_identity_period_begin,
      ],
      [
        "source.contact_identity_period_end",
        input.source.contact_identity_period_end,
      ],
      [
        "sensitive.contact_identity_number",
        input.sensitive.contact_identity_number,
      ],
      ["media.contact_id_card_front", input.media.contact_id_card_front],
      ["media.contact_id_card_back", input.media.contact_id_card_back],
    ] as const) {
      if (!value?.trim()) missing.push(field);
    }
  }
  if (missing.length > 0) throwInvalidSource(missing);
}

function assertMediaMultipartInput(input: {
  boundary: string;
  filename: string;
  sha256: string;
  file: Uint8Array;
}): void {
  const isBoundaryValid = /^[A-Za-z0-9-]{1,70}$/.test(input.boundary);
  const isFilenameValid = input.filename.length <= 128 &&
    /^[^"\r\n]+\.(?:jpe?g|png|bmp)$/i.test(input.filename);
  if (
    !isBoundaryValid ||
    !isFilenameValid ||
    !/^[a-f0-9]{64}$/i.test(input.sha256) ||
    input.file.byteLength === 0
  ) {
    throwInvalidSource(["media"]);
  }
}

function throwInvalidSource(missing: string[]): never {
  throw Errors.business(
    409,
    "微信支付进件请求资料不完整",
    "WECHAT_PAY_APPLYMENT_REQUEST_SOURCE_INVALID",
    { missing },
  );
}
