import { describe, expect, test } from 'bun:test';

import { decryptOcrResult, encryptOcrResult } from './crypto';

const context = {
  tenantId: 'tenant-1',
  recognitionId: 'recognition-1',
};

const result = {
  fields: [
    {
      key: 'identity_number',
      label: '身份证号',
      value: '410123199001011234',
      normalized: true,
      sensitive: true,
      confidence: null,
    },
    {
      key: 'identity_address',
      label: '证件地址',
      value: '示例路 100 号',
      normalized: true,
      sensitive: true,
      confidence: null,
    },
  ],
  warnings: [],
  quality: { score: 92 },
};

const rootSecret = 'ocr-result-root-secret-for-tests';

describe('OCR result crypto', () => {
  test('round-trips normalized results with domain-separated context', () => {
    const ciphertext = encryptOcrResult({ context, result, rootSecret });

    expect(ciphertext.startsWith('ocr:v1:')).toBe(true);
    expect(decryptOcrResult({ context, ciphertext, rootSecret })).toEqual(result);
  });

  test('does not include identity number or address plaintext', () => {
    const ciphertext = encryptOcrResult({ context, result, rootSecret });

    expect(ciphertext).not.toContain('410123199001011234');
    expect(ciphertext).not.toContain('示例路 100 号');
  });

  test.each([
    [{ ...context, tenantId: 'tenant-2' }, 'tenant'],
    [{ ...context, recognitionId: 'recognition-2' }, 'recognition'],
  ])('rejects a changed %s context', (changedContext) => {
    const ciphertext = encryptOcrResult({ context, result, rootSecret });

    expect(() => decryptOcrResult({
      context: changedContext,
      ciphertext,
      rootSecret,
    })).toThrow(expect.objectContaining({ code: 'OCR_RESULT_INVALID' }));
  });

  test('returns a stable business error when the root key is missing', () => {
    expect(() => encryptOcrResult({
      context,
      result,
      rootSecret: null,
    })).toThrow(expect.objectContaining({
      statusCode: 503,
      code: 'OCR_RESULT_ENCRYPTION_KEY_MISSING',
    }));
  });
});
