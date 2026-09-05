import { constants, privateDecrypt } from "node:crypto";
import { z } from "zod";
import { type AuthorizerRequestInput } from "./release-client";
import { invalidResponseError, safeLogId } from "./client-errors";

export const GET_PHONE_NUMBER_INFO_URL =
  "https://open.douyin.com/api/apps/v1/get_phonenumber_info/";

const PhoneNumberSchema = z.string().trim().regex(/^1[3-9][0-9]{9}$/);
const EncryptedPhoneDataSchema = z.string().trim().min(1).max(8192);
const GetPhoneNumberInfoSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: z.string().min(1),
  data: EncryptedPhoneDataSchema,
});
const DecryptedPhoneNumberSchema = z.looseObject({
  purePhoneNumber: PhoneNumberSchema,
  phoneNumber: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  watermark: z.looseObject({
    appid: z.string().min(1),
    timestamp: z.number().int().nonnegative().optional(),
  }),
});

export type GetPhoneNumberInfoInput = AuthorizerRequestInput & {
  readonly code: string;
  readonly privateKeyPem: string;
};

export type GetPhoneNumberInfoResult = {
  readonly phone: string;
};

export function parseGetPhoneNumberInfoResult(
  body: Record<string, unknown>,
  input: { readonly appId: string; readonly privateKeyPem: string },
): GetPhoneNumberInfoResult {
  const parsed = GetPhoneNumberInfoSuccessSchema.safeParse(body);
  const logId = safeLogId(body);
  if (!parsed.success) throw invalidResponseError(logId);

  let decryptedBlock: Buffer;
  try {
    decryptedBlock = privateDecrypt({
      key: input.privateKeyPem,
      padding: constants.RSA_NO_PADDING,
    }, Buffer.from(parsed.data.data, "base64"));
  } catch {
    throw invalidResponseError(logId);
  }

  const decrypted = readPkcs1V15Message(decryptedBlock, logId);
  let decoded: unknown;
  try {
    decoded = JSON.parse(decrypted.toString("utf8"));
  } catch {
    throw invalidResponseError(logId);
  }

  const phone = DecryptedPhoneNumberSchema.safeParse(decoded);
  if (!phone.success) throw invalidResponseError(logId);
  if (phone.data.watermark.appid !== input.appId) throw invalidResponseError(logId);
  return { phone: phone.data.purePhoneNumber };
}

function readPkcs1V15Message(block: Buffer, logId: string | undefined) {
  if (block.length < 11 || block[0] !== 0 || block[1] !== 2) {
    throw invalidResponseError(logId);
  }
  let delimiterIndex = -1;
  for (let index = 2; index < block.length; index += 1) {
    if (block[index] === 0) {
      delimiterIndex = index;
      break;
    }
  }
  if (delimiterIndex < 10 || delimiterIndex >= block.length - 1) {
    throw invalidResponseError(logId);
  }
  return block.subarray(delimiterIndex + 1);
}
