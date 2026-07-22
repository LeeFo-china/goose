import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const policyPath = resolve(
  import.meta.dir,
  '../deploy/tencent-ocr-phase1-cam-policy.json',
);

const EXPECTED_ACTIONS = [
  'name/ocr:BankCardOCR',
  'name/ocr:BizLicenseOCR',
  'name/ocr:RecognizeEncryptedIDCardOCR',
];

describe('Tencent OCR Phase 1 CAM policy', () => {
  test('allows only the three Phase 1 OCR actions', () => {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as {
      version: string;
      statement: Array<{
        effect: string;
        action: string[];
        resource: string[];
      }>;
    };

    expect(policy.version).toBe('2.0');
    expect(policy.statement).toHaveLength(1);
    expect(policy.statement[0]).toEqual({
      effect: 'allow',
      action: EXPECTED_ACTIONS,
      resource: ['*'],
    });
  });

  test('contains no wildcard action or unrelated OCR permission', () => {
    const source = readFileSync(policyPath, 'utf8');
    const policy = JSON.parse(source) as {
      statement: Array<{ action: string[] }>;
    };
    const actions = policy.statement.flatMap((statement) => statement.action);

    expect(source).not.toContain('"ocr:*"');
    expect(source).not.toContain('"name/ocr:*"');
    expect(actions).not.toContain('name/ocr:GeneralBasicOCR');
    expect(actions).not.toContain('name/ocr:IDCardOCR');
  });
});
