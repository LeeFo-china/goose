# D1 核心 API 批次验证

基线 `21f48c4f717a9ccc73e0f06dca7460509e33cdda`；在 `feature/warehouse-project-material-stage-c` 实施，仅修改 gooes 隔离工作区。本批代码未发布 DEV。

## 交付

- Domain 新增订单、摘要、明细、设置及命令结果 DTO。
- Repository 对接已 apply 的五个 RPC，返回严格解析，所有数量／金额保持字符串；100 行汇总金额允许 18 位整数，不误用单行 numeric(18,2) 上限。
- Service 从认证上下文派生租户／用户／员工；管理、审批、库存读分离，不要求 project.read。成功命令重放不预读可变设置或版本，数据库执行最终门禁。16 个数据库领域错误映射为稳定错误码，未知错误保留 DB_ERROR。
- 注册四个 GET（列表、设置、详情、明细）及四个 POST（保存、提交、完成、取消）。无通用 CRUD，分页默认 1/20，上限 100，拒绝伪造身份与成本字段。
- 补入实际主路由和 tenant-service 能力分类，未绕过 read/write 服务访问限制。

## 验证

- TDD：repository/service 新测试先因未实现模块 24 fail，接入后 24 pass / 71 assertions。
- 类型检查首次定位两个测试类型错误：Fastify `route.config` 可选、AuthContext.authUserId 为 string。按真实类型修正可选访问及空字符串无效身份用例，没有使用 any 或绕过类型检查。
- Domain `bun run build` 成功，`bun test src/warehouse-transfer.test.ts src/inventory.test.ts` 2 pass / 7 assertions。
- API `bun run check` 成功（类型检查、977 modules 构建、500 行限制）。
- API 回归 70 pass / 0 fail / 2123 assertions，涵盖调拨 schema/repository/service/controller、既有领退料、设置兼容和全量主路由注册。
- 独立代码审查：无 Critical/Important/需要修改的 Minor；审查者另跑 34 pass / 0 fail，核对 SQL 参数／返回字段、金额范围、权限和路由。

HTTP 测试为本地 Fastify 注入，认证及外部 RPC 使用受控替身；不是登录真实租户后的数据库全链路验收。真实 SQL 的原子性、并发、权限与分页性能由前一批隔离数据库 fixtures 验证。本批未创建任何远端业务单据。

## 剩余门禁

下一批实现库存流水调拨来源投影和开关配置，涉及数据库只能新增 migration，不修改 `20260908185501`。之后再做 Admin 和真实开发租户验收。当前开关仍 false，不能把核心 API 提交或上一个数据库发布等同于 D1 全量上线。
