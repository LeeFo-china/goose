import type { AiModality } from './ai-generation';

export interface SystemAiSceneDefinition {
  readonly code: string;
  readonly name: string;
  readonly modality: AiModality;
  readonly required_input_modalities: readonly AiModality[];
  readonly runtime_status: 'connected' | 'not_connected';
  readonly requirements_source: 'runtime' | 'planned_adapter';
  readonly requires_streaming: boolean;
  readonly min_reference_images: number;
}

const TEXT_INPUT = Object.freeze(['text'] as const);
const RENDERING_INPUT = Object.freeze(['text', 'image'] as const);

function textScene<const Code extends string>(code: Code, name: string, requiresStreaming = false) {
  return Object.freeze({
    code, name, modality: 'text' as const,
    required_input_modalities: TEXT_INPUT,
    runtime_status: 'connected' as const,
    requirements_source: 'runtime' as const,
    requires_streaming: requiresStreaming,
    min_reference_images: 0,
  });
}

// 固定十项内部注册信息（<= 50），不是无上限业务列表；扩展时同步检查容量测试。
// 名称是展示文案，code 是已有调用身份，不得由名称重新生成。
export const SYSTEM_AI_SCENES = Object.freeze([
  textScene('customer_log_share_copy', '客户施工日志分享文案'),
  textScene('decoration_qa', '装修问答', true),
  textScene('decoration_qa_title', '装修问答标题生成'),
  Object.freeze({
    code: 'decoration_raw_drawing', name: '装修生图', modality: 'image',
    required_input_modalities: RENDERING_INPUT,
    runtime_status: 'not_connected', requirements_source: 'planned_adapter',
    requires_streaming: false, min_reference_images: 2,
  } as const),
  textScene('douyin_budget_explanation', '抖音预算初算解释'),
  textScene('marketing_page_block_fill', 'H5 活动页模块 AI 回填'),
  textScene('marketing_page_create_fill', 'H5 活动页创建 AI 回填'),
  textScene('marketing_page_settings_fill', 'H5 活动页配置 AI 回填'),
  textScene('project_operational_risk_summary', '项目运营风险摘要'),
  textScene('social_video_script', '短视频脚本生成'),
] as const satisfies readonly SystemAiSceneDefinition[]);

export type SystemAiSceneCode = (typeof SYSTEM_AI_SCENES)[number]['code'];

export function findSystemAiScene(code: string): SystemAiSceneDefinition | undefined {
  return SYSTEM_AI_SCENES.find(scene => scene.code === code);
}
