# 仓库项目领料与退料 Stage C Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement each task, then independently review specification compliance and code quality. Checkboxes record verified completion, not intended work.

**Goal:** 完成仓库领料到项目、项目退料回原仓库、项目净成本与库存联动的 API/Admin 本地可验证闭环。

**Architecture:** 延续已确认的仓库 MVP 设计：独立领料/退料单；controller/service/repository 分层；PostgreSQL 原子命令统一校验权限、状态、幂等、数量和成本；不可变库存及成本事件。Admin 复用采购供应和库存组件。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase PostgreSQL migrations、Next.js、shadcn/ui。

**Approved design:** `docs/superpowers/specs/2026-09-05-warehouse-procurement-inventory-mvp-design.md` 第 4.3–4.5、5.5–13 节；用户已确认执行阶段 C。

## 执行边界与具体规则

- 仅 gooes；不修改其他现有 worktree 或 orange。开发基线 `ad22e9e7`，分支 `feature/warehouse-project-material-stage-c`。
- 本轮交付代码、migration、对接说明和隔离验证。不自动将新 migration 应用远端，不开启实际租户、不写真实采购或财务单据，不部署。
- 阶段 B 实际环境完整采购/收货/付款验收继续作为上线门禁；本轮使用现有 schema 的只读副本和合成业务数据验证。
- 一张领料单只绑定一个仓库、一个项目；单据最多 100 行，所有列表/明细/选项分页 20、最大 100。没有库存预留，最终可用量由完成命令判断。
- 领料状态 `draft -> submitted -> completed`；草稿或待确认可取消，完成不可编辑/取消。保存草稿为完整明细替换，单据版本及幂等键保护重试。
- 领料按确认时移动平均成本扣库；最后出清使用余额剩余价值消除分币尾差。数量四位、金额两位、平均成本四位；客户端不提交成本或成本分类。
- 成本分类从现有 SKU/商品默认配置解析并冻结在领料明细；配置缺失或不属于本租户时阻断提交。
- 退料单绑定一张已完成领料单和原仓库/项目；明细引用原领料明细，允许分次退料。每行可退量=领料量−所有已完成退料量，完成命令在锁内重算。
- 退料状态 `draft -> completed`，草稿可取消。退料成本按原领料金额累计比例计算本次应退金额，末次退清带走余数；不按当前库存平均价冲项目成本。
- 完成领料/退料在一个事务内更新单据、库存流水/余额、项目成本事件、命令回执；任何一步失败全部回滚。绝不产生新的供应商应付或现金事件。
- 项目成本新增 `event_direction=increase|decrease`，历史默认 increase；新增仓库来源与真实来源外键，兼容采购来源原有严格约束。报表/预算读取按方向核算净成本，采购单专属成本读取仍限采购来源。
- SQL 全局锁顺序延续 settings → warehouse → order，再以固定顺序锁余额和原领料明细；同键同载荷重放原回执、异载荷冲突、版本冲突无副作用。
- 管理操作要求 `inventory.issue.manage`，完成要求 `inventory.issue.approve`；全部读写要求目标项目 `project.read` 及现有项目数据范围，员工/租户身份一致。库存成本读取另遵守现有 `inventory.stock.view`。不借用 `project.update`。
- 阶段 C 提供独立租户开关 `warehouse_materials_enabled`，默认 false，遵循现有平台 settings 命令的版本、依赖、审计、兼容及重放规范。关闭禁止新业务写入，成功命令重放和历史读取保留。

## Task 1 — 数据库单据、权限与原子库存命令

**Files:** 新增 `supabase/migrations/*_warehouse_material*.sql`（通过 `supabase migration new`）；新增 `scripts/fixtures/warehouse-stage-b/material-*.sql`；必要时小幅扩展 `scripts/verify-warehouse-stage-b-database.ts` 以运行并发夹具；新增迁移契约测试。

- [ ] 先编写隔离 SQL 验收，证明新单据/命令尚不存在；记录 RED。
- [ ] 新建 `warehouse_issue_orders/items`、`warehouse_return_orders/items`、命令回执和独立开关；tenant 复合外键、索引、强制 RLS、service-role-only RPC、私有 helper ACL。
- [ ] 实现有界读取及草稿、提交、完成、取消命令，遵循上述规则；返回明确的单据、版本和可追溯成本字段。将真实 RPC 参数/结果契约交给后续 API 任务。
- [ ] 改造成本事实以兼容仓库来源，补齐数据库聚合的净成本语义。
- [ ] 真实隔离 PostgreSQL 验证收货→领料→分次退料、尾差、余额流水一致、项目净成本、无新增应付、跨租户/项目权限、停用仓库/关闭开关、版本/重放、失败回滚及并发超领/超退。
- [ ] 运行现有 receipt-accounting 回归，确保项目直采和仓库入库兼容；独立规格与质量审查后提交。

## Task 2 — Domain、API、成本汇总与开关入口

**Files:** `packages/domain/src/warehouse-material.ts`、根导出；`apps/api/src/schema/warehouse-materials.ts`；`repositories/warehouse-material-{records,commands,reads}.ts`；`services/warehouse-materials.ts`；`controllers/warehouse-{issues,returns}/index.ts`；现有租户路由能力映射；平台和租户 supplier-settings；`repositories/finance-project-summary-supplier-totals.ts`；准确生成/同步变更数据库类型。

- [ ] 编写失败测试覆盖 strict schema、成本字段拒绝、分页上下限、权限交集、项目越权、重复命令、错误映射以及净成本。
- [ ] 读取 API：`GET /warehouse-issues[/:id[/items]]`、`GET /warehouse-returns[/:id[/items]]`；新增项目选项使用现有项目数据范围/分页机制；退料明细可读原领料数量及剩余可退数量。
- [ ] 写 API：`POST /warehouse-issues/:id/{save-draft,submit,complete,cancel}` 和 `POST /warehouse-returns/:id/{save-draft,complete,cancel}`；使用期望版本及幂等键，HTTP 只处理身份、校验和响应。
- [ ] Repository 严格解析 RPC 返回、金额字符串、来源/单据关系；Service 编排真实权限，错误统一 `Errors`，不吞异常或使用裸 Error。
- [ ] 将 `warehouse_materials_enabled` 贯通平台读取/写入、租户 supplier-settings 及领域类型；历史客户端省略时保留值。
- [ ] 净成本汇总 `increase=+amount, decrease=-amount`，验证旧采购、领料及退料混合数据；查清所有成本事实消费者的语义。
- [ ] Domain build、API typecheck、定向测试、路由全量分类、权限/文件门禁；独立规格和质量审查后提交。

## Task 3 — Admin 领退料与库存来源

**Files:** 新增 `apps/admin/components/warehouse-materials/` 下 API、类型、状态、工作台、列表、详情、草稿编辑、确认操作组件；库存工作台/来源展示；平台租户开关及领域类型；相关路由和业务组件测试；专用 Playwright fixture/config/spec。

- [ ] 读取 admin-design 与 shadcn 技能、现有库存和采购单实现。保留当前库存筛选简化成果，复用现有业务组件和命令未知结果恢复模式。
- [ ] “仓库库存”提供项目领料/退料入口，支持分页搜索、详情和状态过滤；默认仓库、分页 SKU/项目选择、数量编辑、成本只读。
- [ ] 领料草稿/提交/确认/取消，已完成领料发起退料，展示每行剩余可退数量及关联原单。权限与服务开关控制操作；后端仍最终校验。
- [ ] 版本冲突刷新后重新确认；网络未知结果保留冻结载荷/幂等键供重试；成功刷新失败只重读，不重复提交。
- [ ] 库存来源展示领料/退料单号并按真实权限跳转；平台新增独立开关，遵守依赖/审计和历史读取。
- [ ] 最小静态检查先行，再以真实页面+确定性 HTTP fixture 测桌面/375px 完整创建、确认、退料、权限、失败/重试、分页和竞态；截图人工核验。
- [ ] 独立规格与质量审查后提交。

## Task 4 — 集成验证、性能和交付证据

**Files:** `docs/miniprogram/2026-09-08-warehouse-material-stage-c-api-handoff.md`；`docs/operations/evidence/2026-09-08-warehouse-material-stage-c.md`；必要的隔离 API/SQL smoke 夹具。

- [ ] 在隔离数据环境连接真实 API 执行领料/退料链路，核对库存、成本、应付、原项目采购兼容；不得拿纯 mock 替代数据库过账证据。
- [ ] 大数据分页/项目范围/来源读取 EXPLAIN 验证索引及扫描边界；并发连接验证最终出库和退料限额。
- [ ] 验证 Domain build、API check、Admin check/build、相关定向测试及浏览器 smoke。React mock 测试按既有隔离策略逐文件执行。
- [ ] 对接文档写明路径、权限、状态、开关、幂等/版本、金额精度、错误码和可执行验收示例；不改 orange。
- [ ] 汇总准确证据与发布待办，完成最终独立审查。只在上述本地交付证据完整时声明阶段 C 实现完成；远端发布/开关操作另按明确授权执行。
