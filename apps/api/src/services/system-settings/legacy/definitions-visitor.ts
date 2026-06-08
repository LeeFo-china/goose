import type { SettingDefinition } from './shared';

export const DEFINITIONS_VISITOR: SettingDefinition[] = [
  {
    key: "VISITOR_PROJECT_CONSULTATION_ENABLED",
    groupCode: "visitor",
    name: "访客项目详情咨询开关",
    description: "控制租户公开项目详情页是否展示并允许提交咨询线索。",
    valueType: "boolean",
    envNames: ["VISITOR_PROJECT_CONSULTATION_ENABLED"],
    defaultValue: "false",
  },
];
