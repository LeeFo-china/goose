import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type { DouyinCredentialKeyring } from "./credential-envelope";

const AES_KEY_BYTES = 32;
const MAX_ID_LENGTH = 128;
const MAX_SECRET_LENGTH = 512;
const MAX_KEY_VERSION_LENGTH = 64;
const MAX_CREDENTIAL_KEY_VERSIONS = 16;
const MAX_CREDENTIAL_KEYS_JSON_BYTES = 16 * 1024;
const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ENCODING_AES_KEY_PATTERN = /^[A-Za-z0-9+/]{43}$/;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const BoundedIdSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);
const BoundedSecretSchema = z.string().trim().min(1).max(MAX_SECRET_LENGTH);
const SubjectHashKeySchema = z.string().trim().min(32).max(MAX_SECRET_LENGTH);
const KeyVersionSchema = z.string()
  .min(1)
  .max(MAX_KEY_VERSION_LENGTH)
  .regex(KEY_VERSION_PATTERN);

const CredentialKeySchema = z.string().superRefine((value, context) => {
  if (!isCanonicalBase64Key(value)) {
    context.addIssue({
      code: "custom",
      message: "凭证密钥必须是 32 字节的标准 base64",
    });
  }
}).transform((value) => Buffer.from(value, "base64"));

const CredentialKeysJsonSchema = z.string().transform((value, context) => {
  if (Buffer.byteLength(value, "utf8") > MAX_CREDENTIAL_KEYS_JSON_BYTES) {
    context.addIssue({ code: "custom", message: "凭证密钥配置超过长度限制" });
    return z.NEVER;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    context.addIssue({ code: "custom", message: "凭证密钥配置必须是 JSON object" });
    return z.NEVER;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    context.addIssue({ code: "custom", message: "凭证密钥配置必须是 JSON object" });
    return z.NEVER;
  }

  const keyCount = Object.keys(parsed).length;
  if (keyCount < 1 || keyCount > MAX_CREDENTIAL_KEY_VERSIONS) {
    context.addIssue({ code: "custom", message: "凭证密钥版本数量无效" });
    return z.NEVER;
  }

  const result = z.record(KeyVersionSchema, CredentialKeySchema).safeParse(parsed);
  if (!result.success) {
    context.addIssue({ code: "custom", message: "凭证密钥配置格式无效" });
    return z.NEVER;
  }
  return result.data;
});

const MessageAesKeySchema = z.string().trim().superRefine((value, context) => {
  const decoded = Buffer.from(`${value}=`, "base64");
  if (
    !ENCODING_AES_KEY_PATTERN.test(value) ||
    decoded.length !== AES_KEY_BYTES ||
    decoded.toString("base64") !== `${value}=`
  ) {
    context.addIssue({ code: "custom", message: "消息加密密钥格式无效" });
  }
});

const DouyinMiniappEnvironmentSchema = z.strictObject({
  DOUYIN_COMPONENT_APP_ID: BoundedIdSchema,
  DOUYIN_COMPONENT_APP_SECRET: BoundedSecretSchema,
  DOUYIN_COMPONENT_MESSAGE_TOKEN: BoundedSecretSchema,
  DOUYIN_COMPONENT_MESSAGE_AES_KEY: MessageAesKeySchema,
  DOUYIN_TEMPLATE_APP_ID: BoundedIdSchema,
  DOUYIN_TEMPLATE_APP_SECRET: BoundedSecretSchema,
  DOUYIN_CREDENTIAL_KEYS_JSON: CredentialKeysJsonSchema,
  DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION: KeyVersionSchema,
  DOUYIN_SUBJECT_HASH_KEY: SubjectHashKeySchema,
}).superRefine((value, context) => {
  if (!Object.hasOwn(
    value.DOUYIN_CREDENTIAL_KEYS_JSON,
    value.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION,
  )) {
    context.addIssue({
      code: "custom",
      path: ["DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"],
      message: "活动凭证密钥版本不存在",
    });
  }
});

export type DouyinMiniappConfig = {
  readonly componentAppId: string;
  readonly componentAppSecret: string;
  readonly componentMessageToken: string;
  readonly componentMessageAesKey: string;
  readonly templateAppId: string;
  readonly templateAppSecret: string;
  readonly credentialKeyring: DouyinCredentialKeyring;
  readonly subjectHashKey: string;
};

export function loadDouyinMiniappConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DouyinMiniappConfig {
  const result = DouyinMiniappEnvironmentSchema.safeParse({
    DOUYIN_COMPONENT_APP_ID: env.DOUYIN_COMPONENT_APP_ID,
    DOUYIN_COMPONENT_APP_SECRET: env.DOUYIN_COMPONENT_APP_SECRET,
    DOUYIN_COMPONENT_MESSAGE_TOKEN: env.DOUYIN_COMPONENT_MESSAGE_TOKEN,
    DOUYIN_COMPONENT_MESSAGE_AES_KEY: env.DOUYIN_COMPONENT_MESSAGE_AES_KEY,
    DOUYIN_TEMPLATE_APP_ID: env.DOUYIN_TEMPLATE_APP_ID,
    DOUYIN_TEMPLATE_APP_SECRET: env.DOUYIN_TEMPLATE_APP_SECRET,
    DOUYIN_CREDENTIAL_KEYS_JSON: env.DOUYIN_CREDENTIAL_KEYS_JSON,
    DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION: env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION,
    DOUYIN_SUBJECT_HASH_KEY: env.DOUYIN_SUBJECT_HASH_KEY,
  });

  if (!result.success) {
    const fields = Array.from(new Set(
      result.error.issues
        .map((issue) => issue.path[0])
        .filter((field): field is string | number => field !== undefined)
        .map(String),
    ));
    throw Errors.business(
      503,
      "抖音小程序服务配置无效",
      "DOUYIN_CONFIG_INVALID",
      { fields },
    );
  }

  return {
    componentAppId: result.data.DOUYIN_COMPONENT_APP_ID,
    componentAppSecret: result.data.DOUYIN_COMPONENT_APP_SECRET,
    componentMessageToken: result.data.DOUYIN_COMPONENT_MESSAGE_TOKEN,
    componentMessageAesKey: result.data.DOUYIN_COMPONENT_MESSAGE_AES_KEY,
    templateAppId: result.data.DOUYIN_TEMPLATE_APP_ID,
    templateAppSecret: result.data.DOUYIN_TEMPLATE_APP_SECRET,
    credentialKeyring: {
      activeKeyVersion: result.data.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION,
      keys: result.data.DOUYIN_CREDENTIAL_KEYS_JSON,
    },
    subjectHashKey: result.data.DOUYIN_SUBJECT_HASH_KEY,
  };
}

function isCanonicalBase64Key(value: string): boolean {
  if (!STANDARD_BASE64_PATTERN.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, "base64");
  return decoded.length === AES_KEY_BYTES && decoded.toString("base64") === value;
}
