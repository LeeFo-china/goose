# 超管发布中心生产回滚第一版

## 背景

超管发布中心已经支持创建生产 Tag、选择服务并发起 GitHub Actions 发布。缺口是生产环境出现问题时，后台只能辅助创建回滚 Tag，不能从一个已成功版本直接完成“创建回滚 Tag + 触发生产发布”的闭环。

## 第一版目标

1. 超管可以在“发布辅助”的成功版本列表中选择一个已成功 Commit。
2. 输入确认文本 `确认回滚生产` 后，系统自动创建一个新的回滚 Tag。
3. 使用新创建的 Tag 触发生产环境发布 workflow。
4. 回滚操作写入平台审计，最近发布详情中可以区分“发布”和“回滚”。

## 当前交互

位置：超管后台 `/ops?tab=releases`

发布辅助列表中每条成功版本提供三个动作：

- `作为来源`：把该 Commit 填入左侧“创建新 Tag 并发布”流程，不自动提交。
- `回滚 Tag`：只创建回滚 Tag，并填入左侧发布表单，不自动提交生产发布。
- `回滚发布`：二次确认后自动创建回滚 Tag，并发起生产环境全部服务回滚。

`回滚发布` 需要输入：

```text
确认回滚生产
```

第一版默认发布生产环境 `全部服务`，用于保证生产代码版本整体一致。后续如果需要更细，可以扩展为在回滚弹窗中选择服务范围。

## 后端接口

复用现有接口：

```http
POST /admin/ops/releases/rollback-tag
POST /admin/ops/releases/dispatch
```

`dispatch` 新增字段：

```json
{
  "operation": "rollback"
}
```

字段说明：

- `operation=release`：普通发布，默认值。
- `operation=rollback`：生产回滚，只允许 `environment=production`。
- 生产普通发布确认文本仍为 `确认发布生产`。
- 生产回滚确认文本为 `确认回滚生产`。

## 审计记录

回滚触发后仍写入 `platform_audit_logs.action = platform_release_dispatch`，通过 metadata 区分：

```json
{
  "operation": "rollback",
  "operation_label": "回滚",
  "environment": "production",
  "services": ["all"],
  "ref_type": "tag",
  "ref": "v2026.05.18.1"
}
```

最近发布详情读取 `operation_label` 展示类型，未记录时兼容显示为“发布”。

## 验收标准

1. 在发布辅助列表点击 `回滚发布`，未输入确认文本时不能提交。
2. 输入 `确认回滚生产` 后，可以创建回滚 Tag 并触发生产 workflow。
3. 最近发布记录中可以打开详情，类型显示为 `回滚`。
4. 审计日志 metadata 中包含 `operation=rollback`。
5. 普通生产发布仍要求输入 `确认发布生产`，不受回滚逻辑影响。
6. 开发环境不允许提交 `operation=rollback`。

## 后续优化

1. 回滚弹窗支持选择服务范围，默认 `全部服务`。
2. 回滚按钮可仅对生产成功版本展示，dev 成功版本作为“创建 Tag 来源”保留。
3. 增加回滚后健康检查结果回写，方便在后台直接看到回滚是否上线可用。
