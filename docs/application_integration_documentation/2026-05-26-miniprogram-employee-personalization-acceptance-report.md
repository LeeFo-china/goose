# 小程序员工个性化内容联调验收记录

日期：2026-05-26  
范围：员工登录后基于部门、岗位、角色、员工身份返回定制化内容  
关联文档：

- `docs/application_integration_documentation/2026-05-26-employee-personalization-execution-plan.md`
- `docs/application_integration_documentation/2026-05-26-miniprogram-employee-personalization-integration.md`

## 1. 当前结论

已完成后端迁移、验收规则准备、员工端 API 验收、Admin 管理接口验收。

本轮验收结论：通过。

小程序端可以进入联调，实现路径以 `GET /employee/bootstrap` 为主，必要时用 `GET /employee/personalization?scene=employee_home` 做独立刷新。

## 2. 验收环境

API：

```text
http://127.0.0.1:3000
```

Admin：

```text
http://localhost:3010
```

验收租户：

```text
tenant_id: 5f9404fd-23a7-4686-a606-b2627a65611d
```

验收标记：

```text
acceptance_run: 2026-05-26-miniprogram-personalization
scene: employee_home
```

## 3. 验收数据

已在 `employee_personalization_rules` 写入 6 条 active 规则，覆盖完整匹配层级。

| 匹配层级 | 优先级 | 标题 | 说明 |
| --- | ---: | --- | --- |
| employee | 100 | 员工本人规则命中 | 验证员工 ID 规则最高优先级 |
| department_post | 90 | 部门岗位规则命中 | 验证部门+岗位优先于单部门、单岗位 |
| post | 80 | 岗位规则命中 | 验证岗位兜底 |
| department | 70 | 部门规则命中 | 验证部门兜底 |
| role | 60 | 角色规则命中 | 验证角色兜底 |
| tenant_default | 10 | 租户默认规则命中 | 验证无精确规则时的租户默认兜底 |

样本员工：

| 员工 | employee_id | 部门 | 岗位 | 预期命中 |
| --- | --- | --- | --- | --- |
| 令狐冲 | `f811b568-2024-4351-ad5b-6f7929ffffc4` | 工程部 | 项目经理 | employee |
| 小龙女 | `bda24a81-bdf7-4df9-90dc-ce67121a16bd` | 工程部 | 工程监理 | department_post |
| Dev 租户管理员 | `0a32598d-bd65-420c-8b9e-b1c58230f5a9` | 总裁办/总经理办公室 | 总经理 | tenant_default |

角色预览样本：

```text
role_code: role_b82a26f25a9d
预期命中: role
```

## 4. API 验收结果

### 4.1 员工独立个性化接口

接口：

```http
GET /employee/personalization?scene=employee_home
```

验收结果：

| 样本 | 实际命中 | 返回标题 | 结果 |
| --- | --- | --- | --- |
| 令狐冲 | employee | 员工本人规则命中 | 通过 |
| 小龙女 | department_post | 部门岗位规则命中 | 通过 |
| Dev 租户管理员 | tenant_default | 租户默认规则命中 | 通过 |

### 4.2 员工 bootstrap 接口

接口：

```http
GET /employee/bootstrap
```

验收样本：令狐冲

返回关键字段：

```json
{
  "personalization": {
    "matched_rule": {
      "scope": "employee"
    },
    "scenes": {
      "employee_home": {
        "title": "员工本人规则命中"
      }
    },
    "rules_version": "initial"
  }
}
```

结果：通过。

说明：

- `personalization` 已随 bootstrap 返回。
- `matched_rule.scope` 可用于调试和灰度观察，小程序端不应依赖它做业务分支。
- `rules_version` 当前为 `initial`，后续通过 Admin 新增、编辑、启停规则时会刷新。

## 5. Admin 验收结果

### 5.1 规则列表

接口：

```http
GET /admin/employee-personalization-rules?page=1&pageSize=20&scene=employee_home
```

结果：

```text
total=6
first=employee/员工本人规则命中
```

验收结论：通过。

### 5.2 规则预览

接口：

```http
POST /admin/employee-personalization-rules/preview
```

请求：

```json
{
  "scene": "employee_home",
  "role_codes": ["role_b82a26f25a9d"]
}
```

结果：

```text
role / 角色规则命中
```

验收结论：通过。

### 5.3 Admin 页面响应

页面：

```text
http://localhost:3010/employee-personalization
```

未登录访问结果：

```text
HTTP/1.1 307 Temporary Redirect
```

验收结论：通过。后台页面保持登录态保护，未登录跳转登录页。

## 6. 小程序联调准入

小程序团队可以开始对接，准入条件已满足：

- 后端表结构已迁移。
- `employee_home` 场景有完整验收数据。
- `GET /employee/bootstrap` 已返回 `personalization`。
- `GET /employee/personalization?scene=employee_home` 可独立获取场景配置。
- Admin 管理接口可查看和预览规则。

小程序端联调重点：

1. 登录完成后读取 `/employee/bootstrap.data.personalization`。
2. 读取 `personalization.scenes.employee_home.blocks` 渲染首页模块。
3. 读取 `personalization.scenes.employee_home.quick_actions` 渲染快捷入口。
4. 使用 `tenant_id + employee_id + scene + rules_version` 作为本地缓存维度。
5. `personalization` 缺失、`matched_rule` 为 `null` 或 `blocks` 为空时，展示默认首页。

## 7. 验收数据清理

如果后续需要清理本轮验收数据，执行：

```sql
delete from public.employee_personalization_rules
where tenant_id = '5f9404fd-23a7-4686-a606-b2627a65611d'
  and scene = 'employee_home'
  and content_json->>'acceptance_run' = '2026-05-26-miniprogram-personalization';
```

当前建议暂不清理，保留给小程序团队联调使用。

## 8. 后续计划

阶段 1：小程序接入 bootstrap 个性化字段。

验收：

- 小程序登录后能读取并打印 `personalization.version`、`rules_version`。
- 首页能渲染 `blocks` 和 `quick_actions`。
- 空配置时不白屏，回落默认首页。

阶段 2：小程序实现缓存刷新。

验收：

- `rules_version` 不变时复用本地缓存。
- `rules_version` 变化时重新渲染个性化首页。

阶段 3：灰度真实部门/岗位规则。

验收：

- 选择一个真实部门或岗位灰度。
- Admin 调整规则后，小程序下一次 bootstrap 能拿到新内容。
- 首页无空白、无错位、无异常 toast。
