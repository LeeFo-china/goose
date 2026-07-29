import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

import type { OcrFieldSuggestion, OcrWarning } from '@gooes/domain';
import { z } from 'zod';

import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';

const CIPHERTEXT_PREFIX = 'ocr:v1';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_SALT = Buffer.from('gooes:ocr-result:v1', 'utf8');
const KEY_PURPOSE = Buffer.from('normalized-result', 'utf8');

const OcrFieldSuggestionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  normalized: z.boolean(),
  sensitive: z.boolean(),
  confidence: z.number().nullable(),
}).strict();

const OcrWarningSchema = z.object({
  code: z.string().min(1),
  level: z.enum(['info', 'warning', 'error']),
  message: z.string().min(1),
}).strict();

const OcrNormalizedResultSchema = z.object({
  fields: z.array(OcrFieldSuggestionSchema),
  warnings: z.array(OcrWarningSchema),
  quality: z.record(z.string(), z.unknown()),
}).strict();

export type OcrResultCryptoContext = {
  tenantId: string;
  recognitionId: string;
} | {
  scopeType: 'platform';
  recognitionId: string;
} | {
  scopeType: 'visitor';
  actorVisitorId: string;
  recognitionId: string;
};

export type OcrNormalizedResult = {
  fields: OcrFieldSuggestion[];
  warnings: OcrWarning[];
  quality: Record<string, unknown>;
};

export function hasOcrResultEncryptionKey(
  rootSecret: string | null | undefined,
): rootSecret is string {
  return Boolean(rootSecret?.trim());
}

export function assertOcrResultEncryptionKey(
  rootSecret: string | null | undefined,
): asserts rootSecret is string {
  if (!hasOcrResultEncryptionKey(rootSecret)) {
    throw Errors.business(
      503,
      '缺少OCR识别结果加密密钥',
      ErrorCodes.OCR_RESULT_ENCRYPTION_KEY_MISSING,
    );
  }
}

export function encryptOcrResult(input: {
  context: OcrResultCryptoContext;
  result: OcrNormalizedResult;
  rootSecret: string | null | undefined;
}): string {
  const result = parseResult(input.result);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(input.rootSecret), iv);
  cipher.setAAD(buildAad(input.context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(result), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    CIPHERTEXT_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptOcrResult(input: {
  context: OcrResultCryptoContext;
  ciphertext: string;
  rootSecret: string | null | undefined;
}): OcrNormalizedResult {
  const key = deriveKey(input.rootSecret);
  const aad = buildAad(input.context);
  const parts = input.ciphertext.split(':');
  const [namespace, version, ivText, authTagText, encryptedText] = parts;
  if (
    parts.length !== 5 ||
    namespace !== 'ocr' ||
    version !== 'v1' ||
    !ivText ||
    !authTagText ||
    !encryptedText
  ) {
    throw invalidResultError();
  }

  try {
    const iv = Buffer.from(ivText, 'base64url');
    const authTag = Buffer.from(authTagText, 'base64url');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw invalidResultError();
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return parseResult(JSON.parse(plaintext));
  } catch (error) {
    if (isInvalidResultError(error)) throw error;
    throw invalidResultError();
  }
}

function deriveKey(rootSecret: string | null | undefined): Buffer {
  assertOcrResultEncryptionKey(rootSecret);
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(rootSecret, 'utf8'),
      KEY_SALT,
      KEY_PURPOSE,
      KEY_LENGTH,
    ),
  );
}

function buildAad(context: OcrResultCryptoContext): Buffer {
  if (!context.recognitionId.trim()) {
    throw invalidResultError();
  }
  if ('scopeType' in context) {
    if (context.scopeType === 'visitor') {
      if (!context.actorVisitorId.trim()) throw invalidResultError();
      return Buffer.from(
        `ocr:visitor:${context.actorVisitorId}:${context.recognitionId}:v1`,
        'utf8',
      );
    }
    return Buffer.from(`ocr:platform:${context.recognitionId}:v1`, 'utf8');
  }
  if (!context.tenantId.trim()) throw invalidResultError();
  return Buffer.from(
    `ocr:${context.tenantId}:${context.recognitionId}:v1`,
    'utf8',
  );
}

function parseResult(value: unknown): OcrNormalizedResult {
  const parsed = OcrNormalizedResultSchema.safeParse(value);
  if (!parsed.success) throw invalidResultError();
  return parsed.data;
}

function invalidResultError() {
  return Errors.business(
    500,
    'OCR识别结果密文无效',
    ErrorCodes.OCR_RESULT_INVALID,
  );
}

function isInvalidResultError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === ErrorCodes.OCR_RESULT_INVALID,
  );
}
