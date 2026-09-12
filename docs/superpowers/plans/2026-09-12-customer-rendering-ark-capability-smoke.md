# 客户装修生图 Ark 能力验证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在开发环境用仓库内非客户图片完成一次可审计的“双图输入 → Seedream 生图 → 私有 COS 转存并校验 → 清理临时对象”真实验证。

**Architecture:** 复用现有 `AiGateway` 查询场景、供应商和密钥，新增只接受 image 路由的配置解析；复用现有 Ark 适配器，并用独立 smoke 编排上传短时输入、调用 Seedream、受控下载结果、私有写入 COS、HEAD 校验及清理。命令默认只做配置预检，只有显式 `--execute` 才产生供应商费用；日志只输出非敏感摘要。

**Tech Stack:** Bun、TypeScript、Supabase、`cos-nodejs-sdk-v5@2.15.4`、现有 Ark OpenAI-compatible HTTP 适配器、Sharp 图片规范化。

---

### Task 1: 为图片场景提供受控配置解析

**Files:**
- Modify: `apps/api/src/services/ai-gateway-types.ts`
- Modify: `apps/api/src/services/ai-gateway.ts`
- Modify: `apps/api/src/services/ai-gateway.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖 `resolveImageConfig({ sceneCode: 'decoration_raw_drawing' })`：只接受 active image 模型、active `openai_compatible` 供应商、合法 Ark 基础地址和已配置密钥，并返回模型调用名、模型系统编码、供应商编码、基础地址与超时；错误不得包含密钥。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/services/ai-gateway.test.ts`

Expected: FAIL，原因是 `resolveImageConfig` 尚不存在。

- [ ] **Step 3: 最小实现**

新增 `AiGatewayResolvedImageConfig`，并在 `AiGateway` 中复用现有场景查询关系实现 image-only 解析。图片路由不得回退到旧文本环境变量，不得接受 OpenRouter 或错误模态。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/services/ai-gateway.test.ts src/gateways/ark-rendering/client.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/ai-gateway-types.ts apps/api/src/services/ai-gateway.ts apps/api/src/services/ai-gateway.test.ts
git commit -m "feat(ai): 支持解析装修生图场景配置"
```

### Task 2: 实现真实调用结果的受控下载

**Files:**
- Create: `apps/api/src/gateways/ark-rendering/result-download.ts`
- Create: `apps/api/src/gateways/ark-rendering/result-download.test.ts`
- Modify: `apps/api/src/gateways/ark-rendering/index.ts`

- [ ] **Step 1: 写失败测试**

覆盖仅允许已确认的北京 Ark Seedream TOS 输出主机、HTTPS、无用户信息、无重定向；限制响应类型为 PNG/JPEG/WEBP、最大 10 MiB、30 秒超时，并确保上游错误不泄露查询签名。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/gateways/ark-rendering/result-download.test.ts`

Expected: FAIL，原因是下载函数尚不存在。

- [ ] **Step 3: 最小实现**

实现单次、无重定向、有限响应读取，返回 `{ bytes, mimeType }`；所有异常通过 `error-factory.ts` 包装为稳定 Ark 错误。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/gateways/ark-rendering`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/gateways/ark-rendering
git commit -m "feat(ai): 增加生图结果受控下载"
```

### Task 3: 增加可回收的私有 COS 能力验证存储

**Files:**
- Create: `apps/api/src/gateways/customer-rendering-smoke-storage/client.ts`
- Create: `apps/api/src/gateways/customer-rendering-smoke-storage/client.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖临时输入和结果只能写入 `private/customer-rendering-smoke/<run-id>/`，写入必须 `ACL=private`、`Cache-Control=private, no-store`；签名 URL 只能指向当前 COS 桶；HEAD 校验长度；清理删除三个对象且错误不泄露 COS 密钥。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/gateways/customer-rendering-smoke-storage/client.test.ts`

Expected: FAIL，原因是 smoke 存储网关尚不存在。

- [ ] **Step 3: 最小实现**

使用已安装 `cos-nodejs-sdk-v5@2.15.4` 的真实类型实现 put、sign、head、delete；配置继续由 `loadRenderingStorageConfig(systemSettingsService)` 提供，不新增秘密来源。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/gateways/customer-rendering-smoke-storage/client.test.ts src/gateways/rendering-library-storage/client.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/gateways/customer-rendering-smoke-storage
git commit -m "feat(ai): 增加装修生图临时私有存储验证"
```

### Task 4: 增加显式付费的端到端 smoke 命令

**Files:**
- Create: `apps/api/src/scripts/customer-rendering-ark-smoke.ts`
- Create: `apps/api/src/scripts/customer-rendering-ark-smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试**

覆盖默认预检不调用 Ark/COS；必须显式 `--execute`；固定读取两张仓库非客户图片；成功路径依次执行上传、签名、生图、受控下载、WebP 规范化、私有写入、HEAD、写本地结果、清理；失败路径也清理已创建对象；输出不得包含 API Key、COS 密钥和签名查询串。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/scripts/customer-rendering-ark-smoke.test.ts`

Expected: FAIL，原因是 smoke 编排尚不存在。

- [ ] **Step 3: 最小实现**

命令增加 `--execute` 和 `--output=<absolute-path>`；默认输出配置就绪摘要。真实执行使用 `apps/web/public/partner-hero-construction-team.png` 作为原始空间、`apps/admin/public/partner-hero-renovation.png` 作为风格参考，提示词要求保留空间结构并生成现代简约效果。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/scripts/customer-rendering-ark-smoke.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add package.json apps/api/src/scripts/customer-rendering-ark-smoke.ts apps/api/src/scripts/customer-rendering-ark-smoke.test.ts
git commit -m "feat(ai): 增加装修生图真实能力验证命令"
```

### Task 5: 开发环境真实验证与证据

**Files:**
- Create: `docs/operations/evidence/2026-09-12-customer-rendering-ark-live-smoke.md`

- [ ] **Step 1: 静态预检**

Run: `bun run api:customer-rendering-ark-smoke`

Expected: 只返回场景、供应商、模型、COS 就绪状态，不调用供应商。

- [ ] **Step 2: 显式执行一次真实调用**

Run: `bun --env-file=<development-env-file> apps/api/src/scripts/customer-rendering-ark-smoke.ts --execute --output=/tmp/customer-rendering-ark-smoke.webp`

Expected: 一次生成成功；结果规范化后私有写入、HEAD 校验并清理临时 COS 对象；本地输出存在。失败时记录稳定错误码，不自动重试。

- [ ] **Step 3: 视觉与文件验证**

检查 `/tmp/customer-rendering-ark-smoke.webp` 可解码、尺寸合理、内容确为装修效果图；证据只记录 request ID、模型、用量、耗时、尺寸、哈希与清理结果，不记录密钥或签名 URL。

- [ ] **Step 4: 完整最小回归**

Run:

```bash
cd apps/api
bun test src/gateways/ark-rendering src/gateways/customer-rendering-smoke-storage src/scripts/customer-rendering-ark-smoke.test.ts src/services/ai-gateway.test.ts
/Users/leefo/Public/work/gooes/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
cd ../../
bun run api:build
bun scripts/check-file-size.ts --staged
git diff --check
```

Expected: 全部退出码为 0。

- [ ] **Step 5: 记录并提交证据**

```bash
git add docs/operations/evidence/2026-09-12-customer-rendering-ark-live-smoke.md
git commit -m "docs(ai): 记录装修生图真实能力验证"
```
