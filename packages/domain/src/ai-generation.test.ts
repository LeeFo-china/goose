import { describe, expect, test } from 'bun:test';

import * as domain from './index';
import * as shared from './shared';
import {
  AiBillingStatusSchema,
  AiGenerationJobSchema,
  AiGenerationStatusSchema,
  AiModelCapabilitySchema,
  AiMoneySchema,
  AiScopeSchema,
} from './ai-generation';

const tenantId = '00000000-0000-4000-8000-000000000001';

describe('AI generation domain contract', () => {
  test('keeps generation and billing states orthogonal', () => {
    expect(AiGenerationJobSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000101',
      scope: { scope_type: 'tenant', tenant_id: tenantId },
      modality: 'video',
      quality_tier: 'balanced',
      status: 'succeeded',
      billing_status: 'overrun',
      estimated_cost: '000000000001.250000000000',
      reserved_cost: '000000000001.250000000000',
      actual_cost: '000000000001.500000000000',
      currency: 'USD',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:01:00.000Z',
    }).success).toBe(true);
    expect(AiGenerationStatusSchema.safeParse('budget_overrun').success).toBe(false);
    expect(AiBillingStatusSchema.safeParse('processing').success).toBe(false);
  });

  test('rejects numeric money and unbounded capability payloads', () => {
    expect(AiMoneySchema.safeParse(0.1).success).toBe(false);
    expect(AiMoneySchema.safeParse('1.25').success).toBe(false);
    expect(AiMoneySchema.safeParse('000000000001.250000000000').success).toBe(true);
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'video',
      aspect_ratios: ['9:16'],
      max_duration_seconds: 30,
      supports_audio: false,
      unknown: true,
    }).success).toBe(false);
  });

  test('couples platform and tenant scope explicitly', () => {
    expect(AiScopeSchema.safeParse({
      scope_type: 'platform',
      tenant_id: null,
    }).success).toBe(true);
    expect(AiScopeSchema.safeParse({
      scope_type: 'tenant',
      tenant_id: tenantId,
    }).success).toBe(true);
    expect(AiScopeSchema.safeParse({
      scope_type: 'platform',
      tenant_id: tenantId,
    }).success).toBe(false);
    expect(AiScopeSchema.safeParse({
      scope_type: 'tenant',
      tenant_id: null,
    }).success).toBe(false);
  });

  test('uses discriminated capability schemas per modality', () => {
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'text',
      max_context_tokens: 128000,
      supports_json_object: true,
      supports_streaming: true,
    }).success).toBe(true);
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'image',
      supported_sizes: ['1024x1024'],
      supports_reference_image: true,
      max_images_per_request: 4,
    }).success).toBe(true);
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'video',
      aspect_ratios: ['9:16', '16:9'],
      max_duration_seconds: 8,
      supports_audio: true,
    }).success).toBe(true);
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'speech',
      supported_voices: ['alloy'],
      output_formats: ['mp3', 'wav'],
      max_input_characters: 4000,
    }).success).toBe(true);
    expect(AiModelCapabilitySchema.safeParse({
      modality: 'image',
      max_duration_seconds: 8,
    }).success).toBe(false);
  });

  test('public job DTO excludes private request and provider internals', () => {
    expect(AiGenerationJobSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000102',
      scope: { scope_type: 'platform', tenant_id: null },
      modality: 'image',
      quality_tier: 'quality',
      status: 'queued',
      billing_status: 'reserved',
      estimated_cost: '000000000000.040000000000',
      reserved_cost: '000000000000.050000000000',
      actual_cost: null,
      currency: 'USD',
      request_payload: { prompt: 'raw' },
      provider_temporary_url: 'https://tmp.example.com/file.png',
      cos_object_key: 'private/key',
      raw_error: 'provider text',
      api_key: 'secret',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:01:00.000Z',
    }).success).toBe(false);
  });

  test('re-exports the same generation contracts from shared and package root', () => {
    expect(shared.AiGenerationJobSchema).toBe(domain.AiGenerationJobSchema);
    expect(shared.AiModelCapabilitySchema).toBe(domain.AiModelCapabilitySchema);
    expect(shared.AiMoneySchema).toBe(domain.AiMoneySchema);
  });
});
