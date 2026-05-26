# 小程序员工个性化内容对接文档草案

日期：2026-05-26

状态：草案。后端/Admin 阶段 5 总验收通过后，另行冻结为正式对接文档。

## 适用范围

员工登录后，小程序根据后端返回的个性化配置展示定制化内容。定制维度包括：

- 员工
- 租户部门
- 岗位
- 角色
- 租户默认

小程序端不负责计算规则命中，只消费后端返回的最终配置。

## 前置条件

小程序端必须已经完成员工 bootstrap 链路：

```text
POST /auth 或微信登录接口
→ 保存 employee token
→ GET /employee/bootstrap
→ 渲染员工首页
```

员工部门字段只允许使用：

- `tenant_department_id`
- `department_code`
- `department_name`

禁止继续使用：

- `department_id`
- `employee_department_id`

## 接口

### 员工 bootstrap

```text
GET /employee/bootstrap
```

后端将新增字段：

```json
{
  "personalization": {
    "version": "2026-05-26-001",
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

### 独立刷新接口

```text
GET /employee/personalization?scene=employee_home
```

用途：

- 用户下拉刷新个性化配置。
- 页面内需要刷新但不想重新拉完整 bootstrap。
- 调试当前员工命中的配置。

## 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `personalization.version` | string | 配置版本，用于缓存和变更判断 |
| `personalization.matched_rule.id` | string/null | 当前命中的规则 ID |
| `personalization.matched_rule.scope` | string/null | 命中层级，例如 `employee`、`department_post`、`tenant_default` |
| `personalization.scenes` | object | 按场景返回配置 |
| `employee_home.blocks` | array | 首页内容块 |
| `employee_home.quick_actions` | array | 首页快捷入口 |

无配置时，后端返回：

```json
{
  "personalization": {
    "version": "empty",
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

## 首页内容块

草案结构：

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
- 缺少 `key` 时可用数组下标兜底，但不建议依赖下标缓存。
- `image_url` 为空时不展示图片。
- `action.path` 为空时不展示点击态。

## 快捷入口

草案结构：

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
- 图标只使用小程序端已有图标集合，不允许后端下发任意图标代码。

## 渲染策略

首页推荐顺序：

1. 先用 bootstrap 原有数据渲染默认首页框架。
2. 读取 `personalization.scenes.employee_home`。
3. 渲染 `blocks` 和 `quick_actions`。
4. 个性化配置为空或解析失败时继续展示默认首页。

小程序端禁止：

- 根据 `department_name` 写死业务判断。
- 根据 `post_name` 写死业务判断。
- 使用旧 `department_id` 做缓存 key。
- 因个性化配置失败阻断登录或首页进入。

## 缓存建议

小程序端可按 token 维度缓存 bootstrap。

如需要单独缓存个性化配置，缓存 key 建议包含：

```text
employee_id
tenant_id
personalization.version
scene
```

不建议使用 `department_name` 或 `post_name` 做缓存 key，因为名称可被管理员调整。

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

## 验收用例

### 用例 1：无配置

预期：

- 员工正常登录。
- 首页展示默认内容。
- 不出现错误 toast。

### 用例 2：租户默认配置

预期：

- 无员工、部门、岗位专属规则时，命中租户默认配置。
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

### 用例 6：异常配置

预期：

- 后端返回未知 `type` 或非法 action path 时，小程序忽略异常项。
- 登录和首页不受影响。

## 正式文档冻结条件

正式对接文档必须等以下条件满足后再发布：

- 后端数据模型已完成。
- `/employee/bootstrap.personalization` 已完成并验收。
- Admin 配置和预览已完成并验收。
- 缓存失效和命中日志已完成并验收。
- 字段结构不再变更。

正式文档路径：

```text
docs/application_integration_documentation/2026-05-26-miniprogram-employee-personalization-integration.md
```
