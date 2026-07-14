# 超管发布中心生产安全规范

日期：2026-05-17
更新：2026-07-14

## 背景

超管后台「运维脚本 / 版本发布」入口只负责提交 GitHub Actions 编排任务，不直接 SSH、不直接操作 Docker。

当前后台面向运维人员暴露两个稳定入口：

- 开发发布：`.github/workflows/release-dev.yml`
- 生产发布：`.github/workflows/release-production.yml`

旧的 `deploy-dev.yml`、`build-docker-images.yml`、`deploy-docker-services.yml` 仍作为底层或历史记录存在，但后台调度入口只使用上面两个稳定 workflow。生产数据库迁移继续走独立 migration 流程；生产 Web 仍走专用 Gate / Web 发布流程。

## 发布版本规则

版本来源分三类：

| 来源 | 使用场景 | 生产是否允许 |
| --- | --- | --- |
| 分支 | dev 快速验证，例如 `main` 或功能分支 | 不允许 |
| Tag | 生产候选构建与部署 | 允许，推荐 |
| Commit SHA | 创建 Tag 的来源版本 | 不允许直接发布 |

生产发布不允许直接选择分支或裸 Commit SHA。生产必须先创建或选择不可变 Tag，再基于该 Tag 构建生产候选。

推荐生产 tag 格式：

```text
vYYYY.MM.DD.N
```

示例：

```text
v2026.07.14.1
v2026.07.14.2
```

发布中心支持在超管后台创建生产 Tag：

- 输入 `vYYYY.MM.DD.N` 格式的 Tag 名称。
- 输入来源版本，支持 Commit SHA、已有 Tag 或分支名。
- 后端会解析来源版本到 commit，再创建 GitHub annotated tag 和 `refs/tags/*`。
- 后端会拒绝已存在的 Tag，不允许覆盖历史发布版本。
- 创建成功后 Admin 会使用该 Tag 构建生产候选。

命令行兜底：

```bash
git tag -a v2026.07.14.1 -m "release: v2026.07.14.1"
git push origin v2026.07.14.1
```

## 开发环境发布流程

开发环境仍是一键发布：

1. 在「服务发布」选择开发环境。
2. 选择 Ref 类型和 Ref。
3. 选择要发布的服务。
4. 点击 `构建并发布到开发环境`。
5. 等待 GitHub Actions 完成构建、migration preflight、部署和健康检查。

开发发布成功后，Admin 最近发布记录会显示 `已部署`。失败时先查看发布记录详情和 GitHub Actions 日志，不要在服务器上手动修容器。

## 生产两阶段发布流程

生产分为两个阶段：先构建并验证候选，再显式部署候选。

### 阶段一：构建生产候选

1. 在「服务发布」选择生产环境。
2. 选择已有 Tag，或创建新 Tag。
3. 选择服务范围。
4. 输入生产确认文本：`确认构建生产候选`。
5. 点击 `构建生产候选`。
6. 在最近发布记录中等待状态变为 `可部署`。
7. 在「生产候选证据」中核对：
   - Tag；
   - Commit SHA；
   - 构建 Run；
   - 服务范围；
   - 构建时间；
   - `镜像清单已验证` 状态。

阶段一只构建并校验生产镜像，不会修改生产容器。运维人员不得把候选构建成功误认为生产已部署。

### 阶段二：部署生产候选

1. 在最近发布记录中选择 `可部署` 的生产记录，或使用默认最新候选。
2. 点击「生产候选证据」中的 `部署此构建到生产`。
3. 输入生产确认文本：`确认部署生产环境`。
4. 可选填写部署说明。
5. 提交后等待部署和健康检查完成。

部署成功后，最近发布记录显示 `已部署`。生产部署只使用该构建 Run 已验证的镜像，不允许在前端手动填写不同 SHA、Tag 或服务范围。

## 失败与重试边界

- 候选构建失败不会生成可部署候选。
- 候选构建成功但部署失败时，可以重试同一个仍有效的候选。
- 已成功部署的候选不能重复部署；后端会通过部署 receipt 阻止重复生产变更。
- 旧 workflow 记录会标记为 `历史任务`，仅用于查看，不提供候选部署入口。
- 生产 Web 不走 Admin 版本发布入口，继续使用专用 Gate / Web 发布流程。
- 生产数据库 migration 继续使用独立 migration workflow，不并入服务发布。

## 回滚流程

发布中心提供「最近成功版本」辅助：

- 点击「作为来源」会把成功 Commit 填入创建 Tag 流程，不会自动提交。
- 点击「回滚 Tag」只创建不可变回滚 Tag，并填入生产表单。
- 点击「构建回滚候选」会创建回滚 Tag 并构建生产候选；此阶段不会修改生产容器。
- 回滚候选仍必须进入「生产候选证据」，输入 `确认部署生产环境` 后才能真正部署生产。

这个能力本质是「按历史成功 Commit 重新构建并部署候选」，适合应用层快速回退。

重要边界：

- 不做数据库结构或数据回滚。
- 不自动跳过候选证据校验。
- 不绕过生产部署二次确认。
- 如果历史 Commit 依赖已经被删除的外部配置或镜像，GitHub Actions 仍可能失败，需要查看 run 日志。

## 后端校验与审计

后端在提交 GitHub Actions 前会做校验：

1. 校验服务是否被当前环境支持。
2. 生产环境拒绝 `branch` 来源。
3. 拒绝直接使用 `commit` 发起 workflow dispatch。
4. 校验选择的 branch / tag 是否真实存在。
5. 检查目标 workflow 是否已有 `queued` 或 `in_progress` 任务。
6. 生产候选部署前重新读取候选证据，校验 Tag、Commit SHA、构建 Run、服务范围、build plan、镜像 manifest 和 deployment receipt。

每次后台发起发布都会写入 `platform_audit_logs`，关键字段包括：

- `metadata.environment`
- `metadata.services`
- `metadata.ref_type`
- `metadata.ref`
- `metadata.stage`
- `metadata.commit_sha`
- `metadata.build_run_id`
- `metadata.workflow_id`
- `metadata.workflow_url`
- `metadata.run_id`
- `metadata.run_url`

后台创建 Tag 也会写入审计：

- `action`: `platform_release_tag_create`
- `resource_type`: `github_release_tag`
- `metadata.tag`
- `metadata.source_ref`
- `metadata.target_sha`
- `metadata.tag_sha`
- `metadata.html_url`

## 恢复与排障

排障时只使用不可变证据：

1. 发布记录中的 workflow 链接。
2. `production-release-candidate` artifact。
3. `production-build-plan` artifact。
4. 各服务 `image-manifest-*` artifact。
5. `production-deployment-receipt-*` artifact。
6. 候选 Tag、Commit SHA、构建 Run ID 和服务范围。

禁止为了恢复手动填写另一个 SHA、临时改 workflow 输入、绕过 receipt 校验或在服务器上直接替换容器。需要生产止血时，应选择新的 Tag 重新构建候选，或按既有 Gate / migration 专项流程处理。
