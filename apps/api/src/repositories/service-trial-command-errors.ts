import { Errors } from '@/errors/error-factory';
import { ErrorCodes } from '@/errors/error-codes';
import { matchesPostgresError } from '@/errors/postgres-error-details';

const COMMAND_ERRORS = {
  SERVICE_TRIAL_NOT_FOUND: [404, '技术服务试用不存在'],
  SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE: [403, '重复试用需要平台特批'],
  SERVICE_TRIAL_APPLICATION_PENDING: [409, '已有待审核试用申请'],
  SERVICE_TRIAL_ACTIVE_EXISTS: [409, '当前已有可用试用'],
  SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE: [409, '正式服务有效时不能申请试用'],
  SERVICE_TRIAL_REAPPLY_COOLDOWN: [409, '试用再次申请仍在冷却期'],
  SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED: [409, '需要先完成企业身份认证'],
  SERVICE_TRIAL_ACTION_NOT_ALLOWED: [409, '当前试用状态不允许此操作'],
  SERVICE_TRIAL_VERSION_CONFLICT: [409, '试用信息已更新，请刷新后重试'],
  SERVICE_TRIAL_IDEMPOTENCY_CONFLICT: [409, '重复请求参数不一致'],
  SERVICE_TRIAL_EXTENSION_INVALID: [400, '试用延期参数无效'],
} as const;

export function throwServiceTrialCommandError(error: unknown): never {
  if (matchesPostgresError(error, 'P0001', 'SERVICE_TRIAL_OVERRIDE_REQUIRED')) {
    throw Errors.business(403, '缺少平台操作权限',
      ErrorCodes.PLATFORM_PERMISSION_REQUIRED,
      { permission: 'platform.service_trial.override' });
  }
  for (const [code, [status, message]] of Object.entries(COMMAND_ERRORS)) {
    if (matchesPostgresError(error, 'P0001', code)) {
      throw Errors.business(status, message, code);
    }
  }
  throw Errors.dbError('执行技术服务试用操作失败');
}
