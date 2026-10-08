# 完整业务试用与范围调整实施计划

用户已确认执行上一轮方案。目标：超管新建租户可选择完整业务或自定义模块；租户列表和试用管理可调整当前试用范围；完整试用覆盖租户业务模块，同时保持独立计费、权限和隔离。

## 固定接口约定

沿用 scope `{ version: 1, capabilities: [...] }`，保留六个 core 值，新增七个值：
`business.marketing`, `business.finance`, `business.procurement`, `business.inventory`, `business.content`, `business.ai`, `business.settings`。
完整业务是上述全部 13 项的显式快照，不是绕过校验的通配符。导出 `PLATFORM_SERVICE_TRIAL_FULL_SCOPE`、`PLATFORM_SERVICE_TRIAL_CAPABILITY_LABELS` 供界面复用。历史六项 scope 保持有效，不自动扩大现有租户范围。

- 新建租户现有 `trial` 对象新增可选 `scope`。无 scope 继续旧 RPC；有 scope 调用新 RPC `create_platform_tenant_with_trial_scope`，参数同旧 RPC 加 `p_trial_scope jsonb`。一次事务建户+grant，宽限期固定7天。
- 新增 `PUT /platform/billing/service-trials/:id/scope`，请求 `{scope, expected_version, idempotency_key, reason}`；响应沿用 commandResponse；RPC `platform_service_trial_update_scope(p_trial_id,p_actor_employee_id,p_expected_version,p_idempotency_key,p_scope,p_reason)`。
- 同其他试用管理使用 `platform.service_trial.manage` 权限并在数据库重新校验平台身份；scope编辑适用于 scheduled/active/grace_period。保留开始/结束/宽限期和延期次数，递增版本，保存 before/after scope 审计，幂等键和乐观锁保护。不通过范围调整恢复expired/revoked/converted记录。
- `available_actions.update_scope` 提供可操作性。租户列表复用 service_access.trial_id 获取试用详情后检查该动作，不能错误复用 can_extend 作为授权。
- AI/OCR/视频/短信仍走现有计费与赠送额度入口，不新增免费无限额度、不降低任何支付/权限/企业核验前置条件。界面明确告知完整业务开放不等于按量资源免费。

## 实施与验证

- [x] 主代理：共享领域能力目录、全路由盘点、按模块明确映射、回归 trial/grace/expired 和计费隔离。
- [x] 数据库子任务：migration扩展scope验证；范围调整RPC、审计枚举、新建scope RPC；本地真实SQL验证身份、幂等、冲突、期限保持、原子性与7天宽限。
- [x] API子任务：controller/service/repository/schema贯通，租户新建传scope；有效权限和错误包装、接口测试。
- [x] Admin子任务：复用shadcn组件，完整/自定义选择器；新建租户、审批/授予、策略、试用详情/租户列表范围调整入口；交互状态和契约验证。
- [x] 集成：API/Admin类型检查构建、定向回归、浏览器smoke、独立代码审查。
- [x] 发布：先兼容migration（不写入新范围到既有事实），再API/Admin部署；确认migration list对齐。使用新入口给天喜补齐完整范围，其他现有试用不改；生产只读业务接口验证。

回滚：保留新范围事实与审计；禁止回退到只认识六项范围的运行时。可通过新入口收回新增模块或forward migration恢复映射/停用调整入口；保持试用期限、付费额度与历史审计不变。

生产验收记录：`docs/operations/evidence/2026-10-08-full-business-trial.md`。天喜已由六项扩展为十三项，日期保持不变。登录绑定未变，租户端页面仍需管理员重新登录后验收。
