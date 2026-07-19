import {
  createDecipheriv,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { TextDecoder } from "node:util";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";

const AES_KEY_BYTES = 32;
const AES_BLOCK_BYTES = 16;
const CALLBACK_PADDING_BLOCK_BYTES = 32;
const RANDOM_PREFIX_BYTES = 16;
const MESSAGE_LENGTH_BYTES = 4;
const MESSAGE_OFFSET = RANDOM_PREFIX_BYTES + MESSAGE_LENGTH_BYTES;
const ENCODING_AES_KEY_PATTERN = /^[A-Za-z0-9+/]{43}$/;
const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export type VerifyDouyinCallbackSignatureInput = {
  readonly token: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly encrypted: string;
  readonly signature: string;
};

export type DecryptDouyinCallbackInput = {
  readonly encrypted: string;
  readonly encodingAesKey: string;
  readonly expectedComponentAppId: string;
};

export function verifyDouyinCallbackSignature(
  input: VerifyDouyinCallbackSignatureInput,
): boolean {
  const expected = createHash("sha1")
    .update([
      input.token,
      input.timestamp,
      input.nonce,
      input.encrypted,
    ].sort().join(""))
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(input.signature, "utf8");

  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
}

export function decryptDouyinCallback(
  input: DecryptDouyinCallbackInput,
): Record<string, unknown> {
  const key = decodeMessageAesKey(input.encodingAesKey);
  const ciphertext = decodeCiphertext(input.encrypted);
  const iv = ciphertext.subarray(0, AES_BLOCK_BYTES);
  const encryptedPayload = ciphertext.subarray(AES_BLOCK_BYTES);

  let paddedPlaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(false);
    paddedPlaintext = Buffer.concat([
      decipher.update(encryptedPayload),
      decipher.final(),
    ]);
  } catch {
    throw callbackError(
      400,
      "抖音回调密文格式无效",
      "DOUYIN_CALLBACK_CIPHERTEXT_INVALID",
    );
  }

  const plaintext = removeStrictCallbackPadding(paddedPlaintext);
  if (plaintext.length < MESSAGE_OFFSET) {
    throw callbackError(
      400,
      "抖音回调消息长度无效",
      "DOUYIN_CALLBACK_LENGTH_INVALID",
    );
  }

  const messageLength = plaintext.readUInt32BE(RANDOM_PREFIX_BYTES);
  const availableMessageBytes = plaintext.length - MESSAGE_OFFSET;
  if (messageLength > availableMessageBytes) {
    throw callbackError(
      400,
      "抖音回调消息长度无效",
      "DOUYIN_CALLBACK_LENGTH_INVALID",
    );
  }

  const messageEnd = MESSAGE_OFFSET + messageLength;
  const messageBytes = plaintext.subarray(MESSAGE_OFFSET, messageEnd);
  const componentAppIdBytes = plaintext.subarray(messageEnd);
  if (componentAppIdBytes.length === 0) {
    throw callbackError(
      400,
      "抖音回调组件 AppID 无效",
      "DOUYIN_CALLBACK_COMPONENT_APP_ID_INVALID",
    );
  }

  assertExpectedComponentAppId(
    componentAppIdBytes,
    input.expectedComponentAppId,
  );
  return parseCallbackMessage(messageBytes);
}

function decodeMessageAesKey(value: string): Buffer {
  if (!ENCODING_AES_KEY_PATTERN.test(value)) {
    throw callbackError(
      503,
      "抖音回调消息密钥无效",
      "DOUYIN_CALLBACK_AES_KEY_INVALID",
    );
  }

  const key = Buffer.from(`${value}=`, "base64");
  if (
    key.length !== AES_KEY_BYTES ||
    key.toString("base64") !== `${value}=`
  ) {
    throw callbackError(
      503,
      "抖音回调消息密钥无效",
      "DOUYIN_CALLBACK_AES_KEY_INVALID",
    );
  }
  return key;
}

function decodeCiphertext(value: string): Buffer {
  if (!STANDARD_BASE64_PATTERN.test(value)) {
    throw callbackError(
      400,
      "抖音回调密文格式无效",
      "DOUYIN_CALLBACK_CIPHERTEXT_INVALID",
    );
  }

  const ciphertext = Buffer.from(value, "base64");
  const encryptedPayloadBytes = ciphertext.length - AES_BLOCK_BYTES;
  if (
    ciphertext.toString("base64") !== value ||
    encryptedPayloadBytes < AES_BLOCK_BYTES ||
    encryptedPayloadBytes % AES_BLOCK_BYTES !== 0
  ) {
    throw callbackError(
      400,
      "抖音回调密文格式无效",
      "DOUYIN_CALLBACK_CIPHERTEXT_INVALID",
    );
  }
  return ciphertext;
}

function removeStrictCallbackPadding(padded: Buffer): Buffer {
  const paddingLength = padded[padded.length - 1] ?? 0;
  if (
    padded.length % CALLBACK_PADDING_BLOCK_BYTES !== 0 ||
    paddingLength < 1 ||
    paddingLength > CALLBACK_PADDING_BLOCK_BYTES ||
    paddingLength > padded.length
  ) {
    throw invalidPaddingError();
  }

  const padding = padded.subarray(padded.length - paddingLength);
  if (!padding.every((byte) => byte === paddingLength)) {
    throw invalidPaddingError();
  }
  return padded.subarray(0, padded.length - paddingLength);
}

function assertExpectedComponentAppId(
  receivedBytes: Buffer,
  expectedValue: string,
): void {
  try {
    UTF8_DECODER.decode(receivedBytes);
  } catch {
    throw callbackError(
      400,
      "抖音回调组件 AppID 无效",
      "DOUYIN_CALLBACK_COMPONENT_APP_ID_INVALID",
    );
  }

  const expectedBytes = Buffer.from(expectedValue, "utf8");
  if (
    receivedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(receivedBytes, expectedBytes)
  ) {
    throw callbackError(
      403,
      "抖音回调组件 AppID 不匹配",
      "DOUYIN_CALLBACK_COMPONENT_APP_ID_MISMATCH",
    );
  }
}

function parseCallbackMessage(messageBytes: Buffer): Record<string, unknown> {
  try {
    const messageText = UTF8_DECODER.decode(messageBytes);
    const message: unknown = JSON.parse(messageText);
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw callbackMessageError();
    }
    return message as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw callbackMessageError();
  }
}

function invalidPaddingError(): AppError {
  return callbackError(
    400,
    "抖音回调填充格式无效",
    "DOUYIN_CALLBACK_PADDING_INVALID",
  );
}

function callbackMessageError(): AppError {
  return callbackError(
    400,
    "抖音回调消息格式无效",
    "DOUYIN_CALLBACK_MESSAGE_INVALID",
  );
}

function callbackError(statusCode: number, message: string, code: string): AppError {
  return Errors.business(statusCode, message, code);
}
