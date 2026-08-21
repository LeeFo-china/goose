import { Errors } from '@/errors/error-factory';
import {
  douyinMiniappContentRepository,
  type DouyinMiniappContentRepository,
} from '@/repositories/douyin-miniapp-content';
import type { JwtPayload } from '@/utils/jwt';

export type DouyinBudgetContextRepository = Pick<
  DouyinMiniappContentRepository,
  'findActiveInstallation'
>;

export type DouyinBudgetContext = {
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
};

export async function resolveDouyinBudgetContext(
  user?: JwtPayload,
  repository: DouyinBudgetContextRepository = douyinMiniappContentRepository,
): Promise<DouyinBudgetContext> {
  if (
    user?.token_type !== 'douyin_miniapp'
    || !user.tenant_id
    || !user.douyin_installation_id
    || !user.douyin_app_id
    || !user.subject_hash
    || !/^[0-9a-f]{64}$/.test(user.subject_hash)
    || user.sub !== user.subject_hash
  ) {
    throw Errors.unauthorized('请使用抖音小程序会话');
  }
  const installation = await repository.findActiveInstallation({
    installationId: user.douyin_installation_id,
    tenantId: user.tenant_id,
    appId: user.douyin_app_id,
  });
  if (
    !installation
    || installation.id !== user.douyin_installation_id
    || installation.tenant_id !== user.tenant_id
    || installation.authorizer_appid !== user.douyin_app_id
    || installation.tenant.id !== user.tenant_id
  ) {
    throw Errors.business(
      409,
      '抖音小程序服务已暂停',
      'DOUYIN_INSTALLATION_DISABLED',
    );
  }
  if (installation.installation_kind !== 'merchant') {
    throw Errors.business(
      409,
      '当前小程序不支持预算试算',
      'DOUYIN_BUDGET_INSTALLATION_UNSUPPORTED',
    );
  }
  if (installation.tenant.status !== 'active') {
    throw Errors.business(403, '装修公司服务已暂停', 'TENANT_NOT_AVAILABLE');
  }
  return {
    tenantId: user.tenant_id,
    installationId: user.douyin_installation_id,
    subjectHash: user.subject_hash,
  };
}
