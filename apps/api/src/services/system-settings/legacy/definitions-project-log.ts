import type { SettingDefinition } from './shared';

export const DEFINITIONS_PROJECT_LOG: SettingDefinition[] = [
  {
    key: 'PROJECT_LOG_COMMUNICATION_ENABLED',
    groupCode: 'project_log',
    name: '项目日志沟通开关',
    description: '启用本项目客户与有权限员工共同参与的文字沟通；启用前完成配套验收。',
    valueType: 'boolean',
    envNames: ['PROJECT_LOG_COMMUNICATION_ENABLED'],
    defaultValue: 'false',
  },
  {
    key: 'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED',
    groupCode: 'project_log',
    name: '内部日志评论退役开关',
    description: '配套客户端就绪后关闭旧内部评论读写，返回更新提示；历史记录保留。',
    valueType: 'boolean',
    envNames: ['PROJECT_LOG_INTERNAL_COMMENTS_RETIRED'],
    defaultValue: 'false',
  },
];
