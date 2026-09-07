# H5 客户线索联调与发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成开发环境 H5 增量部署、获授权业务联调和微信真机验收，形成生产发布放行依据。

**Architecture:** 复用已有 migration、Release Dev 和统一客户线索接口，不修改业务架构或绕过发布检查。gooes 负责后端部署与证据，orange 由小程序团队负责；生产发布为独立确认步骤。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase migrations、GitHub Actions、微信小程序。

---

## 后续状态更新（2026-09-06）

用户随后要求生产发布并确认小程序生产版已发布。后端已通过正式流程完成 `v2026.09.06.2` 的生产迁移及 API/Admin 发布，详见[生产发布记录](../../operations/evidence/2026-09-06-h5-customer-leads-production-release.md)。以下保留原计划与当时状态；未执行的开发联调、完整业务及真机验收不因生产发布完成而标记通过。

## 边界与已知事实

- 本计划不授权执行迁移、部署、业务写入、账号权限调整或小程序发布。
- 目标提交：`18de9a170123a9f73edd1c61b060df359d27ee39`；现有标签 `v2026.09.06.2`。标签仅用于固定源码，目标环境由工作流选择，禁止调用生产工作流代替开发工作流。
- 开发 API：`https://api-dev.goodcms.cn`；Admin：`https://admin-dev.goodcms.cn`。
- 最近核对的成功开发部署为 `176ba328`，运行 `34031461533`。
- H5 自动部署运行 `34035775139` 因开发库缺少 `20260906121818` 被拦截，API/Admin 部署跳过；此为检查时事实，执行前重新核查。
- 小程序只有本地候选构建，39 项本地测试通过为团队报告，不等于正式体验包、真实接口联调或真机通过。
- 生产候选构建和只读预检成功不等于生产部署；当前不放行生产。

## 文件与责任

- Read: `.github/workflows/migrate-dev-database.yml`、`.github/workflows/release-dev.yml`、`.github/workflows/verify-dev-migration-history.yml`、`.github/workflows/deploy-dev.yml`。执行前完整阅读对应流程。
- Read: `supabase/migrations/20260906121818_tenant_h5_customer_leads.sql` 及预检发现的其他待应用 migration。
- Read: `docs/2026-09-06-h5-customer-leads-miniprogram-handoff.md`。
- Read only: orange 的 `docs/2026-09-06-h5-customer-leads-miniprogram-compatibility.md` 与 `docs/2026-09-06-h5-customer-leads-integration-acceptance-status.md`。
- Create at execution: `docs/operations/evidence/2026-09-06-h5-customer-leads-dev-release.md`，记录实际版本、迁移、部署和脱敏验收证据，不覆盖历史记录。
- 不改 orange，不新增依赖，不因发布失败顺手改业务代码或工作流。

### Task 1：确认开发发布范围并重新预检

- [ ] 获得仅开发环境迁移与 API/Admin 发布的明确确认；该确认不包含业务线索变更。
- [ ] 运行 `git status --short --branch` 和 `git rev-parse v2026.09.06.2^{commit}`，确认目标为上述完整 SHA，保留用户未提交文件。
- [ ] 运行 `gh run view 34035775139 --json headSha,jobs,url`，核查原失败节点，并检查是否已有后续成功部署，避免重复操作。
- [ ] 执行只读计划：

```bash
gh workflow run migrate-dev-database.yml --ref v2026.09.06.2 -f mode=plan -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
bun run supplier:purchasable-sku:migration:list:dev-direct
```

- [ ] 核对新运行的 headSha、开发目标和全部 pending migration；预期包含 `20260906121818`。若还有未评估项，停止并逐项评估，不默认批量放行。连接失败不能绕过环境保护。

### Task 2：迁移开发库并发布 API/Admin

- [ ] 阅读待应用 SQL，确认影响、正式流程备份及恢复条件。回退采用新前向 migration 保留跟进历史、来源事实、客户关联和版本，不删除数据或重置版本；不能仅回退 API 就假定旧写入口安全。
- [ ] 仅在 Task 1 的目标、清单和授权匹配后执行：

```bash
gh workflow run migrate-dev-database.yml --ref v2026.09.06.2 -f mode=apply -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

- [ ] 等待该次迁移成功，再运行 `bun run supplier:purchasable-sku:migration:list:dev-direct`；要求 Local/Remote 全部对齐，失败即停止，不伪造 migration history。
- [ ] 执行开发发布：

```bash
gh workflow run release-dev.yml --ref v2026.09.06.2 -f operation=release -f service=api,admin -f reason='H5客户线索开发联调；不发布生产'
```

- [ ] 核对该次运行 SHA、开发镜像 digest、migration gate、API/Admin 部署和健康检查全部成功。只发布 API/Admin，不重跑会扩大服务范围的全量自动发布。
- [ ] 使用既有开发 smoke 账号按正常登录流程检查统一列表、`source=h5`、`source=douyin_miniapp`、详情及分页候选。只读取必要字段，不保存 token、手机号、客户对象；401 不算业务成功，空列表不算 H5 数据验收通过。
- [ ] 写入发布证据，向小程序团队交付地址、完整 SHA、迁移状态、运行链接和检查结果。

### Task 3：明确可变更测试资源

- [ ] 由用户/测试负责人指定测试租户、正常登录账号、H5 与抖音测试线索 ID、可分配员工及允许操作范围；不得把已有 smoke 登录权限当作任意数据变更授权。
- [ ] 准备不同权限与 self/department/all、跨租户测试角色；缺失角色由授权管理员配置，不自行扩大权限。
- [ ] 若没有可用线索，先确认隔离测试数据方案。涉及直接初始化数据按版本化 migration 管理；通过产品接口生成也须先获测试数据写入授权，不手工 SQL 修库。
- [ ] 分配、跟进、转客户、判无效分别安排测试线索，避免终态操作阻断后续用例；说明跟进和来源事实会保留，不能承诺无痕清理。
- [ ] 指定真机操作人，由其正常登录；凭证不进入聊天或文档。

### Task 4：正式验收包与真实联调

- [ ] 小程序团队冻结适配源码和构建配置，生成可复现的正式体验/验收包，登记包版本、源码提交及构建指纹；不能只用当前未提交源码的 HEAD 代表 H5 版本。
- [ ] 固定配对的 API SHA 与验收包，在授权数据上验证混合来源、分别筛选、清空、分页、历史 H5 及空活动信息。
- [ ] 验证 H5 分配、无预约普通跟进、转已有/新客户、判无效；跟进三个预约字段均为 null，检查历史、版本和客户查看权限。
- [ ] 验证 409 刷新重确认、连点防重、网络结果未知时原键重试、写成功读失败不重复写、权限与租户隔离；并发和断网模拟仅作用于指定测试范围。
- [ ] 真机操作人记录设备、系统、微信/基础库版本，验证小屏、键盘、弹层、返回刷新和断网重试，提供脱敏结果。
- [ ] 对每项记录通过/失败/未执行；存在失败或未执行项不宣称整体验收通过。新缺陷先定位根因，再单独确认修复范围。

### Task 5：生产放行检查

- [ ] 双方确认真实联调和真机验收通过，以及已上线小程序的混合来源兼容性；本地包或体验包通过不代表存量生产客户端兼容。
- [ ] 若需先发布兼容包，确认旧后端期间不会发送尚不支持的 H5 筛选；现候选会显示筛选，不能未经检查就假定可提前上线。
- [ ] 再次核对生产候选、全部 pending migration、备份/恢复方案、服务范围及发布窗口，获得生产发布明确确认。
- [ ] 仅按正式生产流程执行迁移、Local/Remote 对齐检查、API/Admin 发布及上线验证。任何门禁失败暂停，不能复用旧预检结论强行放行。

## 完成标准

开发部署证据完整，指定测试资源已授权，正式包与 API 版本可追溯，真实接口及真机矩阵通过，生产存量客户端兼容及发布窗口已确认。计划编写本身不计为其中任何一步已执行。
