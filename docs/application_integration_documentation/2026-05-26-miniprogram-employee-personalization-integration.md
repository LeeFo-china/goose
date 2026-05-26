# 小程序员工个性化内容对接文档

日期：2026-05-26

状态：正式。后端/Admin 已完成阶段验收后冻结本契约。

## 背景

员工登录后，小程序可以根据后端返回的个性化配置展示定制化内容。规则命中由后端完成，小程序端只消费最终结果。

支持的匹配维度：

- 员工
- 租户部门
- 岗位
- 租户部门 + 岗位
- 角色
- 租户默认

匹配优先级：

```text
employee_id
→ tenant_department_id + post_id
→ post_id
→ tenant_department_id
→ role_code
→ tenant_default
```

## 前置条件

小程序端必须使用员工 bootstrap 链路：

```text
登录成功并保存 employee token
→ GET /employee/bootstrap
→ 使用 bootstrap 数据渲染员工首页
```

员工部门字段只允许读取：

- `tenant_department_id`
- `department_code`
- `department_name`

禁止继续使用：

- `department_id`
- `employee_department_id`

## 接口

### 员工 Bootstrap

```text
GET /employee/bootstrap
```

响应中新增：

```json
{
  "personalization": {
    "version": "2026-05-26T15:00:00.000Z",
    "rules_version": "2026-05-26T15:30:00.000Z",
    "matched_rule": {
      "id": "rule_xxx",
      "scope": "department_post"
    },
    "scenes": {
      "employee_home": {
        "blocks": [],
        "quick_actions": []
      }
    }
  }
}
```

无命中规则时：

```json
{
  "personalization": {
    "version": "empty",
    "rules_version": "initial",
    "matched_rule": null,
    "scenes": {
      "employee_home": {
        "blocks": [],
        "quick_actions": []
      }
    }
  }
}
```

### 独立刷新

```text
GET /employee/personalization?scene=employee_home
```

用途：

- 用户下拉刷新个性化配置。
- 页面内刷新个性化内容，不重新拉完整 bootstrap。
- 调试当前员工最终命中结果。

## 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | string | 当前命中内容版本；未命中时为 `empty` |
| `rules_version` | string | 后端规则版本；用于小程序判断配置是否可能发生变化 |
| `matched_rule` | object/null | 当前命中的规则 |
| `matched_rule.id` | string | 命中规则 ID |
| `matched_rule.scope` | string | 命中层级 |
| `scenes` | object | 按场景返回配置 |
| `scenes.employee_home.blocks` | array | 首页内容块 |
| `scenes.employee_home.quick_actions` | array | 首页快捷入口 |

`matched_rule.scope` 取值：

```text
employee
department_post
post
department
role
tenant_default
```

## 首页内容块

当前支持的基础结构：

```json
{
  "type": "banner",
  "key": "design_daily_focus",
  "title": "设计部工作台",
  "description": "今日重点跟进方案确认客户",
  "image_url": null,
  "action": {
    "label": "查看待办",
    "path": "/packageTasks/pages/index/index"
  }
}
```

小程序端要求：

- 不认识的 `type` 直接忽略。
- 缺少 `key` 时可以用数组下标兜底渲染，但不能把下标作为长期缓存标识。
- `image_url` 为空时不展示图片。
- `action.path` 为空或不在小程序路由白名单时，不展示点击态。
- 单个 block 解析失败不得影响其他 block。

## 快捷入口

当前支持的基础结构：

```json
{
  "key": "project_create",
  "label": "新建项目",
  "path": "/packageProjects/pages/edit/index",
  "icon": "plus",
  "enabled": true
}
```

小程序端要求：

- `enabled === false` 时不展示。
- `path` 不在小程序路由白名单内时不展示。
- 图标只映射到小程序端已有图标集合，不允许后端下发任意图标代码。
- 未识别的 `icon` 使用默认图标。

## 渲染策略

推荐流程：

1. 使用 bootstrap 原有字段渲染默认首页框架。
2. 读取 `personalization.scenes.employee_home`。
3. 渲染 `blocks` 和 `quick_actions`。
4. 个性化配置缺失、为空或解析失败时，继续展示默认首页。

禁止：

- 根据 `department_name` 写死业务判断。
- 根据 `post_name` 写死业务判断。
- 使用旧 `department_id` 做缓存 key。
- 因个性化配置失败阻断登录或首页进入。

## 缓存建议

小程序端可继续按 token 维度缓存 bootstrap。

如需单独缓存个性化配置，缓存 key 建议包含：

```text
employee_id
tenant_id
scene
rules_version
version
```

不要使用 `department_name` 或 `post_name` 做缓存 key，因为名称可能被管理员调整。

## 错误处理

| 场景 | 小程序处理 |
| --- | --- |
| `personalization` 缺失 | 使用默认首页 |
| `scenes.employee_home` 缺失 | 使用默认首页 |
| `blocks` 不是数组 | 按空数组处理 |
| `quick_actions` 不是数组 | 按空数组处理 |
| 未识别 block type | 忽略该 block |
| action path 不合法 | 不展示 action |
| 独立刷新接口失败 | 保留旧配置或默认首页，不弹全局登录错误 |

## Admin 配置入口

后端 Admin 已提供配置页面：

```text
/employee-personalization
```

能力：

- 新增规则。
- 编辑规则。
- 启用 / 停用规则。
- 预览当前规则命中结果。
- 配置 `employee_home` 场景内容 JSON。

配置接口：

```text
GET /admin/employee-personalization-rules
POST /admin/employee-personalization-rules
GET /admin/employee-personalization-rules/:id
PATCH /admin/employee-personalization-rules/:id
POST /admin/employee-personalization-rules/:id/status
POST /admin/employee-personalization-rules/preview
```

这些接口仅供 Admin 使用，小程序端不要直接调用。

## 验收用例

### 用例 1：无配置

预期：

- 员工正常登录。
- 首页展示默认内容。
- `personalization.version` 为 `empty`。
- 不出现错误 toast。

### 用例 2：租户默认配置

预期：

- 无员工、部门、岗位专属规则时，命中租户默认配置。
- `matched_rule.scope` 为 `tenant_default`。
- 首页展示租户默认 banner 或快捷入口。

### 用例 3：部门岗位配置

预期：

- 同租户内，设计部设计师和工程部施工岗位看到不同内容。
- `matched_rule.scope` 为 `department_post`。

### 用例 4：员工专属配置

预期：

- 员工专属配置覆盖部门岗位配置。
- `matched_rule.scope` 为 `employee`。

### 用例 5：规则禁用

预期：

- Admin 禁用规则后，小程序刷新 bootstrap 或独立刷新接口，不再展示该规则内容。
- 可回退到低优先级规则或默认首页。
- `rules_version` 发生变化。

### 用例 6：异常配置

预期：

- 后端返回未知 `type` 或非法 action path 时，小程序忽略异常项。
- 登录和首页不受影响。

## 联调注意事项

1. 小程序先只接 `employee_home` 场景。
2. 小程序不要请求 Admin 配置接口。
3. 小程序不要在本地复刻后端匹配规则。
4. 所有个性化内容必须有默认首页兜底。
5. 后端配置变更后，小程序通过 `rules_version` 判断是否需要刷新个性化内容。
