import type { SettingDefinition } from './shared';

export const DEFINITIONS_PICTURE_LIBRARY: SettingDefinition[] = [
  {
    key: "PICTURE_COMMENT_DEFAULT_STATUS",
    groupCode: "picture_library",
    name: "图片资料库评论默认状态",
    description: "控制 visitor 新提交图片资料库评论后的默认状态。visible 为立即展示，pending 为进入待处理。",
    valueType: "string",
    envNames: ["PICTURE_COMMENT_DEFAULT_STATUS"],
    defaultValue: "visible",
  },
];
