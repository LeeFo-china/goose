import { readFile, stat } from 'node:fs/promises';

import { z } from 'zod';

const MAX_DIST_BYTES = 256 * 1024;
const distUrl = new URL('../dist/index.js', import.meta.url);
const { size } = await stat(distUrl);

if (size > MAX_DIST_BYTES) {
  throw new Error(`domain dist 体积 ${size} bytes 超过 ${MAX_DIST_BYTES} bytes`);
}

const distSource = await readFile(distUrl, 'utf8');
if (!/from\s+["']zod["']/.test(distSource)) {
  throw new Error('domain dist 未保留 external zod import');
}

const domain = await import(distUrl.href);
if (!(domain.SiteContentDraftBlockSchema instanceof z.ZodType)) {
  throw new Error('domain dist schema 与 consumer 使用了不同的 Zod 类型身份');
}

const parsed = domain.SiteContentDraftBlockSchema.safeParse({
  type: 'paragraph',
  text: '构建验证',
});
if (!parsed.success) {
  throw new Error('domain dist schema 无法执行解析');
}

if (!(domain.DouyinContactSlaTextSchema instanceof z.ZodType)) {
  throw new Error('domain dist 缺少抖音联系时限 schema');
}
if (
  domain.DOUYIN_DEFAULT_CONTACT_SLA_TEXT
    !== '工作人员将在营业时间内与你联系'
) {
  throw new Error('domain dist 抖音联系时限默认文案不稳定');
}
const normalizedRuntime = domain.DouyinRuntimeConfigSchema.safeParse({
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: '#C45A32', navigation_text_color: 'black' },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: 'sms',
  },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: '2026-07-19',
});
if (
  !normalizedRuntime.success
  || normalizedRuntime.data.contact_sla_text
    !== domain.DOUYIN_DEFAULT_CONTACT_SLA_TEXT
) {
  throw new Error('domain dist 无法规范化抖音联系时限默认文案');
}

process.stdout.write(`domain dist verified: ${size} bytes, external zod identity preserved\n`);
