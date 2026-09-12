import { describe, expect, test } from 'bun:test';
import * as domain from './index';
import * as shared from './shared';

const expectedCodes = [
  'customer_log_share_copy', 'decoration_qa', 'decoration_qa_title',
  'decoration_raw_drawing', 'douyin_budget_explanation',
  'marketing_page_block_fill', 'marketing_page_create_fill',
  'marketing_page_settings_fill', 'project_operational_risk_summary',
  'social_video_script',
] as const;

const isClosed: string extends domain.SystemAiSceneCode ? false : true = true;

describe('system AI scene definitions', () => {
  test('keeps scene code type closed to the registered identities', () => {
    expect(isClosed).toBe(true);
  });

  test('publishes the exact stable identities without billing-only scenes', () => {
    expect(Array.isArray(domain.SYSTEM_AI_SCENES)).toBe(true);
    expect(domain.SYSTEM_AI_SCENES.map(scene => scene.code).sort()).toEqual([...expectedCodes].sort());
    expect(new Set(domain.SYSTEM_AI_SCENES.map(scene => scene.code)).size).toBe(10);
    expect(domain.SYSTEM_AI_SCENES.length).toBeLessThanOrEqual(50);
  });
  test('keeps nine text runtimes distinct from the unconnected rendering scene', () => {
    const textScenes = domain.SYSTEM_AI_SCENES.filter(scene => scene.modality === 'text');
    expect(textScenes.length).toBe(9);
    for (const scene of textScenes) {
      expect(scene.runtime_status).toBe('connected');
      expect(scene.required_input_modalities).toEqual(['text']);
      expect(scene.requirements_source).toBe('runtime');
      expect(scene.min_reference_images).toBe(0);
    }
    expect(domain.findSystemAiScene('decoration_raw_drawing')).toEqual({
      code: 'decoration_raw_drawing', name: '装修生图', modality: 'image',
      required_input_modalities: ['text', 'image'], runtime_status: 'not_connected',
      requirements_source: 'planned_adapter', requires_streaming: false,
      min_reference_images: 2,
    });
  });
  test('retains historical names and only QA requires streaming', () => {
    expect(domain.findSystemAiScene('decoration_qa_title')?.name).toBe('装修问答标题生成');
    expect(domain.findSystemAiScene('social_video_script')?.modality).toBe('text');
    expect(domain.SYSTEM_AI_SCENES.filter(scene => scene.requires_streaming).map(scene => scene.code)).toEqual(['decoration_qa']);
  });
  test('uses exact code identity and never derives it from a label', () => {
    expect(typeof domain.findSystemAiScene).toBe('function');
    for (const code of ['装修问答', 'DECORATION_QA', ' decoration_qa ', '', 'douyin_transcription', 'unknown_legacy', '__proto__']) {
      expect(domain.findSystemAiScene(code)).toBeUndefined();
    }
    const scene = domain.findSystemAiScene('decoration_qa');
    expect(scene?.code).toBe('decoration_qa');
    expect(scene).toBe(domain.SYSTEM_AI_SCENES.find(item => item.code === 'decoration_qa'));
  });
  test('exposes immutable definitions consistently through both barrels', () => {
    expect(shared.SYSTEM_AI_SCENES).toBe(domain.SYSTEM_AI_SCENES);
    expect(shared.findSystemAiScene).toBe(domain.findSystemAiScene);
    expect(Object.isFrozen(domain.SYSTEM_AI_SCENES)).toBe(true);
    for (const scene of domain.SYSTEM_AI_SCENES) {
      expect(Object.isFrozen(scene)).toBe(true);
      expect(Object.isFrozen(scene.required_input_modalities)).toBe(true);
    }
  });
});
