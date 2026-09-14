# 平台超管客户生图额度管理页设计

日期：2026-09-14。面向平台超级管理员，为单租户试点额度提供可核对、可审计的操作入口。用户已授权按此前建议执行：从租户管理选择租户，查看额度与用量，修改限额和开关，填写原因，处理版本冲突并查看审计。

## 入口与页面

- 从 `/platform/tenants` 选择租户，在租户详情进入 `/platform/tenants/{id}/rendering-settings`。不新增全租户额度列表，避免逐租户读取设置导致 N+1；现有租户列表已提供分页和搜索。
- 页面仅对 `is_platform_super_admin` 会话发起数据请求和展示操作；后端 GET/PUT 仍分别校验平台超管身份。没有权限时显示明确状态，不泄露配置数据。
- 页首显示租户名称、状态和返回租户详情入口。当前配置区显示试点开关、每日任务上限、日预算、单任务预占、版本和更新时间。未配置时显示关闭状态及空值。
- 当日用量区显示北京时间的日期、已准入任务数及已占用预算；占用预算与准入 RPC 一致，按每个任务的 `coalesce(actual_cost_fen, reserved_cost_fen)` 汇总。
- 修改表单以“元”录入金额，客户端精确转换为整数分，并遵守现有后端边界：任务数 1–10000，金额 1–100000000 分，单任务预占不超过日预算，原因 3–240 字。保存时提交从 GET 获取的 `expected_version`，不允许盲写。启用按钮文案明确显示“保存并开启”，关闭显示“保存并关闭”。
- 并发修改返回 409 时保留输入，提示刷新核对；成功后刷新当前配置、用量与审计。初次配置可先保存关闭状态，不自动开启付费任务。
- 最近审计记录按租户和资源类型过滤，最多显示 10 条，展示时间、操作人、原因和版本/开关变化。审计为空、接口错误和加载中均有可辨状态；不展示原始 metadata JSON。

## 数据与边界

- 复用 `GET/PUT /platform/customer-rendering-settings/:tenantId`。新增 `GET /platform/customer-rendering-settings/:tenantId/usage`，只返回当天单租户的 `budget_date`、`task_count`、`budget_used_fen`，不返回客户任务或图片。
- 使用版本化 migration 新增 `service_role` 专用只读 RPC；以既有 `(tenant_id, budget_date)` 索引聚合，不拉取无上限任务列表。Controller 只做参数校验、鉴权与响应包装，service 编排，repository 调 RPC。
- 审计复用已分页的 `/platform/audit-logs`，过滤 `target_tenant_id` 和 `resource_type=tenant_customer_rendering_settings`。把既有写入动作 `customer_rendering_settings_update` 纳入查询枚举和 Admin 标签，不变更审计写入行为。
- 页面只修改代码与 migration；不在实现或测试阶段直接修改生产额度、实际计费或客户图片。

## 验证

- 先用聚焦测试覆盖只读汇总 RPC 合同、权限与服务响应、金额精确转换、版本冲突和审计过滤，再运行 API/Admin 类型检查与构建。
- 在隔离数据库验证 migration、RPC 汇总语义及索引使用；生产应用仍走正式 migration 流水线并核对 Local/Remote 对齐。
- 检查页面窄屏布局、空状态、无权限、保存中和 409 状态；通过已有 Admin 页面模式复核菜单/入口可达性。
