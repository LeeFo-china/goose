# 私有装修素材图片规范化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为专用上传提供有界、真实解码、方向修正及 EXIF 清理，不将品牌 Logo 的 2 MB 限制套用到装修素材。

**Architecture:** 独立纯图片处理函数，由后续上传 service 调用；复用已安装 sharp 与 domain 的 10 MB 限制。不会连接 COS、数据库或模型。

**Tech Stack:** Bun、sharp 0.34.5、现有 Errors 工厂。

---

## Task 1：图片规范化

Files: create `apps/api/src/services/rendering-library-files/image.ts`、`image.test.ts`。

- [x] 先写真实 sharp 用例并运行失败：PNG/JPEG/WebP 正常输入、EXIF orientation=6 的 JPEG 输出尺寸交换且不保留 EXIF；拒绝 MIME 与真实格式不符、GIF/SVG、空文件、超过 10 MB、损坏像素流、超过 4096×4096 总像素、动画 WebP/APNG。

```ts
import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { normalizeRenderingSource } from './image';
test('normalizes orientation and removes EXIF', async () => {
  const bytes = await sharp({create:{width:20,height:10,channels:3,background:'#776655'}})
    .withMetadata({orientation:6}).jpeg().toBuffer();
  const result = await normalizeRenderingSource({bytes,mimeType:'image/jpeg'});
  expect([result.width,result.height,result.mimeType]).toEqual([10,20,'image/webp']);
  expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
});
```

- [x] `cd apps/api && bun test src/services/rendering-library-files/image.test.ts`，记录尚无模块的失败；每个新增拒绝行为先观察失败。
- [x] 实现 `image.ts`，以下为完整处理边界；可以按测试补充类型收窄，不改变品牌模块。

```ts
import sharp from 'sharp';
import { RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
export interface NormalizedRenderingSource {
  bytes: Buffer; mimeType: 'image/webp'; width: number; height: number;
}
const options = { failOn: 'error', limitInputPixels: 4096 * 4096 } as const;
const formats: Record<string, string> = { jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };
function rejected(): never {
  throw Errors.business(422, '请上传 10 MB 内的静态 JPEG、PNG 或 WebP 图片，图片总像素不能超过 16777216', 'RENDERING_IMAGE_REJECTED');
}
// libvips may decode only the first APNG frame; inspect bounded PNG chunks too.
function checkStaticPng(bytes: Buffer): void {
  let offset = 8;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) rejected();
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) rejected();
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') rejected();
    offset += length + 12;
  }
}
export async function normalizeRenderingSource(input: {
  bytes: Buffer; mimeType: string;
}): Promise<NormalizedRenderingSource> {
  if (input.bytes.length === 0 || input.bytes.length > RENDERING_UPLOAD_MAX_BYTES) rejected();
  try {
    const metadata = await sharp(input.bytes, options).metadata();
    if (!metadata.format || formats[metadata.format] !== input.mimeType
      || !['image/jpeg','image/png','image/webp'].includes(input.mimeType)
      || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1
      || metadata.width * metadata.height > options.limitInputPixels) rejected();
    if (metadata.format === 'png') checkStaticPng(input.bytes);
    const { data, info } = await sharp(input.bytes, options).rotate().webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    if (data.length === 0 || data.length > RENDERING_UPLOAD_MAX_BYTES) rejected();
    return { bytes:data, mimeType:'image/webp', width:info.width, height:info.height };
  } catch {
    return rejected();
  }
}
```

- [x] 真实解码的独立坏 PNG/APNG fixture 可参考 `branding-image-metadata-libvips.test.ts` 的来源，不调用品牌校验函数，不模拟 sharp。核对已安装 `.withMetadata`、`.rotate`、`.webp` 类型。
- [x] `bun test src/services/rendering-library-files/image.test.ts src/services/branding-image-metadata.test.ts src/services/branding-image-metadata-libvips.test.ts && bun run typecheck` 全绿，规格和质量审查后交接上传 service。
- [x] 提交由主 agent 在本批联动接口审查后统一完成，不修改其他模块或远端资源。

边界：只存处理后的私有工作图，不声称内容审核通过；公开发布时仍需补充 AI 来源标识和审核。该函数不支持 HEIC，不作为客户房间上传通用入口。
