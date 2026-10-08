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
