# 手动创建租户的服务商资料初始化修复

## 根因

天喜租户 `8440bb1e-8b6c-44cb-9ef0-5558b0460609` 为 active / platform_manual，生产 `tenant_service_provider_profiles` 中无记录。全库按创建来源和状态统计，缺少资料的租户仅这一条。

`create_tenant_with_default_template` 创建租户、组织和管理员后直接返回，遗漏公开资料草稿；入驻申请审核 RPC 则单独插入草稿。2026-07 的历史补齐仅执行一次，无法覆盖之后的超管新建租户。资料接口据实返回 404，导致页面不可编辑。故障与试用范围和员工操作权限无关。

## 修复与边界

迁移 `20261008084500_initialize_manual_tenant_service_provider_profile.sql`：

- 保留现有创建 RPC 的参数、校验、权限与组织初始化，仅在返回前同事务创建资料草稿。
- 新资料使用租户自身名称及已有地址，状态 draft / version 1；不把联系人或管理员登录号码自动填入公开电话，不生成服务区域，不自动提交或发布。
- 为现有 active 或 platform_manual 租户补齐缺失资料；`ON CONFLICT DO NOTHING`，已有草稿、审核、发布状态与内容均不覆盖。
- 入驻审核流程继续独立创建自己的草稿，不增设全表触发器，不改变审核规则。
- 无 API/Admin 代码变更，无需重新构建应用；当前页面在重新读取资料后即可编辑。

非破坏性迁移。若需回退，在后续迁移恢复旧创建 RPC；保留已经补齐或编辑的资料，禁止删除用户后续填写内容。

## 验证

隔离容器 `gooes-manual-trial-db`：

- 新增 SQL 回归在修复前复现 `manual tenant is missing its service-provider draft`，修复后通过。
- 真实 SQL 验证新建 active/suspended 租户草稿、名称地址映射、公开电话为空、无服务区域、草稿编辑及版本冲突、不完整资料拒绝提交、重复开户不遗留资料。
- `python3 supabase/tests/manual_tenant_service_provider_backfill.py` 通过：运行实际迁移主体两次，缺失资料补齐，既有资料及第一次补齐的 id/version/时间戳均不改变。全套 fixture 事务回滚。
- 既有 `manual_tenant_trial.sql` 通过；`full_business_trial.sql` 通过，覆盖原子开户、失败回滚、7 天宽限、权限边界与试用范围调整。
- 本地隔离库初次全业务试用回归使用了旧 RPC，出现试用管理权限可开户失败；补应用此前已上线的 `20261008072135` 后通过，与本次修改无关。
- `git diff --check` 通过。本次只有 migration/SQL/Python 测试和文档，无 TypeScript 变更。

本地 Supabase 镜像的 supautils 会话钩子在特定权限拒绝测试中存在既知崩溃，测试会话沿用既有 runner 的禁用钩子方式；数据库 ACL、约束和事务不变。未修改生产钩子设置。

## 发布并发边界

独立审查指出旧建户事务若在补齐扫描时尚未提交，可能越过补齐扫描。因此发布时记录应用前时间，迁移后先确认早于此时间开始的其他 client backend 事务已结束，再核对目标范围缺失资料为 0。若出现跨越发布窗口的遗漏，追加版本化补齐 migration 后再次验收；未达到条件前不宣告完成。不为低频建户增加全表触发器或暂停全部租户业务。

## 生产结果

- 来源提交 `4872a740d83d8b654a03330c3ad180b4b380220d`，Tag `v2026.10.08.11`。
- [迁移预检 37751715108](https://github.com/LeeFo-china/goose/actions/runs/37751715108)：656 已应用，仅待应用 `20261008084500`。
- [迁移应用 37751954271](https://github.com/LeeFo-china/goose/actions/runs/37751954271)：成功应用 1 条，共 657 条；检查时间 `2026-10-08T08:46:45Z`。
- 已实际运行 `supabase migration list`，再通过 `scripts/verify-migration-history.mjs` 确认本地/远端 657 条逐条对齐。
- 应用前记录数据库时间；完成后早于该时间开始的其他 client backend 事务为 0，eligible 缺失 profile 数为 0。
- 生产 profile 数新增 1 条。应用前已有的 7 条资料逐条行内容摘要一致，没有被覆盖。
- 天喜资料 ID `87da3c81-cf86-4936-a046-364a274ecf24`，draft / version 1 / public_phone=NULL / published_at=NULL。
- 在当前生产 API 容器中，以实际员工权限上下文调用 `tenantServiceProvidersService.getTenantProfile` 和分页区域查询，正确返回目标租户资料，现有区域数量为 1。只读验证，未修改资料或提交发布。
- 未发布应用镜像；原有页面完整刷新后可读取补齐资料。未代用户完成公开电话、地址等业务资料填写，也未提交审核。
