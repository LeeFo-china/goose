# Supabase 写操作稳定性规范

日期：2026-05-18

## 背景

admin 组织架构页连续出现“保存后按钮一直转圈”的问题，已确认多个接口都与 Supabase 写操作链路有关：

- 租户部门启用
- 部门岗位规则保存
- 项目成员候选规则保存

官方文档说明：Supabase JS v2 中 `.insert()`、`.update()`、`.upsert()`、`.delete()` 默认不返回被修改的行；如果需要返回数据，需要链式调用 `.select()`。

参考：

- https://supabase.com/docs/reference/javascript/db-modifiers-select
- https://supabase.com/docs/reference/javascript/db-abortsignal
- https://supabase.com/docs/guides/database/query-optimization
- https://supabase.com/docs/guides/database/inspect

## 项目约束

后端 API 中不允许裸写 Supabase：

```ts
await supabase.from("table").update(payload).eq("id", id);
await supabase.from("table").upsert(payload);
await supabase.from("table").delete().eq("id", id);
```

必须改成明确返回：

```ts
await supabase.from("table").update(payload).eq("id", id).select("id");
await supabase.from("table").upsert(payload).select("id");
await supabase.from("table").delete().eq("id", id).select("id");
```

如果业务需要使用返回对象，则按需选择字段：

```ts
await supabase
  .from("table")
  .update(payload)
  .eq("id", id)
  .select("id, name, updated_at")
  .maybeSingle();
```

## 前端请求约束

admin 中保存类请求必须有超时兜底，避免后端异常时按钮无限 loading。

推荐统一口径：

- 超时时间：20 秒
- 错误提示：`请求超时，请稍后重试`
- 保存失败必须释放 loading 状态

## 性能约束

保存接口不要默认返回全量配置。保存成功后只返回当前操作结果，例如：

```json
{
  "department_code": "FINANCE",
  "selected_post_codes": ["GENERAL_MANAGER"]
}
```

需要全量刷新时由前端触发页面刷新或单独查询，不应把全量配置挂在每次保存响应上。

## 优先治理范围

第一优先级：

- admin 表单保存
- admin 批量操作
- 登录、绑定、解绑
- 小程序用户提交、上传、评论、验收

第二优先级：

- worker 状态更新
- 运维脚本触发的写操作
- 一次性 backfill 脚本

## 已处理

- 租户部门启用：新增批量启用接口，写操作补 `.select()`。
- 部门岗位规则保存：写操作补 `.select("id")`，返回当前保存结果。
- 项目候选规则保存：写操作补 `.select("id")`，返回当前保存结果。
- admin 保存请求：部门岗位和候选规则保存补 20 秒超时。

## 后续建议

1. 增加 lint 或脚本扫描裸 Supabase 写操作。
2. 分模块清理历史裸写点，不和业务重构混在一起。
3. 高频多步骤保存改成 RPC，把多次网络往返收敛到一次数据库调用。
4. 对慢接口记录服务端耗时日志，区分网络、PostgREST、数据库查询和业务代码耗时。
