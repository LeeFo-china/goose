# D1 调拨 API 实施计划

使用 executing-plans、test-driven-development 和 requesting-code-review。在既有隔离 worktree 执行已确认 D1 设计，不开启租户调拨、不授予权限、不修改已 apply migration。

本批目标：把已应用的五个 RPC 接入严格的 repository → service → controller，提供四个分页/详情/设置读取及四个幂等命令 HTTP 接口。金额保留字符串，调拨不依赖 project.read，审批、管理、库存读取权限分离。

为保持小步可验证，API 拆为：本批核心端点；下一批库存来源投影及开关配置（需要独立新 migration，连同兼容读取验证后才允许开启）；随后 Admin。本批不开放开关写入口，不把核心端点完成称作 D1 全量可用。

- [x] 用真实 RPC 回包形状编写失败测试：分页、字符串精度、严格解析、身份派生、权限隔离、命令回执不预读、错误映射及 HTTP 边界。
- [x] Domain 增加订单/摘要/明细/设置/命令结果 DTO；repository 只调用已有 RPC，统一错误包装，分页边界复用请求 schema。
- [x] Service 注入 repository，校验员工和租户身份及独立权限，白名单错误码映射；不查询可变开关来阻断成功回执重放。
- [x] Controller 注册显式 GET/POST，不注册通用 CRUD；补入主路由及 tenant-service 能力分类。
- [x] 静态检查通过后跑 Fastify 注入 smoke；回归领退料和设置。独立审查并修复有效问题，再提交推送 feature。

验证命令（测试在 apps/api 内执行）：`bun test src/schema/warehouse-transfers.test.ts src/repositories/warehouse-transfers.test.ts src/services/warehouse-transfers.test.ts src/controllers/warehouse-transfer-routes.test.ts`；`bun run check`；Domain `bun run build`。无新增依赖，无远端业务写入。

实际结果及批次边界见 `docs/operations/evidence/2026-09-09-warehouse-transfer-dev-release.md`。核心 API 在 feature 单独提交，未包含在冻结开发发布中；库存来源与开关配置保持下一批。
