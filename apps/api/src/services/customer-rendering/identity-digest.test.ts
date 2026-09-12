import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { AppError } from '@/errors/app-error';
import { CustomerRenderingIdentityDigestService } from './identity-digest';

const key = 'customer-rendering-test-key-at-least-32-bytes';
const tenantId = '11111111-1111-4111-8111-111111111111';

describe('customer rendering identity digest', () => {
  test('domain-separates stable channel subjects by tenant and scope', () => {
    const service = new CustomerRenderingIdentityDigestService({ key, keyVersion: 3 });
    const wechat = service.subject({
      tenantId,
      channel: 'wechat',
      subject: 'wechat-openid',
      applicationId: null,
      installationId: null,
    });
    const same = service.subject({
      tenantId,
      channel: 'wechat',
      subject: 'wechat-openid',
      applicationId: null,
      installationId: null,
    });
    const douyin = service.subject({
      tenantId,
      channel: 'douyin',
      subject: 'wechat-openid',
      applicationId: 'tt-app',
      installationId: '22222222-2222-4222-8222-222222222222',
    });

    expect(wechat).toEqual(same);
    expect(wechat.keyVersion).toBe(3);
    expect(wechat.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(douyin.digest).not.toBe(wechat.digest);
    expect(service.subject({
      tenantId: '33333333-3333-4333-8333-333333333333',
      channel: 'wechat',
      subject: 'wechat-openid',
      applicationId: null,
      installationId: null,
    }).digest).not.toBe(wechat.digest);
  });

  test('normalizes a mainland verified phone before tenant-scoped hashing', () => {
    const service = new CustomerRenderingIdentityDigestService({ key, keyVersion: 1 });
    const expected = createHmac('sha256', key)
      .update(`customer-rendering/phone/v1/${tenantId}/+8613800138000`)
      .digest('hex');

    expect(service.phone({ tenantId, phone: '138 0013 8000' }).digest).toBe(expected);
    expect(service.phone({ tenantId, phone: '+86-13800138000' }).digest).toBe(expected);
    expect(service.phone({ tenantId, phone: '008613800138000' }).digest).toBe(expected);
    expect(service.phone({
      tenantId: '33333333-3333-4333-8333-333333333333',
      phone: '13800138000',
    }).digest).not.toBe(expected);
  });

  test('fails closed for weak configuration and malformed trusted values', () => {
    for (const options of [
      { key: '', keyVersion: 1 },
      { key: 'too-short', keyVersion: 1 },
      { key, keyVersion: 0 },
      { key, keyVersion: 1.5 },
    ]) {
      expect(() => new CustomerRenderingIdentityDigestService(options)).toThrow(AppError);
    }

    const service = new CustomerRenderingIdentityDigestService({ key, keyVersion: 1 });
    expect(() => service.phone({ tenantId, phone: '123456' })).toThrow(AppError);
    expect(() => service.subject({
      tenantId,
      channel: 'douyin',
      subject: 'subject',
      applicationId: null,
      installationId: null,
    })).toThrow(AppError);
  });

  test('production loader never falls back to JWT_SECRET', async () => {
    const previous = {
      key: process.env.CUSTOMER_RENDERING_IDENTITY_HMAC_KEY,
      version: process.env.CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION,
      jwt: process.env.JWT_SECRET,
    };
    delete process.env.CUSTOMER_RENDERING_IDENTITY_HMAC_KEY;
    delete process.env.CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION;
    process.env.JWT_SECRET = key;

    try {
      const { getCustomerRenderingIdentityDigestService } = await import('./identity-digest');
      expect(() => getCustomerRenderingIdentityDigestService()).toThrow(AppError);
    } finally {
      restore('CUSTOMER_RENDERING_IDENTITY_HMAC_KEY', previous.key);
      restore('CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION', previous.version);
      restore('JWT_SECRET', previous.jwt);
    }
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
