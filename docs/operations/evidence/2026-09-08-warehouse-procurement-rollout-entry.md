# 仓库采购平台开关实现与验证记录

日期：2026-09-08。

本文件记录最初的本地实现阶段。用户后续授权的 main 合并、开发迁移/部署及安全清理已完成，
最新状态见 [开发发布记录](./2026-09-08-warehouse-rollout-main-dev-release.md)；租户开关仍关闭。

## 授权与状态

用户确认本地实现 [已确认设计](../../superpowers/specs/2026-09-07-warehouse-procurement-rollout-entry-design.md)。
实现工作位于 `feature/warehouse-procurement-inventory-stage-b`，源码基线 `a7fef0cc`；实施计划提交 `8f7c6bdb`。

当前状态：本地实现、最终验证及独立规格/质量审查均通过；不可据此认定入口已部署或租户已开启。

本轮不执行远端 migration、API/Admin 发布、实际开关操作、员工授权、采购或财务写入、main 合并或工作树清理。
Orange 保持只读；原 Stage B `.artifacts/` 保留。

## 根因及交付契约

数据库已有 `warehouse_procurement_enabled` 列，但平台严格 HTTP schema、平台读取 select、
原子命令参数和 Admin 卡片未串联该字段。仅加一个前端 Switch 无法完成操作。

- 入口：平台租户详情的供应商模块，在采购批次 Workflow 后增加“仓库采购”。
- 写接口：`PATCH /platform/tenant-supplier-settings/:tenantId`，既有平台身份及 `platform.supplier.manage`。
- 字段：`warehouse_procurement_enabled`，显式布尔值；旧请求省略字段时保留当前值。
- 小程序读接口：既有 `GET /supplier-settings`，缺失/false 时不开放新增仓库补货。
- 不变式：父级依赖、单次版本递增、原始载荷幂等、真实前后状态审计、旧签名与历史回执兼容。
- 关闭不删除库存或单据，不扩展为阻断既有应付/付款结算。

## 已执行基线检查

工作目录 `apps/api`：

```sh
bun test src/schema/supplier-settings-command.regression.test.ts src/repositories/platform-supplier-settings.regression.test.ts src/services/supplier-rollout-settings.test.ts
bun test src/services/platform-suppliers.regression.test.ts src/services/supplier-rollout-settings-migration-contract.test.ts
bun run typecheck
```

结果：分别 11/11、20/20，通过；API typecheck exit 0。

工作目录 `apps/admin`：

```sh
bun test components/platform-tenants/tenant-supplier-settings-rules.test.ts
```

结果：3/3，通过。随后一次 Admin check 与新增 RED 测试重叠，因规则联合类型尚未实现新字段而失败，
不能用作既有基线失败或最终通过证据；实现后必须重新执行。

本地 `supabase_db_gooes` 和 PostgreSQL 测试镜像可用。数据库测试复用
`scripts/verify-warehouse-stage-b-database.ts`：只读取本地 schema/ACL，在无网络且无宿主卷的临时容器中写合成数据。
不运行会直接在本地源库建夹具的旧 `supplier-rollout-settings-database.test.ts`。

## 本次实现与 TDD

- HTTP 可选布尔值不默认 false；平台读取 select/DTO、写 RPC 参数、审计前后状态包含仓库字段。
- 新增 migration：`20260908010000_extend_warehouse_procurement_rollout_command.sql`。
  两个旧签名和一个显式仓库签名委托到 owner-only 原子核心；三个公开签名仅 service_role 可调用。
  原始字段是否存在参与指纹；省略值在行锁内解析，旧事件不重写。
- 每个接受的新键命令按旧语义递增一次版本，包括状态值相同的命令；完全重放不递增。
- Admin 待确认请求冻结序列化 body、版本、目标租户和 key，重新读取不会解锁另一操作。
  明确版本冲突后刷新并重新确认使用新 key；成功后读取失败只重读。
- 生成类型只同步隔离库验证过的新增 RPC 重载和私有核心，没有同步无关历史漂移。

实现代理记录的 RED：API schema/repository/rollout 9 通过、4 失败，平台 service 9 通过、1 失败，
Admin rules 2 通过、1 失败，请求快照 0 通过、1 失败；隔离 SQL 在新增 migration 前报
`warehouse rollout overload missing`。失败分别对应缺少字段、读取解析、依赖规则、参数/审计及请求构造器，
不是靠跳过测试完成实现。

主代理最终 API 定向回归：合并运行 46 项通过（包含 12 项旧 migration 契约回归）；
Admin rules/request snapshot/interactions 18 项通过。
API `bun run check`（类型、打包、文件门禁）exit 0；Admin `bun run check && bun run build` exit 0。

## 隔离 PostgreSQL 验证

```sh
bun scripts/verify-warehouse-stage-b-database.ts scripts/fixtures/warehouse-stage-b/rollout-command.sql
```

主代理独立复跑 exit 0。本地只读 schema 基线 `20260828160000`，527 条历史；在临时容器回放采购域所需迁移。
新增 migration 应用前使用真实旧实现创建两个历史命令，应用后验证：

- 在正常应用前，对同一迁移于 COMMIT 前注入确定异常，要求 psql 以预期错误及状态 3 退出。
  断连回滚后逐项比对函数定义、ACL、owner/config、配置行、事件及迁移历史完全不变，新重载/核心不存在；
  再正常应用并继续全部夹具。此项独立于业务命令的事件失败回滚；主代理最后复跑确认通过。
- 三个实际签名及新增参数的数据库元数据，固定 search_path、精确 ACL、核心不对 service_role 暴露。
- 原配置行不被 migration 改变，新配置默认仓库采购 false。
- 双旧签名省略保留、历史回执在状态变化后重放、跨签名及异载荷 key 冲突。
- 启停依赖、旧客户端不能关父级、版本冲突、前后状态与版本审计、事件写入失败整笔回滚。
- 三条真实数据库连接观察到锁等待；原 key 并发重放、不同 key 的版本竞争、跨签名相同 key 冲突。
  断言只有一条事件和一次版本推进。

临时容器已自动清理。此验证不等于完整 593 条开发历史升级或真实 API/业务验收。

## 浏览器失败诊断

首轮桌面/375px 共 14 项：9 通过、5 失败，未跳过失败用例。

1. 测试以“待确认提示暂时消失”判断命令完成，但保存中的提示也会隐藏；后端版本已经被另一模拟操作推进，
   不能充当该请求完成信号。改为轮询真实请求记录数量并等待重试入口退出。
2. 408 在 Chromium 的真实连接上触发自动重试，页面最终只收到幂等重放的 200，故不能期待未确认提示。
   独立本地 HTTP 实验：Node fetch 为 1 次请求/408；Chromium fetch 为 2 次请求/200。
   对页面 408 分支使用 Playwright 在真实模拟写入后覆写一次响应；独立实验验证页面收到 408、上游写入一次。
   不修改生产代理或关闭浏览器正常传输机制。

第二轮 13/14 通过：手机宽度截图等待 toast 消失超时。核对已安装 Sonner 源码，鼠标停留会暂停自动消失；
测试移开鼠标后使用原 10 秒等待，不延长超时或修改业务组件掩盖问题。

最终主代理运行 `bun run test:e2e:supplier-rollout`：14/14 通过，44.2 秒。
覆盖相邻启停、只读、版本冲突重新确认、503/408/429 未知结果及原请求重放、成功后只读恢复。
主代理检查桌面与 375px 仓库启用截图，控件无水平溢出、文字自然换行；手机截图左下角 Next 开发指示器
局部覆盖文字，属于开发测试台，不作为生产样式证据。

独立规格复核：SPEC COMPLIANT，无遗留规格问题。
随后独立质量审查：PASS，无 Critical、Important 或可执行 Minor 发现。
审查范围包含基线 `8f7c6bdb` 后完整差异及新增 migration、SQL 夹具、请求快照测试；
质量审查只读，不替代主代理的运行验证。

## 发布门禁

- [x] 本次新增契约与行为测试通过。
- [x] 真实隔离数据库验证兼容、幂等、依赖、ACL、原子性、迁移失败回滚及并发。
- [x] API/Admin 静态检查及构建通过。
- [x] 本地 Admin 桌面/375px 交互验证。
- [x] 独立规格审查、质量审查通过。
- [ ] 用户另行确认新增 migration 的远端应用清单。
- [ ] 开发应用前后 migration list/dry-run 对齐、固定版本发布。
- [ ] 获授权的平台操作人通过正式入口操作目标开发租户。

最后三项属于后续授权和发布阶段，本轮不能勾选。

后续发布顺序：先另行核对并确认远端待执行 migration 清单，应用数据库兼容项并核对历史，
再发布同一受审版本的 API/Admin，最后由具备 `platform.supplier.manage` 的平台人员通过正式入口
按依赖顺序开启获授权的目标开发租户。小程序继续读取既有 `GET /supplier-settings`，
不通过本次平台写接口改开关；只有实际环境返回有效的 `warehouse_procurement_enabled=true`
才进入仓库补货联调。当前文档不能代替该环境的真实接口或真机验收记录。

## 独立待办

仓库/批次列表越界 500、采购角色读取配置所需 `supplier.view`、采购审批身份及真实收货/应付去重、
小程序真机验收，不属于本次开关入口实现的完成声明。生产尚不放行。
