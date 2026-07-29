import { describe, expect, test } from 'bun:test';

import {
  OCR_DOCUMENT_TYPE_VALUES,
  OCR_RECOGNITION_STATUS_VALUES,
  OCR_SCENE_VALUES,
  OCR_SENSITIVE_FIELD_KEYS,
  OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES,
} from './ocr';

describe('OCR domain contracts', () => {
  test('keeps scene, document type, and status values stable', () => {
    expect(OCR_SCENE_VALUES).toEqual([
      'wechat_pay_applyment',
      'expense_request',
      'merchant_material',
      'supplier_onboarding',
      'tenant_onboarding_license',
    ]);
    expect(OCR_DOCUMENT_TYPE_VALUES).toEqual([
      'business_license',
      'id_card_front',
      'id_card_back',
      'bank_card',
      'general_invoice',
      'vat_invoice_verify',
      'store_name',
      'store_classification',
      'document_classification',
    ]);
    expect(OCR_RECOGNITION_STATUS_VALUES).toEqual([
      'pending',
      'processing',
      'succeeded',
      'failed',
      'expired',
    ]);
  });

  test('exposes supplier onboarding as a platform OCR scene', () => {
    expect(OCR_SCENE_VALUES).toContain('supplier_onboarding');
  });

  test('exposes tenant onboarding as a visitor OCR scene', () => {
    expect(OCR_SCENE_VALUES).toContain('tenant_onboarding_license');
  });

  test('marks identity, address, and settlement account fields sensitive', () => {
    expect(OCR_SENSITIVE_FIELD_KEYS).toEqual(
      expect.arrayContaining([
        'identity_number',
        'identity_address',
        'contact_identity_number',
        'contact_identity_address',
        'settlement_account_number',
      ]),
    );
  });

  test('limits tenant rollout policies to phase 1 document types', () => {
    expect(OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES).toEqual([
      'business_license',
      'id_card_front',
      'id_card_back',
      'bank_card',
    ]);
  });
});
