# AI 模型路由后台重整本地验证证据

**日期：** 2026-09-12

**验证基线：** `9363ebe80298bc71f39b9b7816c38cb854bc4068`

**验证范围：** Gooes API、Admin、Supabase migration 合同及 mock 浏览器流程

**结论：** 计划规定的本地 API、Admin 和仓库卫生检查均通过；开发数据库迁移、开发发布和真实业务端到端生图不属于本记录，留待 Task 10。

**证据级别：** 本地可复跑摘要。验证批次于 2026-09-12 完成，首个证据提交时间为 `2026-09-12T15:26:06+08:00`；浏览器截图文件时间为 `15:22:04` 至 `15:22:45 +08:00`，环境指纹采集于 `15:28:40 +08:00`。工作流 run ID、开发镜像摘要、部署 revision 和健康检查等远端不可变证据留待 Task 10。

## 1. 根因与变更边界

### 1.1 业务根因

- 供应商、模型和场景的内部编码暴露给操作人员填写，系统身份与供应商调用名称混在一起。
- 供应商连接维护与其模型清单脱节，缺少“供应商 -> 模型”的完整工作区。
- 场景路由只能使用固定场景，`runtime_status=not_connected` 又会锁住模型配置，无法提前为“装修生图”绑定模型。
- 已登记模型、远端目录不支持、目录请求失败和目录为空共用模糊状态，管理员无法判断是重试还是手动输入调用名称。
- Endpoint 没有统一为 Base URL，旧标准推理路径存在重复拼接风险；模型模态与路由绑定也需要数据库级并发保护。
- 真实密钥写入与供应商的密钥引用缺少清晰边界，删除供应商、版本冲突、旧绑定和只读权限的反馈也不完整。

### 1.2 实施边界

- Supabase migration 代码：扩展统一场景注册表、自定义场景版本和状态、系统编码不可变约束、模型业务唯一键、模型与路由模态复合外键、受限的自定义场景原子 RPC 及相应权限；本轮只验证了静态合同，没有在 PostgreSQL 中执行这些约束或 RPC。
- API：在现有 controller/service/repository/gateway 分层内增加分页场景与模型接口、服务端编码、Endpoint 规范化、供应商验证、手动多模态模型解析和安全错误映射。
- Admin：重整超管 AI 模型路由页为供应商主从工作区和场景路由工作区；补齐独立密钥配置、供应商删除、模型分页、场景分页、自定义场景、主备模型和手动模型交互。
- Runtime：统一文本与火山方舟图片调用的 Base URL 语义；非文本场景在文本网关边界提前拒绝。
- 验证：组件/API 测试、migration 静态合同、mock Chromium 回归和响应式截图。

本次没有修改 orange 仓库，没有加入 Anthropic Format/SDK，没有增加模型删除，没有执行生产发布，也没有扩大到微信/抖音小程序业务代码。

### 1.3 验证期间发现并修复的测试隔离问题

首次按计划组合运行 API 测试时，结果为 221 pass、1 fail、1065 次断言、exit 1。失败用例是 `safe responses and logs exclude input even for unknown keys, extra fields and malformed JSON`：合法 PATCH 预期 HTTP 200、实际 HTTP 500。最小组合 `bun test src/services/ai-gateway.test.ts src/controllers/ai-config/secret-settings.test.ts` 在修复前为 42 pass、1 fail、exit 1，而密钥 controller 文件单独运行为 3 pass、0 fail。

根因是 `services/ai-gateway.test.ts` 的模块级 `mock.module("@/services/system-settings")` 污染同一 Bun 进程中的密钥 controller 测试依赖，不是生产密钥写入逻辑本身失败。

提交 `9363ebe80298bc71f39b9b7816c38cb854bc4068`（`fix(ai): 隔离网关测试依赖`）移除全局模块覆盖，改为实例级依赖注入，同时保持生产默认依赖。修复后最小组合为 43 pass、0 fail、138 次断言、exit 0；随后重新从计划规定的原始 API 组合命令开始执行本节以下全部验证，最终为 222 pass、0 fail、exit 0。

## 2. 本轮完整验证结果

所有结果均来自基线 `9363ebe80298bc71f39b9b7816c38cb854bc4068` 上的重新执行；表中的 exit code 是命令实际退出码。

| 检查 | 原样命令 | 结果 | Exit code |
|---|---|---:|---:|
| API 精确回归 | `cd apps/api && bun test src/services/ai-config src/controllers/ai-config src/repositories/ai-config.test.ts src/repositories/ai-provider-delete.test.ts src/schema/ai-config.test.ts src/schema/ai-config-scene-routes.test.ts src/services/ai-gateway.test.ts src/gateways/ark-rendering/client.test.ts src/services/ai-system-scene-registry-migration.test.ts` | 222 pass、0 fail、1078 次断言、25 个文件 | 0 |
| 测试隔离最小组合 | `cd apps/api && bun test src/services/ai-gateway.test.ts src/controllers/ai-config/secret-settings.test.ts` | 修复后 43 pass、0 fail、138 次断言、2 个文件 | 0 |
| API 静态检查 | `bun run api:check` | TypeScript 无输出错误；Bun 构建 984 modules，`app.js` 5.14 MB；API 文件阈值 500 行，0 个豁免 | 0 |
| Admin 组件回归 | `cd apps/admin && bun test components/platform-ai` | 66 pass、0 fail、390 次断言、11 个文件 | 0 |
| Admin 静态检查 | `cd apps/admin && pnpm run check` | 1600 个 TS/TSX 文件均不超过 500 行；`next typegen` 和 `tsc --noEmit` 通过 | 0 |
| Admin 浏览器回归 | `cd apps/admin && pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts` | Chromium 31 passed，1 worker，约 1.2 分钟 | 0 |
| 空白字符检查 | `git diff --check` | 无输出，未发现空白错误 | 0 |
| 仓库文件大小 | `bun scripts/check-file-size.ts` | API 阈值 500 行、0 个豁免；Admin 1600 个 TS/TSX 文件通过 | 0 |
| 工作区状态 | `git status --short` | 首个证据提交后仅出现下述未跟踪 readiness 文件；它未纳入提交 | 0 |

### 2.1 验证环境

- Bun `1.3.2`
- Node.js `v24.11.1`（Playwright 的本地 mock backend 和 Next.js 测试服务器使用）
- pnpm `10.33.0`
- Playwright `1.60.0`
- 浏览器：Google Chrome for Testing `148.0.7778.96`，Playwright browser build `chromium-1223`
- 操作系统：macOS `15.7.2`，build `24G325`，`arm64`
- 时区：Asia/Shanghai（UTC+08:00）

### 2.2 工作区观测

`git status --short` 在首个证据提交 `766ea638c7ca828419047080b94e22ad1af140f1` 完成后的实际输出为：

```text
?? docs/operations/evidence/2026-09-12-ai-admin-ark-readiness-recheck.md
```

该 readiness 文件未纳入首个证据提交，本次补充也不暂存它。因为它未被 Git 跟踪，Git 没有可比较的历史基线，不能仅凭 `git status` 证明其内容从未变化；Git 可验证的事实只有提交清单不包含它。“操作过程没有以它为编辑目标”是执行者声明，不是 Git 能独立证明的结论。

## 3. Migration 身份与数据库验证边界

待应用 migration：

```text
supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql
```

SHA-256：

```text
11e0fd4e1160394af7cbf45cd6c7e972bd91a51e77818a9efcf8288ca64f1e75
```

本地静态合同测试已覆盖 migration 中的自定义场景、编码不可变、权限、模型模态复合外键和 nullable 路由绑定约束。数据库级 fixture `supabase/tests/ai_model_routing_admin_redesign_migration.sql` **未执行**：本机没有 `psql`，Docker CLI 虽存在但 daemon 不可连接，`supabase status` 因同一原因退出 1。因此本文档不声明 migration 已在真实 PostgreSQL 中执行，也不声明自定义场景 RPC 的事务原子性或数据库约束已得到运行时证明。

这是发布前高风险边界：migration 同时涉及触发器、函数、ACL、唯一性和跨表外键。Task 10 的 plan/apply 与迁移历史核对未通过前，禁止把当前本地结果视为可发布数据库证据。

### 3.1 Task 10 开发发布工作流

目标开发项目 ref：`fclnkyatvfvmzgzdqlba`。冻结分支：`release/ai-model-routing-admin-dev-20260912`。只允许操作开发环境，生产环境不在范围内。

Task 10 必须按以下顺序执行：

1. 在功能分支确认工作区仅剩已知 readiness 未跟踪文件，创建/更新 `release/ai-model-routing-admin-dev-20260912` 指向当前 40 位 release SHA，并以 `--force-with-lease` 推送该发布分支。
2. 从该发布分支触发 `migrate-dev-database.yml`，参数为 `mode=plan` 和 `confirm_dev_project_ref=fclnkyatvfvmzgzdqlba`；核对 plan workflow head SHA 等于 release SHA，且唯一 pending migration 是 `20260912100000`。
3. plan 成功后，以同一 ref 和项目确认值触发 `mode=apply`；核对 apply workflow head SHA 仍等于同一个 release SHA，随后从该 run 日志中的 migration list 证据确认 Local/Remote 均包含 `20260912100000`。
4. migration 成功后，从同一发布分支触发 `release-dev.yml`，参数为 `operation=release`、`service=api,admin`；核对 release workflow head SHA 仍等于同一个 release SHA，可信编排必须先成功发布 API，再发布 Admin。
5. 在开发 Admin 完成无付费 smoke：密钥不回显；Seedream 模型为图片模态；装修生图可保存并在刷新后保留绑定；自定义文本场景获得 `scene_` 编码；有模型引用的供应商删除仍被阻止。不得点击收费图片测试。
6. 将 plan/apply/release run ID、release SHA、镜像 digest、container revision、健康响应、migration list 和 smoke 结果追加到本文档，提交发布证据后再推送功能分支。

对应的远端触发命令为（本轮未执行）：

```bash
release_branch='release/ai-model-routing-admin-dev-20260912'
gh workflow run migrate-dev-database.yml --ref "$release_branch" \
  -f mode=plan -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
gh workflow run migrate-dev-database.yml --ref "$release_branch" \
  -f mode=apply -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
gh workflow run release-dev.yml --ref "$release_branch" \
  -f operation=release -f service=api,admin \
  -f reason='AI模型路由后台交互重整，先migration再发布开发API和Admin'
```

每次 dispatch 后立即用以下命令锁定最新 run ID、等待结论并读取完整日志；plan、apply、release 三个 run 的 `headSha` 都必须等于发布前记录的同一个 `release_sha`：

```bash
gh run list --workflow <workflow-file> --branch "$release_branch" \
  --commit "$release_sha" --event workflow_dispatch --limit 1 \
  --json databaseId,headSha,status,conclusion
gh run watch <run-id> --exit-status
gh run view <run-id> --log
```

plan/apply 的 pending migration 和 Local/Remote migration list 以 `migrate-dev-database.yml` 对应 run 的完整日志为准；镜像 digest、container revision、发布顺序和健康响应以 `release-dev.yml` 对应 run 的日志与编排器输出为准。记录时必须同时写入 run ID 与 head SHA，避免把其他提交的结果误归到本次发布。

失败判据：工作区出现非预期变更、release SHA/远端分支不一致、plan/apply/release 任一 run 的 head SHA 不等于冻结 release SHA、pending migration 不是且仅是 `20260912100000`、任一 workflow 非 success、Local/Remote 未对齐、发布未遵循 API 后 Admin 的顺序，或任一 smoke 断言失败，均必须停止后续步骤并调查；不得绕过 migration-history gate，不得以本地静态合同替代开发数据库结果。

设计目标是让 migration 增量兼容，静态合同测试已通过；但上一版应用与迁移后 schema 的跨版本兼容、回滚部署和前向修复流程均未在本轮实测。Task 10 如需回滚，应优先重新部署上一版 API/Admin 并保留新增数据库对象和数据；数据库问题只能通过另一个经审查的前向 migration 修复，不得直接删除自定义场景、路由、函数、约束或表字段。

## 4. 浏览器证据

浏览器测试使用本地 mock backend，截图位于 Playwright 的本地 `test-results` 目录（该目录是临时测试产物，不纳入本提交）。本轮实际路径和 PNG 尺寸如下：

- 装修生图桌面路由：`apps/admin/test-results/ai-provider-secrets/ai-model-routes-未接通装修生图可绑定图片模型且刷新保留-chromium/route-seedream-desktop.png`，1440 x 1000，SHA-256 `e9bd47bae84becb23e5118a4e2d14c5f8cdc08d39f209c3406e0ef315264c290`。
- 供应商/模型 400px 窄屏：`apps/admin/test-results/ai-provider-secrets/ai-model-inspection-400px页面无横向溢出且长模型ID限制在局部区域-chromium/provider-models-mobile-400.png`，400 x 1134，SHA-256 `68fb497729c8cda07971ac39d7e38f886cd4a9ddc2d36afdac15516df776bde7`。
- 密钥错误 400px 窄屏：`apps/admin/test-results/ai-provider-secrets/ai-provider-secrets-已登记的新密钥引用可预先配置，失败不自动重试且窄屏可操作-chromium/provider-secret-mobile-error.png`，400 x 1134，SHA-256 `89029d6ee0dea51e91d805eea399504ab75e78193f0792fbc09ddf8538df2481`。
- 供应商删除冲突 400px 窄屏：`apps/admin/test-results/ai-provider-secrets/ai-provider-delete-关联冲突保留弹窗、显示停用提示且不重复提交，窄屏可操作-chromium/provider-delete-mobile-conflict.png`，400 x 1134，SHA-256 `2e7b3466f700cfa14b7e476a662dff767abe226e8dd7d7e94737dd454f0c0e12`。
- 密钥已配置桌面状态：`apps/admin/test-results/ai-provider-secrets/ai-provider-secrets-真实密钥独立保存，空白不写，关闭清空，结果未验证-chromium/provider-secret-configured.png`，1280 x 720，SHA-256 `c9d0d047759826abe921adfbeb628992edafe781b3506ba9b76c243f6e67ae74`。

这些截图会被后续同配置 Playwright 运行覆盖，不是长期归档附件；哈希只能在对应临时文件仍存在时复核，不能替代 Task 10 的长期发布证据。路径、尺寸和哈希取自上述 31 项回归结束后的即时文件检查。命令结果可用第 2 节原样命令复跑，migration 哈希可在仓库根目录执行 `shasum -a 256 supabase/migrations/20260912100000_rework_ai_model_routing_admin.sql` 独立核对。

31 项浏览器回归还覆盖：主备模型独立分页与搜索、场景分页、迟到响应隔离、手动 Seedream、自动场景编码、自定义场景维护、只读权限、旧绑定保留、目录候选、保存锁、供应商删除、密钥安全输入、系统编码拒绝和跨页供应商上下文。

## 5. 密钥、费用与外部调用声明

- 验证过程中没有显示、读取或写入任何真实供应商密钥；测试只使用合成值和 mock 响应，本文档不包含鉴权请求头或密钥值。
- 执行者声明：本轮主动运行的命令没有配置或发起火山方舟、OpenRouter 或其他模型供应商的真实推理请求；这不是整机级网络审计结论。
- 没有触发文本计费或图片生成费用，没有生成真实效果图。
- “验证连接”与目录发现均由单元测试或本地 mock backend 验证；这不是开发环境真实鉴权 smoke。

浏览器回归中的连接验证用例通过 `page.context().on('request', ...)` 收集该用例 BrowserContext 发出的全部请求 URL，并断言不存在 host 为或隶属于 `volces.com`、`openrouter.ai` 的请求，也断言不存在路径包含 `/images/generations` 的请求；mock backend 的写入账本同时断言两个请求都只到本地 `/validate`，没有路径包含 `generations`。这能证明该浏览器用例没有向上述供应商外联或提交生图路径，但不是整机级抓包，也不外推为开发环境真实请求结论。

## 6. 已验证与未验证结论

本地测试结果表明：系统编码归服务端维护、供应商/模型和场景列表保持有界分页、密钥 UI 不回显、供应商与模型工作区可操作、`not_connected` 装修生图可预绑定图片模型、候选失败可手动输入、主备绑定可独立维护，以及自定义场景原子创建的应用合同和 migration 静态合同测试均通过。这里的“合同通过”不等于数据库 RPC 原子性、约束执行或上一版兼容性已在真实 PostgreSQL 中验证。

本地证据**不证明**：migration 已应用到开发数据库、真实火山方舟密钥有效、真实 Seedream 请求可成功、Admin 配置已被微信/抖音小程序业务链消费，或“上传房型图 -> 生图 -> 装修建议”端到端流程已经打通。Admin 配置验证不等于业务端到端生图验证；这些边界必须由 Task 10 的开发 migration、发布与 smoke，以及后续小程序联调继续确认。
