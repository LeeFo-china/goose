import { lstatSync, readFileSync } from "node:fs";

import { loadDouyinMiniappConfig } from "../../apps/api/src/services/douyin-miniapp/config";

export const DOUYIN_ENV_KEYS = [
  "DOUYIN_COMPONENT_APP_ID",
  "DOUYIN_COMPONENT_APP_SECRET",
  "DOUYIN_COMPONENT_MESSAGE_TOKEN",
  "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
  "DOUYIN_TEMPLATE_APP_ID",
  "DOUYIN_TEMPLATE_APP_SECRET",
  "DOUYIN_CREDENTIAL_KEYS_JSON",
  "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION",
  "DOUYIN_SUBJECT_HASH_KEY",
] as const;

export type DouyinEnvKey = (typeof DOUYIN_ENV_KEYS)[number];

type DouyinDevEnvErrorCode =
  | "DOUYIN_DEV_ENV_PAYLOAD_INVALID"
  | "DOUYIN_DEV_ENV_INPUT_INVALID"
  | "DOUYIN_DEV_ENV_CONFIG_INVALID"
  | "DOUYIN_DEV_ENV_FILE_INVALID"
  | "DOUYIN_DEV_ENV_USAGE_INVALID";

interface DouyinDevEnvMetadata {
  readonly environment: "development";
  readonly nineKeysValid: true;
  readonly componentAppIdTail: string | null;
  readonly componentAppIdShort: boolean;
  readonly templateAppIdTail: string | null;
  readonly templateAppIdShort: boolean;
  readonly activeKeyVersion: "v1";
}

interface AppIdMetadata {
  readonly tail: string | null;
  readonly isShort: boolean;
}

const PAYLOAD_INVALID = "DOUYIN_DEV_ENV_PAYLOAD_INVALID";
const INPUT_INVALID = "DOUYIN_DEV_ENV_INPUT_INVALID";
const CONFIG_INVALID = "DOUYIN_DEV_ENV_CONFIG_INVALID";
const FILE_INVALID = "DOUYIN_DEV_ENV_FILE_INVALID";
const USAGE_INVALID = "DOUYIN_DEV_ENV_USAGE_INVALID";
const LF_BYTE = 0x0a;
const CR_BYTE = 0x0d;
const NUL_BYTE = 0x00;
const UTF8_BOM_BYTES = [0xef, 0xbb, 0xbf] as const;
const REQUIRED_FILE_MODE = 0o600;
const PERMISSION_MODE_MASK = 0o7777;
const APP_ID_REDACTED_TAIL_LENGTH = 6;
const APP_ID_MINIMUM_REDACTABLE_LENGTH = APP_ID_REDACTED_TAIL_LENGTH + 1;
const CONSOLE_VALUE_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const MESSAGE_TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const SUBJECT_HASH_KEY_PATTERN = /^[a-f0-9]{64}$/;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const CONSOLE_KEYS = [
  "DOUYIN_COMPONENT_APP_ID",
  "DOUYIN_COMPONENT_APP_SECRET",
  "DOUYIN_TEMPLATE_APP_ID",
  "DOUYIN_TEMPLATE_APP_SECRET",
] as const satisfies readonly DouyinEnvKey[];

export class DouyinDevEnvError extends Error {
  readonly code: DouyinDevEnvErrorCode;

  constructor(code: DouyinDevEnvErrorCode) {
    super(code);
    this.code = code;
  }
}

export function validateDouyinDevEnvPayload(
  input: Uint8Array,
): DouyinDevEnvMetadata {
  const values = parsePayload(input);
  validateIsolatedInput(values);

  let config: ReturnType<typeof loadDouyinMiniappConfig>;
  try {
    config = loadDouyinMiniappConfig(values);
  } catch {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }

  const componentAppId = redactAppId(config.componentAppId);
  const templateAppId = redactAppId(config.templateAppId);

  return {
    environment: "development",
    nineKeysValid: true,
    componentAppIdTail: componentAppId.tail,
    componentAppIdShort: componentAppId.isShort,
    templateAppIdTail: templateAppId.tail,
    templateAppIdShort: templateAppId.isShort,
    activeKeyVersion: "v1",
  };
}

export function runDouyinDevEnvCli(args: readonly string[]): number {
  if (
    args.length !== 3 ||
    args[0] !== "validate" ||
    args[1] !== "--payload" ||
    !args[2]
  ) {
    writeStderrCode(USAGE_INVALID);
    return 1;
  }

  let input: Uint8Array;
  try {
    const fileStats = lstatSync(args[2]);
    if (
      fileStats.isSymbolicLink() ||
      !fileStats.isFile() ||
      (fileStats.mode & PERMISSION_MODE_MASK) !== REQUIRED_FILE_MODE
    ) {
      writeStderrCode(FILE_INVALID);
      return 2;
    }
    input = readFileSync(args[2]);
  } catch {
    writeStderrCode(FILE_INVALID);
    return 2;
  }

  try {
    const metadata = validateDouyinDevEnvPayload(input);
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof DouyinDevEnvError
      ? error.code
      : CONFIG_INVALID;
    writeStderrCode(code);
    return 1;
  }
}

function parsePayload(input: Uint8Array): Record<DouyinEnvKey, string> {
  if (
    input.length === 0 ||
    input.includes(NUL_BYTE) ||
    input.includes(CR_BYTE) ||
    startsWithUtf8Bom(input) ||
    input[input.length - 1] !== LF_BYTE
  ) {
    throw new DouyinDevEnvError(PAYLOAD_INVALID);
  }

  let payload: string;
  try {
    payload = textDecoder.decode(input);
  } catch {
    throw new DouyinDevEnvError(PAYLOAD_INVALID);
  }

  const records = payload.slice(0, -1).split("\n");
  if (records.length !== DOUYIN_ENV_KEYS.length) {
    throw new DouyinDevEnvError(PAYLOAD_INVALID);
  }

  const values: Record<DouyinEnvKey, string> = {
    DOUYIN_COMPONENT_APP_ID: "",
    DOUYIN_COMPONENT_APP_SECRET: "",
    DOUYIN_COMPONENT_MESSAGE_TOKEN: "",
    DOUYIN_COMPONENT_MESSAGE_AES_KEY: "",
    DOUYIN_TEMPLATE_APP_ID: "",
    DOUYIN_TEMPLATE_APP_SECRET: "",
    DOUYIN_CREDENTIAL_KEYS_JSON: "",
    DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION: "",
    DOUYIN_SUBJECT_HASH_KEY: "",
  };

  for (let index = 0; index < DOUYIN_ENV_KEYS.length; index += 1) {
    const expectedKey = DOUYIN_ENV_KEYS[index];
    const record = records[index];
    if (!expectedKey || record === undefined) {
      throw new DouyinDevEnvError(PAYLOAD_INVALID);
    }

    const separatorIndex = record.indexOf("=");
    const key = record.slice(0, separatorIndex);
    const value = record.slice(separatorIndex + 1);
    if (separatorIndex <= 0 || key !== expectedKey || value.length === 0) {
      throw new DouyinDevEnvError(PAYLOAD_INVALID);
    }

    values[expectedKey] = value;
  }

  return values;
}

function validateIsolatedInput(
  values: Readonly<Record<DouyinEnvKey, string>>,
): void {
  for (const key of CONSOLE_KEYS) {
    const value = values[key];
    if (value !== value.trim() || !CONSOLE_VALUE_PATTERN.test(value)) {
      throw new DouyinDevEnvError(INPUT_INVALID);
    }
  }

  const messageAesKey = values.DOUYIN_COMPONENT_MESSAGE_AES_KEY;
  if (messageAesKey !== messageAesKey.trim()) {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }
  if (!MESSAGE_TOKEN_PATTERN.test(values.DOUYIN_COMPONENT_MESSAGE_TOKEN)) {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }
  if (!SUBJECT_HASH_KEY_PATTERN.test(values.DOUYIN_SUBJECT_HASH_KEY)) {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }
  if (values.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION !== "v1") {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }

  validateCredentialKeysJson(values.DOUYIN_CREDENTIAL_KEYS_JSON);
}

function startsWithUtf8Bom(input: Uint8Array): boolean {
  return UTF8_BOM_BYTES.every((byte, index) => input[index] === byte);
}

function validateCredentialKeysJson(value: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }

  const keys = Object.keys(parsed);
  const descriptor = Object.getOwnPropertyDescriptor(parsed, "v1");
  const keyValue: unknown = descriptor?.value;
  if (
    keys.length !== 1 ||
    keys[0] !== "v1" ||
    typeof keyValue !== "string" ||
    JSON.stringify({ v1: keyValue }) !== value
  ) {
    throw new DouyinDevEnvError(CONFIG_INVALID);
  }
}

function redactAppId(appId: string): AppIdMetadata {
  if (appId.length < APP_ID_MINIMUM_REDACTABLE_LENGTH) {
    return { tail: null, isShort: true };
  }

  return {
    tail: appId.slice(-APP_ID_REDACTED_TAIL_LENGTH),
    isShort: false,
  };
}

function writeStderrCode(code: DouyinDevEnvErrorCode): void {
  process.stderr.write(`${code}\n`);
}

if (import.meta.main) {
  process.exit(runDouyinDevEnvCli(process.argv.slice(2)));
}
