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

process.stdout.write(`domain dist verified: ${size} bytes, external zod identity preserved\n`);
