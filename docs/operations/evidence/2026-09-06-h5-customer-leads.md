# H5 客户线索本地交付验证

日期：2026-09-06。基线：main `82f99c84`。工作分支：`feature/h5-customer-leads`。

## 已交付范围

- 租户 H5 与抖音共用统一客户线索 API、权限、分页、四类命令和原表记录；H5 安全活动上下文，历史 ID/状态/关联/版本保留。
- Admin 来源混合/筛选、活动详情、旧跟进摘要；营销 H5 原表保留查看，跳统一详情；旧写入口 409。
- 保留公开 H5 采集，包括身份客户与联系电话不同的既有行为；租户重复提交不能改绑已有关联。
- [小程序交接文档](../../2026-09-06-h5-customer-leads-miniprogram-handoff.md) 含接口、字段、权限、分页、失败处理、orange 文件定位、发布窗口、验收和可转发话术。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| domain build、tsc、dist 校验 | 通过；146005 bytes，外部 Zod 身份保留 |
| domain H5 来源测试 | 1 passed / 5 assertions |
| customer-lead-foundation 离线契约 | 77 checks passed |
| API 定向回归（统一 + 原抖音 + H5 旧写/采集） | 67 passed / 312 assertions，0 fail |
| API TypeScript、构建、500 行文件限制 | 通过；构建 957 modules / 约 5 MB |
| Admin 定向单测 | 10 passed / 47 assertions，0 fail |
| Admin route typegen + TypeScript | 通过 |
| Admin 500 行文件限制 | 1382 TS/TSX files，通过 |
| Admin Playwright | 10 passed，约 39 秒；固定 loopback mock，无真实接口写入 |
| H5 + 完整旧抖音 SQL smoke | exit 0，最后 ROLLBACK |
| SQL 后独立查询 | schema_rolled_back=t，fixtures_rolled_back=t |
| git diff --check | 通过 |

API 测试文件：repositories 下 tenant-customer-leads、tenant-douyin-leads、tenant-douyin-leads-errors、tenant-douyin-leads-budget-range；services 下 tenant-customer-leads、tenant-customer-leads-core、tenant-douyin-leads、tenant-douyin-leads-access、tenant-douyin-leads-public、marketing-pages/legacy/leads-events；controllers/tenant-douyin-leads/index。均为显式选定的测试文件，未执行可能持久写库的旧 database.test helper。

复跑主要命令（各包命令应在对应目录执行）：

```bash
bun run --cwd packages/domain build
bun test packages/domain/src/customer-lead-h5.test.ts
bun run scripts/check-customer-lead-foundation.ts
bun run --cwd apps/api typecheck
bun run --cwd apps/api build
bun run --cwd apps/api check:file-size
bash scripts/smoke-h5-customer-leads.sh green
```

Admin 目录：

```bash
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc -p tsconfig.typecheck.json --noEmit
node scripts/check-file-size.mjs
bun test components/customer-leads components/marketing/h5-leads-table.test.tsx
env -u NO_COLOR node node_modules/@playwright/test/cli.js test --config playwright.customer-leads.config.ts
```

隔离 worktree 复用主工作区已安装依赖，不安装/改变依赖版本；worktree domain/dist 独立生成。首次 Admin `check` 因 worktree 未链接 `.bin` 而无法找到 next，已通过上列真实安装路径执行等价的 typegen/tsc；文件限制脚本需在 Admin 目录运行，不能从仓库根扫描无关包。

## 数据库红绿与边界

初始 RED：H5 普通跟进在旧命令核心返回 DOUYIN_LEAD_NOT_FOUND。最新 GREEN 在同一固定本地容器事务中应用前置 migration、新 migration、fixtures，执行后 ROLLBACK，不更新远端 migration history。

真实历史 fixture 在新 migration 之前创建 new/contacted/converted/invalid 四种状态；应用后比较完整行，确认历史 ID、客户关联、负责人、原备注和 version 无变化，无伪造跟进。已有客户转化前后也比较完整行，负责人、阶段等保持。

复审中发现并先复现、后修复：

1. 平台 tenant_id NULL H5 意外受版本/归属约束影响 → 仅保护租户 H5，保留平台原行为，且原租户记录不能清空租户绕过。
2. service_role 可以删除无 ledger 的 H5 → 禁止直接删除，表所有者维护及已有事实外键不放松。
3. 预绑定客户改手机号，转换触发隐式 guard 500 → 写客户之前明确 409，既有绑定不变、无新建客户副作用。
4. 有效身份客户 A、表单电话 B 在新 guard 失败 → 撤回采集阶段新增的手机号相等限制；仍要求同租户、关联不可变；分配/普通跟进可用，转换不匹配仍 409。

同时覆盖四命令、版本冲突/幂等重放及载荷冲突、旧抖音 RPC 对 H5（含重放）拒绝、跨租户员工/客户/预约拒绝、H5 无预约、来源事实不可变且去重、公开采集重提保留工作流。

5000 条本地 H5 合成数据 EXPLAIN：混合/负责人分页命中 index-only scan，约 0.02–0.04ms；关键词查询优化器选择顺序扫描，约 10ms。此结果不是生产容量保证，上线应按真实租户规模复核查询计划与索引创建时间。

## UI 验收与审查

浏览器 10 项覆盖：分页与窄屏、全部混合来源及 H5 筛选、H5 深链接活动详情及普通跟进、操作成功刷新失败仅重读、转换无客户查看权限、分配后失去 read、无效原因、409 刷新、旧抖音入口、新入口无权限。

旧 H5 表额外静态渲染测试确认保留原客户/备注并输出原 ID 的统一链接，无原写按钮。已查看浏览器生成的 H5 详情及 390px 窄屏截图；截图位于 worktree `apps/admin/test-results/customer-leads/`（测试产物，不纳入源码提交）。

独立数据库规格审查、复审/质量检查均通过；API/Admin 质量复审通过；交接文档经独立读者检查可实施。保留一个非阻塞界面细节：H5 普通跟进表单仍复用“不关联预约”选项及空预约说明，提交不强制预约，后续可单独简化展示。

## 未做事项

未修改 orange，未改主工作区用户的扫码文档，未推送、未合并 main、未部署、未发布 domain 包、未应用远端 migration。生产待后端与小程序团队协调兼容窗口；不能把本地验证误认为生产已接入。没有运行远端 migration list，因为本轮没有远端应用；正式应用前后必须检查 Local/Remote 状态。
