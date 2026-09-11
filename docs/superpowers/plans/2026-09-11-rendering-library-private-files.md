# 租户效果素材私有上传与预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让有权限的租户员工上传单张规范化素材、获得 file_id 并短时预览，再通过已实现的草稿接口保存元数据。

**Architecture:** 薄文件 controller → 专用文件 service → 现有素材 repository / 新的类型安全 COS gateway。先登记不可用文件，再写私有对象，最后激活；失败不返回 file_id、不自动重试或删除未知结果。所有列表仍由已实现的分页接口处理。

**Tech Stack:** Bun、现有 Fastify multipart 10.0.0、sharp 0.34.5、COS SDK 2.15.4、Supabase 与 domain；无新依赖、无远端执行。

---

前置：`2026-09-11-rendering-library-image-normalization.md` 通过两阶段审查。用户已确认继续实现私有上传/预览；本步不开放审核、发布、客户照片或生成入口。

## Task 1：端到端私有文件 API

Files:

- Create `apps/api/src/gateways/rendering-library-storage/{client.ts,client.test.ts,index.ts}`。
- Create `apps/api/src/services/rendering-library-files/{source-policy.ts,service.ts,service.test.ts,index.ts}`。
- Create `apps/api/src/controllers/tenant-rendering-library/{files.ts,files.test.ts}`。
- Modify `apps/api/src/repositories/tenant-rendering-library.ts`、其测试、`services/tenant-rendering-library/service.ts`、`test-fixtures.ts`、`service.test.ts`、`routes/index.ts`。
- Modify `packages/domain/src/rendering-library.ts` 及测试，新增明确的上传/预览 DTO；已有导出文件不需要新入口。

### 1. 先锁定安全及生命周期测试

- [x] TDD：新增 domain DTO 及测试，API 外部边界用注入端口，不模拟权限放行、图片解码或 HTTP multipart。

```ts
export const RenderingLibraryFileUploadResultSchema = z.strictObject({
  file_id:z.uuid(), mime_type:z.literal('image/webp'), size_bytes:z.number().int().positive().max(RENDERING_UPLOAD_MAX_BYTES),
  width:z.number().int().positive(), height:z.number().int().positive(),
});
export const RenderingLibraryFilePreviewResultSchema = z.strictObject({
  file_id:z.uuid(), url:z.url().refine(value => new URL(value).protocol === 'https:'),
  expires_at:z.string().datetime({offset:true}),
});
export type RenderingLibraryFileUploadResult = z.infer<typeof RenderingLibraryFileUploadResultSchema>;
export type RenderingLibraryFilePreviewResult = z.infer<typeof RenderingLibraryFilePreviewResultSchema>;
```

测试：合法 DTO、非法 UUID/负尺寸/超过 10 MB/HTTP URL，以及附加 object_key、tenant_id、public_url 均被拒绝。

- [x] 文件 service 测试使用真实 `accessPolicyService` 和 `normalizeRenderingSource`，只注入 repository、COS gateway 与 UUID/时钟（如需要）。断言无 tenant/employee/read-all/manage-all 在任何处理或持久化前失败；跨租户/非专用/private/owner/provider/路径/状态文件不可签名。成功调用顺序必须是 normalize → location → stage → put → activate，不先上传再登记。任何步骤失败不得继续；写入不确定时保留未激活记录，不生成预览 URL、不返回成功。

```ts
// Test intent; fixture gateways record calls and return complete stored records.
expect(calls.map(call => call[0])).toEqual(['location','stage','put','activate']);
expect(result).toEqual({file_id:fileId,mime_type:'image/webp',size_bytes:encodedSize,width:20,height:10});
expect(result).not.toHaveProperty('object_key');
// Fail put, assert activate/sign not called and staging row remains unavailable.
// Fail stage, assert put not called. Fail activate, assert no success/sign/delete/retry.
```

### 2. COS 边界

- [x] 先测试 gateway 再实现：固定使用平台腾讯 COS 配置；未配置/供应商不符返回 503，不退回公开 Supabase；ACL private、HTTPS、静态 WebP、no-store、120 秒签名、不用 CDN、输入路径及 bucket/region 与配置吻合、异常不泄密。

```ts
import COS from 'cos-nodejs-sdk-v5';
import { systemSettingsService } from '@/services/system-settings';
import { Errors } from '@/errors/error-factory';
import { z } from 'zod';
export interface RenderingStorageLocation { bucket:string; region:string; object_key:string }
interface Config { secretId:string; secretKey:string; bucket:string; region:string }
type CosPort = Pick<COS,'putObject'|'getObjectUrl'>;
const LocationSchema = z.strictObject({bucket:z.string().regex(/^[a-z0-9-]+-\d+$/),region:z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/),object_key:z.string()});
// Export config loader separately or inject a typed settings port for offline tests.
async function loadConfig(): Promise<Config> {
  const provider = await systemSettingsService.getString('PLATFORM_STORAGE_PROVIDER');
  if (provider !== 'tencent_cos') throw Errors.business(503,'私有素材存储尚未配置','RENDERING_STORAGE_UNAVAILABLE');
  const [secretId,secretKey,bucket,region] = await Promise.all([
    systemSettingsService.getSecretString('TENCENT_COS_SECRET_ID'),systemSettingsService.getSecretString('TENCENT_COS_SECRET_KEY'),
    systemSettingsService.getString('PLATFORM_COS_BUCKET'),systemSettingsService.getString('PLATFORM_COS_REGION'),
  ]);
  if (!secretId || !secretKey || !LocationSchema.shape.bucket.safeParse(bucket).success
    || !LocationSchema.shape.region.safeParse(region).success)
    throw Errors.business(503,'私有素材存储尚未配置','RENDERING_STORAGE_UNAVAILABLE');
  return {secretId,secretKey,bucket,region};
}
// Class dependencies: loadConfig and makeClient; no credentials or mutable legacy `this:any` adapters.
// makeClient default uses new COS({SecretId,SecretKey,Protocol:'https:',Timeout:30000,FollowRedirect:false}).
// location(tenantId,id): validate both UUIDs; return configured bucket/region and exactly:
// private/renovation-styles/${tenantId}/${id}.webp
// put(tenantId,id,location,bytes): validate location equals the canonical key and current bucket/region.
await cos.putObject({Bucket:config.bucket,Region:config.region,Key:location.object_key,
  Body:bytes,ContentLength:bytes.length,ContentType:'image/webp',ACL:'private',CacheControl:'private, no-store'});
// preview(tenantId,id,location): same validation, fixed settings below; return only URL.
const url = cos.getObjectUrl({Bucket:config.bucket,Region:config.region,Key:location.object_key,
  Sign:true,Method:'GET',Expires:120,Protocol:'https:'});
```

所有 loadConfig/SDK 失败固定包装为 Errors（配置 503、存储 502）；不把 raw error/details、bucket、key、签名或凭据写入日志。put 再次检查 1..10 MB。签名结果校验为 HTTPS、无 userinfo、host 为当前桶标准 COS 域名；不将未签名 URL 作为 fallback。默认 SDK 自身行为不等于业务重试，本层不添加任何重试/自动删除。

### 3. 文件索引与共同资格校验

- [x] 扩展现有 repository 的 source select/schema，不复制通用文件 repository。字段为原九字段加 provider,bucket,region,owner_type,owner_id,width,height,public_url,legacy_url,legacy_path。新增 `stageSourceFile`、`activateSourceFile`；只在该层访问 Supabase，数据库异常固定包装。

```ts
// stageSourceFile receives trusted server id/tenant/employee, normalized dimensions/size/checksum, vetted location.
const payload = {
  id,tenant_id:tenantId,owner_type:'tenant',owner_id:tenantId,scene:RENDERING_LIBRARY_SOURCE_SCENE,
  provider:'tencent_cos',bucket:location.bucket,region:location.region,object_key:location.object_key,
  mime_type:'image/webp',size_bytes:sizeBytes,width,height,checksum,
  visibility:'private',public_url:null,legacy_url:null,legacy_path:null,status:'migrating',
  original_name:null,created_by_employee_id:employeeId,created_by_auth_user_id:authUserId,
  metadata:{normalization:'rendering-webp-v1'},
};
// `.insert(payload).select(SOURCE_FIELDS).single()`; strict parse + expected tenant/id/location/state.
// The existing allowed `migrating` state means staged/unavailable for this dedicated scene; no worker claims it.
// activateSourceFile uses one bounded conditional update:
const result = await client.from('platform_file_objects').update({status:'active'})
  .eq('tenant_id',tenantId).eq('id',id).eq('scene',RENDERING_LIBRARY_SOURCE_SCENE)
  .eq('status','migrating').eq('visibility','private').is('deleted_at',null)
  .select(SOURCE_FIELDS).maybeSingle();
// Missing/invalid result => fixed database error, no assumed success or auto repeat.
```

`source-policy.ts` 定义 `assertRenderingSourceFile(tenantId,fileId,file)`，供旧草稿创建和新预览共同调用：同 tenant/id、active、未删除、private、专用 scene、provider=tencent_cos、owner_type=tenant且 owner_id=tenant、WebP、1..10 MB、有效正尺寸总像素不超过 4096²、public/legacy URL/path 全为空、路径精确为 `private/renovation-styles/<tenant>/<fileId>.webp`；任意不符用已有 `RENDERING_STYLE_FILE_NOT_FOUND` 404。不要求创建员工与读取员工相同。

更新 B1 完整 fixture 为该真实文件形态；保留并补充所有原资格拒绝用例，不删除旧断言。Repository 测试断言 source select 为明确字段、阶段写入不是 public/active、激活 tenant/id/scene/status/private/deleted 条件、错误行被拒绝。

### 4. Service 编排与 HTTP

- [x] service 独立文件，依赖 Pick 的 repository/storage/accessPolicy 和真实 normalize；`index.ts` 只组装单例。上传、预览都要求 tenant员工 + read:all；上传另要求 manage:all。导出 `assertUploadAccess(auth)` 供 controller 在开始解析 multipart 前调用，upload 自己仍再次授权。

```ts
// upload(auth,{bytes,mimeType}) after authorization:
const normalized = await normalizeRenderingSource(input);
const id = randomUUID();
const location = await storage.location(tenantId,id);
await repository.stageSourceFile({id,tenantId,employeeId,authUserId:auth.authUserId,location,
  sizeBytes:normalized.bytes.length,width:normalized.width,height:normalized.height,
  checksum:createHash('sha256').update(normalized.bytes).digest('hex')});
await storage.put(tenantId,id,location,normalized.bytes);
const row = await repository.activateSourceFile(tenantId,id);
assertRenderingSourceFile(tenantId,id,row);
return {file_id:id,mime_type:'image/webp',size_bytes:row.size_bytes,width:row.width,height:row.height};
// preview(auth,id): UUID parse, repo.findSourceFile(tenant,id), assertRenderingSourceFile, then storage.preview.
// Return {file_id:id,url,expires_at:new Date(now+120000).toISOString()}; never accept caller TTL or URL.
```

- [x] 文件 controller 独立于原六接口，继承 TenantBaseController，新增 `POST /tenant/rendering-library/files` 与 `GET /tenant/rendering-library/files/:id/preview`，只 `registerExtraRoutes`，在 routes/index.ts 相邻注册。原六路由测试仍断言原 controller 只六个 handler。

```ts
@Post('/tenant/rendering-library/files')
async uploadFile(request:FastifyRequest,reply:FastifyReply) {
  const auth = await this.getRequiredTenantContext(request);
  this.service.assertUploadAccess(auth);
  // strict empty query before parsing; request.isMultipart() required.
  let file: {bytes:Buffer;mimeType:string} | undefined;
  try {
    for await (const part of request.parts({limits:{files:1,fields:0,parts:1,fileSize:RENDERING_UPLOAD_MAX_BYTES}})) {
      if (part.type !== 'file' || part.fieldname !== 'file' || file) throw Errors.badRequest('请仅上传一个 file 图片字段');
      const bytes = await part.toBuffer();
      if (part.file.truncated) throw Errors.badRequest('图片不能超过 10 MB');
      file = {bytes,mimeType:part.mimetype};
    }
  } catch { throw Errors.badRequest('上传格式无效，请仅上传一张 10 MB 内的图片'); }
  if (!file) throw Errors.badRequest('请上传图片');
  reply.header('Cache-Control','private, no-store');
  return ResponseHandler.success(await this.service.upload(auth,file));
}
// GET handler: requiredtenantcontext → strict UUID params and empty query → preview service → no-store success.
```

controller 必须消费完整 parts 迭代器之后才调用 service.upload，因此第二文件、尾随字段或损坏结束边界不产生存储副作用。错误码可区分大小但不得直接泄露 multipart 异常。不能注册 generic DIRECT_UPLOAD_SCENES，不能返回公开/CDN URL。

- [x] 真实 Fastify+multipart inject：合法上传→预览→将 file_id 交给真实草稿 service 创建；未认证401/缺权限403优先，且读流前拒绝；无文件/字段名错/未知query/第二文件/前后额外字段/超限/缺结束边界失败并零存储；预览跨租户404、非active404、无权限403、无任意TTL、no-store响应、过期时间120秒。断言新增 controller 的完整路由集合（两 handler+一个HEAD）。
- [x] 泛用公开 URL 的已有路径/文件 ID 拒绝测试纳入回归；不得添加私有场景到通用直传白名单。

### 5. 验证、审查和提交

- [x] 各层先 RED 再 GREEN；运行所有新增文件测试、原草稿 API 三层测试、图片规范化及原公开 URL 隔离回归。运行 API/domain/Admin 类型检查、文件大小检查及 diff check。
- [x] 独立规格审查 → 质量审查 → 根 agent 最终回归。更新进度记录，主 agent 提交本阶段；不推送或部署。

## 运行与验收边界

不增加数据库结构或状态值：复用文件表既有 migrating/active；本场景未激活行不能被创建素材或签名。存储/激活失败保留私有记录和对象以供核查，不误删可能成功的写入。激活提交后响应丢失时，数据库可能已经 active；失败响应不能用于推断数据库没有提交，测试须覆盖不重复写入、不自动删除。后续清理需独立的有界回收任务，本步不承诺自动 24 小时清理。

COS SDK 参数可离线验证，但有效 bucket policy/CDN 规则必须在发布前用授权样本验证匿名访问失败；ACL private 本身不足以证明远端策略正确。本批不调用真实 COS、不运行远端 migration；没有 Admin 页面，不能声称用户已可在后台上传。审核与公开副本、AI 来源标识、未使用文件保留策略仍是后续发布前置条件。
