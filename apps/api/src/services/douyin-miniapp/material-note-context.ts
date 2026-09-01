import { Errors } from '@/errors/error-factory';
import {
  type DouyinMiniappContentRepository,
  douyinMiniappContentRepository,
} from '@/repositories/douyin-miniapp-content';
import { DouyinRuntimeConfigSchema } from '@/schema/platform-douyin-miniapps';
import type { JwtPayload } from '@/utils/jwt';

type ContextRepository = Pick<DouyinMiniappContentRepository, 'findActiveInstallation'>;

export type DouyinMaterialNoteContext = {
  readonly tenantId: string;
  readonly installationId: string;
  readonly appId: string;
  readonly subjectHash: string;
};

export class DouyinMaterialNoteContextResolver {
  private readonly contextRepository: ContextRepository;

  constructor(dependencies: { readonly contextRepository?: ContextRepository } = {}) {
    this.contextRepository = dependencies.contextRepository ?? douyinMiniappContentRepository;
  }

  async resolve(user?: JwtPayload): Promise<DouyinMaterialNoteContext> {
    if (!isMaterialSession(user)) {
      throw Errors.unauthorized('请使用抖音小程序会话');
    }
    const installation = await this.contextRepository.findActiveInstallation({
      tenantId: user.tenant_id,
      installationId: user.douyin_installation_id,
      appId: user.douyin_app_id,
    });
    if (!installation
      || installation.id !== user.douyin_installation_id
      || installation.tenant_id !== user.tenant_id
      || installation.authorizer_appid !== user.douyin_app_id
      || installation.authorization_status !== 'active'
      || installation.tenant.id !== user.tenant_id
      || !DouyinRuntimeConfigSchema.safeParse(installation.runtime_config).success) {
      throw Errors.business(
        409,
        '抖音小程序服务已暂停',
        'DOUYIN_INSTALLATION_DISABLED',
      );
    }
    if (installation.tenant.status !== 'active') {
      throw Errors.business(403, '装修公司服务已暂停', 'TENANT_NOT_AVAILABLE');
    }
    return {
      tenantId: user.tenant_id,
      installationId: user.douyin_installation_id,
      appId: user.douyin_app_id,
      subjectHash: user.subject_hash,
    };
  }
}

function isMaterialSession(user?: JwtPayload): user is JwtPayload & {
  tenant_id: string;
  douyin_installation_id: string;
  douyin_app_id: string;
  subject_hash: string;
} {
  return user?.token_type === 'douyin_miniapp'
    && typeof user.tenant_id === 'string'
    && user.tenant_id.length > 0
    && typeof user.douyin_installation_id === 'string'
    && user.douyin_installation_id.length > 0
    && typeof user.douyin_app_id === 'string'
    && user.douyin_app_id.length > 0
    && typeof user.subject_hash === 'string'
    && /^[0-9a-f]{64}$/.test(user.subject_hash)
    && user.sub === user.subject_hash;
}

export const douyinMaterialNoteContextResolver =
  new DouyinMaterialNoteContextResolver();
