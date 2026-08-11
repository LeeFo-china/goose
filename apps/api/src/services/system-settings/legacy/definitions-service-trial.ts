import type { SettingDefinition } from './shared';

export const DEFINITIONS_SERVICE_TRIAL: SettingDefinition[] = [
  {
    key: 'PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED',
    groupCode: 'platform_service_trial',
    name: '技术服务试用自主申请开关',
    description: '控制租户员工是否可以提交新的技术服务试用申请。',
    valueType: 'boolean',
    envNames: ['PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED'],
    defaultValue: 'false',
  },
  {
    key: 'PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED',
    groupCode: 'platform_service_trial',
    name: '技术服务试用访问放行开关',
    description: '控制统一租户服务门禁是否接受有效试用和宽限期事实。',
    valueType: 'boolean',
    envNames: ['PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED'],
    defaultValue: 'false',
  },
];
