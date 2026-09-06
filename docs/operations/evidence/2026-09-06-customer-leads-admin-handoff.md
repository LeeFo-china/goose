# 客户线索 Admin 与小程序交接验证记录

后续开发环境发布已完成，见 [开发发布记录](./2026-09-06-customer-leads-dev-release.md)。下文保留 Task 6–7 完成时的历史状态，“未提交/未部署”不代表当前发布状态。

日期：2026-09-06。执行已确认计划 Task 6–7。分支 `feature/customer-leads-foundation`，基线 HEAD `28d1ae3761766093d3cffe2c8547c743e5e7c202`。本轮及前轮功能均仍在未提交工作区；没有 commit、push、npm publish、远端部署或数据库写入。

## 交付内容

- 新 Admin `/customer-leads`，按 `customer_lead.read` 展示菜单和页面，来源、分配状态、状态、负责人、日期、关键词筛选及分页。
- 共享工作台移到 `apps/admin/components/customer-leads/`，旧目录七个文件保留薄兼容导出。固定 profile 决定路径、权限、输入和严格返回校验，不由请求任意传入。
- 旧 `/douyin-miniapp/leads` 与 `douyin_lead.*` 不变。旧新增跟进仍要求预约；新入口普通跟进默认预约为空。
- 分配、跟进、转客户、标记无效、服务端 actions 禁用原因、客户跳转权限、预算/AI/预约/跟进分页均保留。通用列表 DTO 没有预算和预约摘要，列表提示到详情查看，不发起逐行补查。
- `@gooes/domain` 版本升级为 `1.20.0`；只交付本地 tarball，不宣称 registry 已发布。
- 更新 [小程序交接](../../2026-09-06-customer-leads-miniprogram-handoff.md)，新增 [完整 JSON 示例](../../customer-leads-api-examples.json)、完整业务错误码、制品校验和、客户端工作清单、分工和验收矩阵。

## 静态与定向回归

| 检查 | 本轮实际结果 |
|---|---|
| `bun run --cwd apps/admin typecheck` | exit 0 |
| `bun run --cwd apps/admin check:file-size` | exit 0，1376 TS/TSX 文件均不超过 500 行 |
| Admin 定向 Bun 回归 | 42 pass / 0 fail，173 assertions，4 文件 |
| `bun run --cwd packages/domain build` | exit 0，145981-byte index.js，external Zod |
| `bun run --cwd packages/domain verify:packed-consumer` | exit 0，真实 tarball 安装后的声明与运行时验证 |
| `bun scripts/check-customer-lead-foundation.ts` | 77 条离线断言通过 |
| `bun run api:typecheck`、`bun run api:build` | exit 0，API 957 modules |
| JSON 样例校验 | 7 组命令请求/结果通过 domain schema；5 组列表/详情/预约/跟进读 DTO 通过 Admin strict adapter；3 项业务错误匹配目录 |
| `git diff --check` | exit 0 |

Admin 定向命令：

```bash
bun test --cwd apps/admin components/customer-leads/leads-workbench-profile.test.ts components/douyin-miniapp/leads-workbench.test.ts components/douyin-miniapp/leads-workbench-paging.test.ts 'app/(console)/douyin-miniapp/leads/page.test.ts'
```

包括新旧严格 DTO/权限/路径、nullable 跟进、来源与分配条件、客户投影、disabled 原因、提交 gate、幂等意图、请求先后顺序和两类分页。测试过程中按 TDD 增加新回归时短暂红灯不算验收通过，表格记录修订后主代理重新运行的最终结果。

没有运行整个 Admin 全量测试或 production build。前轮记录的 inventory 权限分组既有失败未在本轮修改；本轮通过的是上述明确范围，不宣称全仓库测试全绿。

## 浏览器验证

复用已安装 Playwright 与项目隔离 Next 启动脚本。新增：

- `apps/admin/playwright.customer-leads.config.ts`
- `apps/admin/e2e/customer-leads-mock-backend.mjs`
- `apps/admin/e2e/customer-leads-workflow.spec.ts`

从 apps/admin 执行：

```bash
env -u NO_COLOR pnpm exec playwright test --config=playwright.customer-leads.config.ts
```

前置 typecheck/file-size 成功后运行。修订后首次完整通过 8 passed (29.0s)；随后加强分配失权与刷新失败的组合路径，再次 typecheck 后完整运行，最终 **8 passed (28.1s)**：

1. 21 条合成记录的 20/1 分页，来源/分配筛选、空状态、390px 窄屏布局。
2. 无预约普通跟进成功，列表刷新失败后只重试读取，写命令 journal 仍为一次。
3. 转客户成功但 `can_view_customer=false`，没有客户详情链接或强制跳转。
4. 分配成功后详情 404 且列表刷新失败，收起详情；通过操作弹窗重试读取后关闭，写入仍只有一次。
5. 标记无效必须填写原因，携带版本和幂等键。
6. 409 显示明确提示；“刷新后重新确认”只读取，不自动再次写入。
7. 仅旧权限可打开旧入口，旧跟进仍必须选择预约，新入口拒绝。
8. 没有 read 权限不请求线索或负责人数据。

范围：真实 Next 页面、React/Radix 交互和 BFF，后端是绑定 127.0.0.1:3988 的纯内存 fixture；Admin 在 127.0.0.1:3038。没有 Supabase 连接，没有真实租户账号或远端写操作。测试结束按项目脚本关闭服务并清理本次隔离构建目录；next-env.d.ts、tsconfig.json 没有残留变更。

截图位于本机忽略目录 `apps/admin/test-results/customer-leads/`（不会随 Git 交付），主代理已查看桌面列表、窄屏空状态及跟进弹窗。截图生成于各自测试的 outputPath，可重跑生成；Playwright 下一次运行会先清理旧 output，最终一次运行后已重新核对四张 PNG 与 `.last-run.json` 实际存在。宽表使用内部横向滚动，窄屏保留筛选及分页，未宣称已经完成微信真机验收。

## 发现与根因修复

首次浏览器执行 5 pass / 3 fail，保留以下根因，不以强制点击或跳过断言掩盖：

- 普通跟进刷新失败和旧跟进提交时，操作按钮超出 viewport。根因是旧固定居中 Dialog 没有高度限制，表单及错误提示撑高后不能滚动。共享线索 Dialog 增加 86dvh 上限，正文滚动，标题/页脚不收缩；同一浏览器路径复跑通过。
- 409 错误丢失具体语义。根因是工作台 catch 将 backend-client 已保留的 status/code 全部替换为通用失败。现在识别客户线索/旧抖音错误，冲突后只读取、要求用户重新确认；网络未知结果仍保留原版本和幂等键。
- 已接受命令后的详情读取可能清空 detail，原重试入口依赖 detail 导致无法重新同步。现保存动作 lead ID，刷新模式不依赖成功读取的 detail；分配后 404 和刷新失败路径得到浏览器覆盖。
- 窄屏第一张截图捕获了既有 shell padding 过渡的中间状态。未改全局 shell；浏览器断言增加等待实际标题几何尺寸稳定，再截图检查，避免用 overflow-hidden 假通过。

## Domain 制品

文件：`/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.20.0.tgz`。

SHA-256：`f7cd89002cea94b713825f32edccf365fc5252fba940ebd3d38bcfcd4c97a5f0`。

打包命令（先 build / packed consumer）：

```bash
npm pack ./packages/domain --ignore-scripts --pack-destination .artifacts/domain
shasum -a 256 .artifacts/domain/gooes-domain-1.20.0.tgz
```

旧 prepack 会调用 clean 删除 packages/domain 下的历史 tarball。验证脚本现显式 build 后使用 npm pack --ignore-scripts，在 mkdtemp 目录安装/检查/清理，避免删除已交付包。`packages/domain/gooes-domain-1.19.0.tgz` 本轮前后 SHA-256 都为 `5d93b52f790c27dca5959a52ef08adad6b1a40be581ef130efcb0a468ebe0d02`，旧制品保留。

packed consumer 新增客户线索输入/输出/分页/详情类型编译，以及无预约默认值、未知来源和超限分页拒绝、权限映射、错误码、客户 ID 隐私一致性及共享 Zod 实例检查。审查代理独立逐字节核对最终 tarball 163 个成员与当前包构建/README/metadata 一致，不只验证另一份重打包产物。

## 审查与剩余边界

- Task 6、Task 7 均经过独立规格审查，再进行代码质量审查。修订后 Admin 审查通过；交接审查提出的员工选项排序和错误样例说明两处精度问题已按实际代码修正。
- 按 admin-design/shadcn/impeccable 保留既有工作台密度和组件，修正弹窗可达性；按 miniprogram-handoff 输出精确契约并保持 orange 只读。本轮未更改 orange 文件/依赖/构建/Git。
- 两项客户线索 migration 前轮已应用 api-dev。本轮没有改动已应用 migration 或再次应用；579 条 Local/Remote 对齐是前轮证据，不冒充本轮实时检查。
- 尚未发布远端 API/Admin，未提交源码、推送或发布 registry 包。不能凭本轮本地浏览器通过宣称开发环境已上线。
- 下一步仍是明确发布提交及 API 基地址、部署后新旧接口 smoke，再由 orange 团队安装制品、实施小程序页面并进行真机/双账号并发验收。
