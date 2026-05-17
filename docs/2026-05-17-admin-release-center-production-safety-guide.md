# 超管发布中心生产安全规范

日期：2026-05-17

## 背景

超管后台已增加「运维脚本 / 版本发布」入口。后台只负责提交 GitHub Actions 发布任务，不直接 SSH、不直接操作 Docker。

发布执行仍由 GitHub Actions 完成：

- dev：`.github/workflows/deploy-dev.yml`
- production：`.github/workflows/build-docker-images.yml`

## 发布版本规则

版本来源分三类：

| 来源 | 使用场景 | 生产是否允许 |
| --- | --- | --- |
| 分支 | dev 快速验证，例如 `feature/multi-tenant` | 不允许 |
| Tag | 生产标准发布 | 允许，推荐 |
| Commit SHA | 创建 Tag 的来源版本 | 不允许直接发布 |

生产发布不允许直接选择分支或裸 Commit SHA。GitHub `workflow_dispatch` 的 `ref` 只能使用分支或 Tag；如果直接传 Commit SHA，会返回 `No ref found for:<sha>`。因此生产发布必须先创建 Tag，再用 Tag 发布。

推荐生产 tag 格式：

```text
vYYYY.MM.DD.N
```

示例：

```text
v2026.05.17.1
v2026.05.17.2
```

发布中心支持在超管后台创建生产 Tag：

- 输入 `vYYYY.MM.DD.N` 格式的 Tag 名称。
- 输入来源版本，支持 Commit SHA、已有 Tag 或分支名。
- 后端会解析来源版本到 commit，再创建 GitHub annotated tag 和 `refs/tags/*`。
- 后端会拒绝已存在的 Tag，不允许覆盖历史发布版本。
- 创建成功后 Admin 会自动切换到生产 Tag 发布，并填入刚创建的 Tag。

如果需要用命令行兜底，也可以在代码仓库创建并推送生产版本 tag：

```bash
git tag -a v2026.05.17.1 -m "release: v2026.05.17.1"
git push origin v2026.05.17.1
```

## 发布前校验

后端在提交 GitHub Actions 前会做校验：

1. 校验服务是否被当前环境支持。
2. 生产环境拒绝 `branch` 来源。
3. 拒绝直接使用 `commit` 发起 workflow dispatch。
4. 校验选择的 branch / tag 是否真实存在。
5. 检查目标环境 workflow 是否已有 `queued` 或 `in_progress` 发布。
6. 如果已有发布运行中，返回 `RELEASE_WORKFLOW_BUSY`，不重复提交。

## 发布后回查

提交发布后，后端会短时间轮询 GitHub Actions 最近的 workflow runs，尽量返回本次 run：

```json
{
  "workflow_id": "deploy-dev.yml",
  "workflow_url": "https://github.com/LeeFo-china/goose/actions/workflows/deploy-dev.yml",
  "run": {
    "id": "25987882840",
    "html_url": "https://github.com/LeeFo-china/goose/actions/runs/25987882840",
    "status": "queued"
  }
}
```

Admin 会在提交后展示「查看本次发布」链接。若 GitHub run 尚未生成，用户仍可在最近发布记录中刷新查看。

## 审计记录

每次后台发起发布都会写入 `platform_audit_logs`：

- `action`: `platform_release_dispatch`
- `resource_type`: `github_actions_workflow`
- `resource_label`: 环境 + 服务
- `metadata.environment`
- `metadata.service`
- `metadata.ref_type`
- `metadata.ref`
- `metadata.workflow_id`
- `metadata.workflow_url`
- `metadata.run_id`
- `metadata.run_url`

后台创建 Tag 也会写入审计：

- `action`: `platform_release_tag_create`
- `resource_type`: `github_release_tag`
- `resource_label`: Tag 名称
- `metadata.tag`
- `metadata.source_ref`
- `metadata.target_sha`
- `metadata.tag_sha`
- `metadata.html_url`

## 回滚第一版

发布中心增加「最近成功版本」：

- 后端读取 GitHub Actions 最近成功的 `workflow_dispatch` 记录。
- Admin 展示成功记录对应的 Commit SHA。
- 点击「用此版本」只会把 Commit 填入发布表单，不会自动提交。
- 重新发布仍走现有发布校验、确认弹窗、审计记录和 GitHub Actions。
- 生产环境仍要求输入 `确认发布生产`。

这个能力本质是「按历史成功 Commit 重新发布」，适合应用层快速回退。

重要边界：

- 不做数据库结构或数据回滚。
- 不自动选择服务，提交前仍需要确认服务范围。
- 如果历史 Commit 依赖已经被删除的外部配置或镜像，GitHub Actions 仍可能失败，需要查看 run 日志。

## 当前边界

第一版不做一键自动回滚按钮。回滚通过「最近成功版本」填入 Commit 后手动确认发布，避免绕过生产发布规则。

生产全量发布 `all` 可用，但建议常规发布优先选择单服务，除非明确涉及 API、Admin、Worker 的联动变更。
