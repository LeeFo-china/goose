import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';

const UUIDSchema = z.uuid();
const SUBJECT_SCHEMA = z.string().trim().min(1).max(512);
const APPLICATION_SCHEMA = z.string().trim().min(1).max(128);
const MINIMUM_KEY_BYTES = 32;

export interface IdentityDigestConfig {
  readonly key: string;
  readonly keyVersion: number;
}

export interface RenderingIdentityDigest {
  readonly keyVersion: number;
  readonly digest: string;
}

export interface RenderingSubjectInput {
  readonly tenantId: string;
  readonly channel: 'wechat' | 'douyin';
  readonly subject: string;
  readonly applicationId: string | null;
  readonly installationId: string | null;
}

export class CustomerRenderingIdentityDigestService {
  constructor(private readonly config: IdentityDigestConfig) {
    if (
      Buffer.byteLength(config.key, 'utf8') < MINIMUM_KEY_BYTES
      || !Number.isInteger(config.keyVersion)
      || config.keyVersion <= 0
      || config.keyVersion > 32_767
    ) {
      throw identityKeyUnavailable();
    }
  }

  subject(input: RenderingSubjectInput): RenderingIdentityDigest {
    const tenantId = parseTenantId(input.tenantId);
    const subject = parseSubject(input.subject);
    const scope = parseScope(input);
    return this.digest(
      `customer-rendering/subject/v1/${tenantId}/${input.channel}/${scope.applicationId}/${scope.installationId}/${subject}`,
    );
  }

  phone(input: { readonly tenantId: string; readonly phone: string }): RenderingIdentityDigest {
    const tenantId = parseTenantId(input.tenantId);
    const normalizedPhone = normalizeMainlandPhone(input.phone);
    return this.digest(`customer-rendering/phone/v1/${tenantId}/${normalizedPhone}`);
  }

  private digest(message: string): RenderingIdentityDigest {
    return {
      keyVersion: this.config.keyVersion,
      digest: createHmac('sha256', this.config.key).update(message).digest('hex'),
    };
  }
}

export function getCustomerRenderingIdentityDigestService() {
  const key = process.env.CUSTOMER_RENDERING_IDENTITY_HMAC_KEY ?? '';
  const keyVersion = Number(
    process.env.CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION ?? '1',
  );
  return new CustomerRenderingIdentityDigestService({ key, keyVersion });
}

function parseTenantId(value: string) {
  const parsed = UUIDSchema.safeParse(value);
  if (!parsed.success) throw invalidIdentity();
  return parsed.data;
}

function parseSubject(value: string) {
  const parsed = SUBJECT_SCHEMA.safeParse(value);
  if (!parsed.success) throw invalidIdentity();
  return parsed.data;
}

function parseScope(input: RenderingSubjectInput) {
  if (input.channel === 'wechat') {
    if (input.applicationId !== null || input.installationId !== null) {
      throw invalidIdentity();
    }
    return { applicationId: '-', installationId: '-' };
  }

  const application = APPLICATION_SCHEMA.safeParse(input.applicationId);
  const installation = UUIDSchema.safeParse(input.installationId);
  if (!application.success || !installation.success) throw invalidIdentity();
  return { applicationId: application.data, installationId: installation.data };
}

function normalizeMainlandPhone(value: string) {
  const compact = value.trim().replace(/[\s()\-]/g, '');
  const national = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('0086')
      ? compact.slice(4)
      : compact;
  if (!/^1[3-9]\d{9}$/.test(national)) throw invalidIdentity();
  return `+86${national}`;
}

function identityKeyUnavailable() {
  return Errors.business(
    503,
    '客户生图身份服务暂不可用',
    ErrorCodes.RENDERING_IDENTITY_KEY_UNAVAILABLE,
  );
}

function invalidIdentity() {
  return Errors.unauthorized('客户生图会话身份无效');
}
