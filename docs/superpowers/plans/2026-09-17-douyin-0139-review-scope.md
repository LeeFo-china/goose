# 抖音小程序 0.1.39 提审范围实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 保留装修问答能力并移除 AI 命名，同时把抖音效果图收敛为实景图、设计图只读浏览。

**Architecture:** 共享目录 service 按渠道传递允许的来源，repository 在数据库分页前过滤；抖音客户端进一步把来源类型限定为实景图和设计图。效果图详情页替换为只读页面，并清理仅为上传与生成服务的抖音客户端模块。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase、抖音原生小程序 TTML/TTSS。

---

### Task 1: 限制抖音效果图来源

**Files:**
- Modify: `apps/api/src/services/customer-rendering/catalog.ts`
- Modify: `apps/api/src/services/customer-rendering/catalog.test.ts`
- Modify: `apps/api/src/repositories/customer-rendering-catalog.ts`
- Modify: `apps/api/src/repositories/customer-rendering-catalog.test.ts`

- [x] **Step 1: 写失败测试**

在 service 测试中断言 `douyin` 列表和详情向 repository 传入
`['real_case', 'design']`，`wechat` 不传来源限制；在 repository 测试中断言列表和详情
查询调用 `.in('published_source_type', ['real_case', 'design'])`。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test apps/api/src/services/customer-rendering/catalog.test.ts apps/api/src/repositories/customer-rendering-catalog.test.ts`

Expected: FAIL，现有 repository 方法没有来源限制参数或查询没有 `.in()`。

- [x] **Step 3: 实现最小来源限制**

为 repository 的 `list`、`find` 增加可选 `sourceTypes` 参数，有值时在 Supabase 查询中
调用 `.in()`。service 根据 `channel === 'douyin'` 传入固定的两种可见来源；微信保持
`undefined`。详情查不到时继续使用 `RENDERING_STYLE_NOT_FOUND`。

- [x] **Step 4: 验证 API 测试通过**

Run: `bun test apps/api/src/services/customer-rendering/catalog.test.ts apps/api/src/repositories/customer-rendering-catalog.test.ts`

Expected: PASS。

### Task 2: 把问答界面统一改名为装修问答

**Files:**
- Modify: `apps/douyin-mini/src/pages/home/index.ttml`
- Modify: `apps/douyin-mini/src/pages/qa/index.ttml`
- Modify: `apps/douyin-mini/src/pages/qa/index.json`
- Modify: `apps/douyin-mini/src/pages/qa/index.test.ts`
- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`

- [x] **Step 1: 写失败测试**

把相关契约改为必须包含“装修问答”，并断言首页、问答页及导航配置均不包含
“AI 装修问题助手”。保留问答提交、流式展示和量房入口的原有断言。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test apps/douyin-mini/src/pages/qa/index.test.ts apps/douyin-mini/src/ui-contracts.test.ts`

Expected: FAIL，旧模板仍显示“AI 装修问题助手”。

- [x] **Step 3: 替换用户可见名称**

只修改首页入口、问答页标题和导航栏标题为“装修问答”，不修改问答请求或交互逻辑。

- [x] **Step 4: 验证问答契约通过**

Run: `bun test apps/douyin-mini/src/pages/qa/index.test.ts apps/douyin-mini/src/ui-contracts.test.ts`

Expected: PASS。

### Task 3: 收敛抖音效果图客户端数据契约

**Files:**
- Modify: `apps/douyin-mini/src/api/rendering-styles.ts`
- Modify: `apps/douyin-mini/src/api/rendering-styles.test.ts`
- Modify: `apps/douyin-mini/src/pages/rendering-styles/labels.ts`
- Modify: `apps/douyin-mini/src/pages/rendering-styles/index.ttml`
- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`

- [x] **Step 1: 写失败测试**

增加测试断言抖音 API 只接受 `real_case`、`design`，遇到 `ai_concept` 响应时返回
`INVALID_API_RESPONSE`；页面模板不得出现“AI 概念图”。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test apps/douyin-mini/src/api/rendering-styles.test.ts apps/douyin-mini/src/ui-contracts.test.ts`

Expected: FAIL，当前客户端接受并展示 `ai_concept`。

- [x] **Step 3: 实现客户端防御边界**

从 `RENDERING_SOURCES` 和来源标签中移除 `ai_concept`，删除列表页 AI 概念图提示。
保留服务端分页结果校验和已有错误处理。

- [x] **Step 4: 验证目录契约通过**

Run: `bun test apps/douyin-mini/src/api/rendering-styles.test.ts apps/douyin-mini/src/ui-contracts.test.ts`

Expected: PASS。

### Task 4: 将效果图详情恢复为只读页面

**Files:**
- Replace: `apps/douyin-mini/src/pages/rendering-style-detail/page.ts`
- Replace: `apps/douyin-mini/src/pages/rendering-style-detail/page.test.ts`
- Replace: `apps/douyin-mini/src/pages/rendering-style-detail/index.ts`
- Replace: `apps/douyin-mini/src/pages/rendering-style-detail/index.ttml`
- Replace: `apps/douyin-mini/src/pages/rendering-style-detail/index.ttss`
- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`

- [x] **Step 1: 写失败测试**

以目录初版只读页面为行为基线，测试加载、隐藏期间忽略响应、刷新失败保留旧内容、图片失败
占位和返回列表。增加静态契约，禁止详情模板与入口包含上传、手机号验证、生成任务、
AI 效果图等标记。

- [x] **Step 2: 验证测试按预期失败**

Run: `bun test apps/douyin-mini/src/pages/rendering-style-detail/page.test.ts apps/douyin-mini/src/ui-contracts.test.ts`

Expected: FAIL，当前页面仍包含上传和生成完整流程。

- [x] **Step 3: 实现只读详情**

使用 `fetchPublishedStyleDetail` 加载单条素材，只展示图片、标题、标签、说明和发布时间；保留
骨架屏、错误页、重新加载、隐藏/显示请求隔离和图片失败占位。

- [x] **Step 4: 验证详情测试通过**

Run: `bun test apps/douyin-mini/src/pages/rendering-style-detail/page.test.ts apps/douyin-mini/src/ui-contracts.test.ts`

Expected: PASS。

### Task 5: 清理抖音上传和生成客户端能力

**Files:**
- Delete: `apps/douyin-mini/src/api/rendering-jobs.ts`
- Delete: `apps/douyin-mini/src/api/rendering-jobs.test.ts`
- Delete: `apps/douyin-mini/src/api/rendering-uploads.ts`
- Delete: `apps/douyin-mini/src/api/rendering-uploads.test.ts`
- Delete: `apps/douyin-mini/src/platform/private-image.ts`
- Delete: `apps/douyin-mini/src/platform/private-image.test.ts`
- Delete: `apps/douyin-mini/src/platform/rendering-recovery.ts`
- Delete: `apps/douyin-mini/src/platform/rendering-recovery.test.ts`
- Modify: `apps/douyin-mini/src/app.ts`
- Modify: `apps/douyin-mini/src/state/session.ts`
- Modify: `apps/douyin-mini/src/state/session.test.ts`

- [x] **Step 1: 写失败静态契约**

增加检查，要求抖音源码不再声明 `/douyin-mini/renderings/uploads`、
`/douyin-mini/renderings/jobs` 或 `getRenderingRecoveryIdentity`，并更新 session 测试移除只为
效果图手机号授权提供的 `acceptVerifiedSession` 场景。

- [x] **Step 2: 验证静态契约按预期失败**

Run: `bun test apps/douyin-mini/src/ui-contracts.test.ts`

Expected: FAIL，客户端模块和应用恢复入口仍存在。

- [x] **Step 3: 删除孤立能力**

删除四组专用模块及测试，从应用上下文移除恢复身份方法，从通用 session manager 移除仅被
该链路使用的已验证会话注入方法。后端接口保持不变。

- [x] **Step 4: 验证无悬空引用**

Run: `rg -n "rendering-uploads|rendering-jobs|private-image|rendering-recovery|getRenderingRecoveryIdentity|acceptVerifiedSession" apps/douyin-mini/src`

Expected: 无输出。

### Task 6: 完整验证与提交

**Files:**
- Modify: `docs/superpowers/plans/2026-09-17-douyin-0139-review-scope.md`

- [x] **Step 1: 运行抖音完整检查**

Run: `bun run --cwd apps/douyin-mini check`

Expected: 全部测试与 TypeScript 检查通过。

- [x] **Step 2: 运行 API 受影响检查**

Run: `bun test apps/api/src/services/customer-rendering/catalog.test.ts apps/api/src/repositories/customer-rendering-catalog.test.ts && bun run --cwd apps/api typecheck`

Expected: 测试和类型检查通过。

- [x] **Step 3: 检查提审文案和源码边界**

Run: `rg -n "AI 装修问题助手|AI 概念图|AI 效果图|renderings/uploads|renderings/jobs" apps/douyin-mini/src`

Expected: 无输出。

- [x] **Step 4: 检查差异并提交**

Run: `git diff --check && git status --short`

Expected: 无空白错误，变更只覆盖设计范围。提交信息：
`fix(douyin): 收敛0.1.39提审功能范围`。
