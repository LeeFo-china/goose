import { DouyinRuntimeConfigSchema } from '@/schema/platform-douyin-miniapps';
import { ErrorCodes } from '@/errors/error-codes';
import { Errors } from '@/errors/error-factory';
import {
  customerRenderingContextRepository,
  type CustomerRenderingContextRepository,
} from '@/repositories/customer-rendering-context';
import {
  douyinMiniappContentRepository,
  type DouyinMiniappContentRepository,
} from '@/repositories/douyin-miniapp-content';
import type { JwtPayload } from '@/utils/jwt';

type ContextRepository = Pick<CustomerRenderingContextRepository,
  'findLatestSelectedVisitorTenant' | 'findActiveTenant'>;
type InstallationRepository = Pick<DouyinMiniappContentRepository,
  'findActiveInstallation'>;

export interface CustomerRenderingActor {
  readonly tenantId: string;
  readonly channel: 'wechat' | 'douyin';
  readonly subject: string;
  readonly applicationId: string | null;
  readonly installationId: string | null;
  readonly verifiedPhone: string | null;
}

export class CustomerRenderingContextService {
  private readonly contextRepository: ContextRepository;
  private readonly installationRepository: InstallationRepository;

  constructor(dependencies: {
    readonly contextRepository?: ContextRepository;
    readonly installationRepository?: InstallationRepository;
  } = {}) {
    this.contextRepository = dependencies.contextRepository
      ?? customerRenderingContextRepository;
    this.installationRepository = dependencies.installationRepository
      ?? douyinMiniappContentRepository;
  }

  async resolveWechat(user?: JwtPayload): Promise<CustomerRenderingActor> {
    const identity = parseWechatIdentity(user);
    const tenantId = identity.tenantId ?? await this.contextRepository
      .findLatestSelectedVisitorTenant(identity.visitorId, new Date().toISOString());
    if (!tenantId) throw tenantContextRequired();
    if (!await this.contextRepository.findActiveTenant(tenantId)) {
      throw Errors.business(403, '装修公司服务已暂停', ErrorCodes.TENANT_NOT_AVAILABLE);
    }
    return {
      tenantId,
      channel: 'wechat',
      subject: identity.openid,
      applicationId: null,
      installationId: null,
      verifiedPhone: trustedPhone(user),
    };
  }

  async resolveDouyin(user?: JwtPayload): Promise<CustomerRenderingActor> {
    const identity = parseDouyinIdentity(user);
    const installation = await this.installationRepository.findActiveInstallation({
      tenantId: identity.tenantId,
      installationId: identity.installationId,
      appId: identity.appId,
    });
    if (
      !installation
      || installation.id !== identity.installationId
      || installation.tenant_id !== identity.tenantId
      || installation.authorizer_appid !== identity.appId
      || installation.authorization_status !== 'active'
      || installation.tenant.id !== identity.tenantId
      || !DouyinRuntimeConfigSchema.safeParse(installation.runtime_config).success
    ) {
      throw Errors.business(409, '抖音小程序服务已暂停', 'DOUYIN_INSTALLATION_DISABLED');
    }
    if (installation.tenant.status !== 'active') {
      throw Errors.business(403, '装修公司服务已暂停', ErrorCodes.TENANT_NOT_AVAILABLE);
    }
    return {
      tenantId: identity.tenantId,
      channel: 'douyin',
      subject: identity.subject,
      applicationId: identity.appId,
      installationId: identity.installationId,
      verifiedPhone: trustedPhone(user),
    };
  }
}

function parseWechatIdentity(user?: JwtPayload) {
  if (user?.token_type === 'visitor_session'
    && typeof user.openid === 'string' && user.openid.length > 0
    && typeof user.visitor_id === 'string' && user.visitor_id.length > 0) {
    return { openid: user.openid, visitorId: user.visitor_id, tenantId: null };
  }
  if (user?.token_type === 'auth' && user.login_channel === 'wechat'
    && typeof user.openid === 'string' && user.openid.length > 0
    && typeof user.tenant_id === 'string' && user.tenant_id.length > 0) {
    return { openid: user.openid, visitorId: '', tenantId: user.tenant_id };
  }
  throw Errors.unauthorized('请使用微信客户会话');
}

function parseDouyinIdentity(user?: JwtPayload) {
  const isMiniapp = user?.token_type === 'douyin_miniapp';
  const isCustomer = user?.token_type === 'auth' && user.login_channel === 'douyin';
  const subject = user?.subject_hash;
  if ((!isMiniapp && !isCustomer)
    || typeof user?.tenant_id !== 'string' || user.tenant_id.length === 0
    || typeof user.douyin_installation_id !== 'string'
    || user.douyin_installation_id.length === 0
    || typeof user.douyin_app_id !== 'string' || user.douyin_app_id.length === 0
    || typeof subject !== 'string' || !/^[0-9a-f]{64}$/.test(subject)
    || (isMiniapp && user.sub !== subject)) {
    throw Errors.unauthorized('请使用抖音小程序会话');
  }
  return {
    tenantId: user.tenant_id,
    installationId: user.douyin_installation_id,
    appId: user.douyin_app_id,
    subject,
  };
}

function trustedPhone(user?: JwtPayload) {
  return typeof user?.verified_phone === 'string' && user.verified_phone.trim().length > 0
    ? user.verified_phone
    : null;
}

function tenantContextRequired() {
  return Errors.business(
    409,
    '请先选择装修公司',
    ErrorCodes.RENDERING_TENANT_CONTEXT_REQUIRED,
  );
}

export const customerRenderingContextService = new CustomerRenderingContextService();
