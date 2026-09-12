import { describe, expect, mock, test } from 'bun:test';
import { AppError } from '@/errors/app-error';
import { CustomerRenderingContextService } from './context';

const tenantId = '11111111-1111-4111-8111-111111111111';
const installationId = '22222222-2222-4222-8222-222222222222';
const defaultInstallation = {
  id: installationId,
  tenant_id: tenantId,
  authorizer_appid: 'tt-app',
  authorization_status: 'active' as const,
  installation_kind: 'merchant' as const,
  template_version: '1.0.0',
  deployment_key: null,
  runtime_config: {
    brand: { logo_url: null, qualifications: [] },
    theme: { primary_color: '#1677FF', navigation_text_color: 'white' },
    features: {
      cases: true, sites: true, sms_lead: true,
      douyin_phone: false, phone_capture_mode: 'sms',
    },
    home_banners: [], trust_metrics: [], privacy_policy_version: 'v1',
    contact_sla_text: '提交后一个工作日内联系',
  },
  tenant: { id: tenantId, status: 'active' as const },
};

function service(overrides: {
  selectedTenantId?: string | null;
  tenantStatus?: 'active' | null;
  installation?: typeof defaultInstallation | null;
} = {}) {
  const contextRepository = {
    findLatestSelectedVisitorTenant: mock(async () =>
      overrides.selectedTenantId === undefined ? tenantId : overrides.selectedTenantId),
    findActiveTenant: mock(async (id: string) =>
      overrides.tenantStatus === null ? null : { id, status: overrides.tenantStatus ?? 'active' }),
  };
  const installationRepository = {
    findActiveInstallation: mock(async () =>
      overrides.installation === undefined ? defaultInstallation : overrides.installation),
  };
  return {
    resolver: new CustomerRenderingContextService({ contextRepository, installationRepository }),
    contextRepository,
    installationRepository,
  };
}

describe('customer rendering trusted context', () => {
  test('uses visitor openid and a current server-selected tenant', async () => {
    const { resolver, contextRepository } = service();
    const actor = await resolver.resolveWechat({
      token_type: 'visitor_session', login_channel: 'wechat',
      openid: 'wx-openid', visitor_id: 'visitor-1', roles: ['visitor'],
      verified_phone: '13800138000',
    });

    expect(actor).toEqual({
      tenantId, channel: 'wechat', subject: 'wx-openid',
      applicationId: null, installationId: null, verifiedPhone: '13800138000',
    });
    expect(contextRepository.findLatestSelectedVisitorTenant)
      .toHaveBeenCalledWith('visitor-1', expect.any(String));
  });

  test('accepts a tenant-bound WeChat customer session without CRM coupling', async () => {
    const { resolver } = service();
    await expect(resolver.resolveWechat({
      token_type: 'auth', login_channel: 'wechat', openid: 'wx-openid',
      tenant_id: tenantId, roles: ['customer'], verified_phone: '13800138000',
    })).resolves.toMatchObject({ tenantId, channel: 'wechat', subject: 'wx-openid' });
  });

  test('rejects absent visitor selection, body authority, and suspended tenants', async () => {
    await expect(service({ selectedTenantId: null }).resolver.resolveWechat({
      token_type: 'visitor_session', openid: 'wx-openid', visitor_id: 'visitor-1',
    })).rejects.toMatchObject({ code: 'RENDERING_TENANT_CONTEXT_REQUIRED' });
    await expect(service({ tenantStatus: null }).resolver.resolveWechat({
      token_type: 'auth', login_channel: 'wechat', openid: 'wx-openid', tenant_id: tenantId,
    })).rejects.toBeInstanceOf(AppError);
  });

  test('validates the Douyin installation for miniapp and upgraded customer sessions', async () => {
    const { resolver, installationRepository } = service();
    const miniActor = await resolver.resolveDouyin({
      token_type: 'douyin_miniapp', login_channel: 'douyin', sub: 'a'.repeat(64),
      tenant_id: tenantId, douyin_installation_id: installationId,
      douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64),
    });
    const customerActor = await resolver.resolveDouyin({
      token_type: 'auth', login_channel: 'douyin', sub: 'auth-user',
      tenant_id: tenantId, douyin_installation_id: installationId,
      douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64), verified_phone: '13800138000',
    });

    expect(miniActor).toMatchObject({ tenantId, channel: 'douyin', subject: 'a'.repeat(64) });
    expect(customerActor).toMatchObject({ verifiedPhone: '13800138000' });
    expect(installationRepository.findActiveInstallation).toHaveBeenCalledTimes(2);
  });

  test('rejects forged or disabled Douyin context', async () => {
    await expect(service().resolver.resolveDouyin({
      token_type: 'douyin_miniapp', login_channel: 'douyin', sub: 'different',
      tenant_id: tenantId, douyin_installation_id: installationId,
      douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64),
    })).rejects.toBeInstanceOf(AppError);
    await expect(service({ installation: null }).resolver.resolveDouyin({
      token_type: 'douyin_miniapp', login_channel: 'douyin', sub: 'a'.repeat(64),
      tenant_id: tenantId, douyin_installation_id: installationId,
      douyin_app_id: 'tt-app', subject_hash: 'a'.repeat(64),
    })).rejects.toBeInstanceOf(AppError);
  });
});
