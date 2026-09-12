# 未接通场景模型浏览验证

日期：2026-09-12。范围：本地 `feature/customer-rendering-library`，基线 `0c30fab27`。未发布开发或生产环境。

## 根因与修复

- `not_connected` 同时禁用了供应商/模型区域并提前终止候选查询；原 image 过滤还会隐藏登记为 text 的模型，导致既不能配置，也无法了解原因。
- 新增可选 `view=inspect` 查询，仅复用供应商内的有界分页查询，不强制 active/modality，不创建手工候选、不查外部目录。原读取权限、供应商状态校验保持。
- 未接通场景展示只读登记模型列表，提供名称、调用 ID、输入/输出模态、probe 状态和不匹配原因。沿用 Admin 组件与信息层级，将当前绑定摘要和浏览列表分开。
- 浏览供应商、关键词和页码不改变当前主备绑定。删除正在浏览的无关供应商只清浏览状态，保存其他字段直接保留原主备 ID，不触发模型 resolve。
- 服务端/数据库的未接通场景绑定保护未改动；没有 migration、真实模型数据修正、密钥变更或云模型调用。

## 测试证据

RED：

- schema/service 初测 15 pass / 2 fail：inspect 参数被丢弃，内部 21 条模型被合成手工候选扩成 22 条。
- UI 静态断言捕获供应商按钮仍被 disabled。
- 浏览器首轮 29 pass / 1 fail：删除浏览供应商后，原绑定错误变为“尚未绑定主模型”。修复后该用例通过。

GREEN：

- `bun test src/schema/ai-config.test.ts src/schema/ai-config-scene-routes.test.ts src/services/ai-config/index.test.ts src/services/ai-config/scene-routes.test.ts src/repositories/ai-config.test.ts`：34 pass，144 assertions。
- API `bun run typecheck`：通过。
- Admin `pnpm --dir apps/admin check`：文件大小检查、路由类型生成、TypeScript 检查通过。
- Admin `bun test components/platform-ai`：31 pass，183 assertions。
- 实现代理完整 Playwright 回归：30 pass，包含原 26 项及新增 4 项；桌面补图单项 1 pass。
- 主审独立重跑 `pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts --output test-results/ai-model-inspection-final`：30 passed（1.1m），exit 0。
- 新增用例覆盖未绑定可见信息、主备非空原绑定保持、分页/空结果、错误重试、主备迟到响应、保存锁和删除浏览供应商。
- 主审已目视核对 400px 窄屏和 1440px 桌面截图，长调用 ID 换行、绑定与浏览信息分开。

截图在本地测试输出目录（不纳入 Git）：

- `apps/admin/test-results/ai-provider-secrets/ai-model-inspection-未绑定生图可查看唯一文本模型和不匹配原因，400px无溢出-chromium/unbound-inspection-mobile.png`
- `apps/admin/test-results/ai-model-inspection-desktop/ai-model-inspection-删除正在浏览的其他供应商不清空生图原绑定-chromium/bound-inspection-desktop.png`

独立 spec review：PASS。独立代码质量审查：Ready to merge，未发现 Critical 或 Important 问题。`git diff --check` 通过。

## 验证边界

浏览器使用本地真实 Admin 页面加模拟 API，不是开发环境超管实连，也没有验证方舟推理 Key 或模型开通状态。页面明确标注登记信息不代表实际调用能力；本修复不表示装修生图已接通。需要后续发布 API 和 Admin 才会在开发后台生效。
