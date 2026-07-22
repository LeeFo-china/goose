import { describe, expect, test } from 'bun:test';

import { ErrorCodes } from './error-codes';

describe('OCR error codes', () => {
  test('exports the stable OCR error contract', () => {
    expect([
      ErrorCodes.OCR_CONFIG_MISSING,
      ErrorCodes.OCR_DISABLED,
      ErrorCodes.OCR_CAPABILITY_UNAVAILABLE,
      ErrorCodes.OCR_FILE_NOT_FOUND,
      ErrorCodes.OCR_FILE_ACCESS_DENIED,
      ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED,
      ErrorCodes.OCR_FILE_TOO_LARGE,
      ErrorCodes.OCR_DAILY_LIMIT_EXCEEDED,
      ErrorCodes.OCR_RECOGNITION_NOT_FOUND,
      ErrorCodes.OCR_RECOGNITION_EXPIRED,
      ErrorCodes.OCR_RECOGNITION_IN_PROGRESS,
      ErrorCodes.OCR_PROVIDER_RATE_LIMITED,
      ErrorCodes.OCR_PROVIDER_FAILED,
      ErrorCodes.OCR_RESULT_INVALID,
    ]).toEqual([
      'OCR_CONFIG_MISSING',
      'OCR_DISABLED',
      'OCR_CAPABILITY_UNAVAILABLE',
      'OCR_FILE_NOT_FOUND',
      'OCR_FILE_ACCESS_DENIED',
      'OCR_FILE_FORMAT_UNSUPPORTED',
      'OCR_FILE_TOO_LARGE',
      'OCR_DAILY_LIMIT_EXCEEDED',
      'OCR_RECOGNITION_NOT_FOUND',
      'OCR_RECOGNITION_EXPIRED',
      'OCR_RECOGNITION_IN_PROGRESS',
      'OCR_PROVIDER_RATE_LIMITED',
      'OCR_PROVIDER_FAILED',
      'OCR_RESULT_INVALID',
    ]);
  });
});
