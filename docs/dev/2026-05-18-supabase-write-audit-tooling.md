# Supabase 写入稳定性审计脚本

日期：2026-05-18

## 背景

租户组织架构页多次出现保存后按钮长时间无响应。排查后确认，后端部分 Supabase 写操作没有明确返回，容易让 PostgREST 链路表现不稳定，也不利于定位慢请求。

项目已约定：API 中的 `.insert()`、`.update()`、`.upsert()`、`.delete()` 不允许裸写，必须明确 `.select()`。

## 本地扫描命令

```bash
bun run audit:supabase-writes
```

该命令会扫描：

- `apps/api/src/controllers`
- `apps/api/src/repositories`
- `apps/api/src/services`

通过标准：

```text
Supabase write audit passed: no naked write chains found.
```

如需在 CI 或发布前强制失败，可直接执行：

```bash
bun scripts/audit-supabase-writes.ts --fail-on-candidates
```

## 判断口径

必须修复：

- `await supabase.from("table").insert(payload)`
- `await supabase.from("table").update(payload).eq(...)`
- `await supabase.from("table").upsert(payload, options)`
- `await supabase.from("table").delete().eq(...)`

推荐写法：

```ts
await supabase.from("table").insert(payload).select("id");
await supabase.from("table").update(payload).eq("id", id).select("id");
await supabase.from("table").upsert(payload, options).select("id");
await supabase.from("table").delete().eq("id", id).select("id");
```

如果业务需要返回完整对象，可以继续使用已有模式：

```ts
await supabase
  .from("table")
  .update(payload)
  .eq("id", id)
  .select("*")
  .maybeSingle();
```

## 本轮收口结果

本轮脚本复扫结果为 0 个候选，并补齐了以下真实裸写点：

- 费用打款记录：`expense_request_settlements`
- 微信换绑映射删除：`wechat_identities`
- 租户模板初始化结果：`tenant_template_applications`
- 员工角色分配：`employee_roles`
- 角色权限分配：`role_permissions`
- 员工权限覆盖：`employee_permission_overrides`
- 摄像头访问日志：`camera_access_logs`
- 用户身份事件日志：`user_auth_events`

## 后续要求

后端提交前建议至少执行：

```bash
bun run audit:supabase-writes
bun run api:typecheck
bun run api:build
```

如果后续发现脚本误报，优先修脚本规则，不要绕过写入返回约束。
