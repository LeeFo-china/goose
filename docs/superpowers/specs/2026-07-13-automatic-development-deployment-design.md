# 主分支按变更自动部署开发环境设计

**日期：** 2026-07-13
**状态：** 已确认，待实施
**范围：** GitHub Actions、开发镜像构建、开发环境部署与发布证据

## 背景

当前 `Build Docker Images`、`Deploy Dev`、`Verify Development Web Deployment Gate`
均只支持 `workflow_dispatch`。推送 `main` 不会创建任何 GitHub Actions run，代码合并后仍需人工
按顺序填写 commit SHA、构建 run ID 和 Gate run ID。

现有环境隔离已经把镜像构建放到 GitHub-hosted Runner，把开发部署放到
`gooes-dev-deploy` Runner，并要求部署只消费带完整提交 SHA 和 digest 的不可变 CCR 镜像。
本设计在不削弱这些边界的前提下，为 `main` 增加按变更范围自动构建和自动部署开发环境的链路。

## 目标

- 推送 `main` 后自动识别受影响的运行服务。
- 只构建、部署受影响服务，减少无效的长耗时镜像构建。
- 保留完整 SHA、镜像 digest、构建 run 和 Gate 回执之间的证据链。
- Web 自动部署继续满足 API 与 Web revision 相同的 Gate 约束。
- 数据库迁移不自动执行；迁移历史未对齐时在任何服务变更前阻断部署。
- 保留现有手动工作流，用于补发、诊断、回滚和特殊发布。
- 生产环境触发条件、Runner、凭据和人工确认策略保持不变。

## 非目标

- 不自动执行开发或生产数据库 migration。
- 不自动部署生产环境。
- 不把镜像构建迁回自托管 Runner。
- 不实现跨 API、Admin、Web、Worker 的事务式原子发布。
- 不为本功能引入新的应用依赖、缓存、队列或服务器。
- 不修改 orange 仓库。

## 总体架构

```text
push main
  |
  v
Build Docker Images（GitHub-hosted）
  |- 检出 before..after 变更
  |- 生成 build-plan.json
  |- 按计划构建并推送 SHA 镜像
  `- 上传镜像 manifest 与 build plan
        |
        | workflow_run: completed + success + event=push + branch=main
        v
Auto Deploy Dev（gooes-dev-deploy）
  |- 校验 build run、SHA、plan 和镜像 manifest
  |- 校验 dev Local/Remote migration 历史完全对齐
  |- 部署受影响的 API / Admin / Worker
  |- 若包含 Web：验证同 SHA API -> Development Web Gate
  `- 部署 Web -> 域名 smoke -> 失败时沿用 Web 回滚
```

构建和部署仍是两个独立工作流。自动部署只由成功的自动构建 run 触发，人工触发的构建不会
隐式部署。部署端不重新构建镜像，也不接受可变标签作为发布依据。

## 触发语义

### 自动构建

`Build Docker Images` 增加 `push` 触发，监听 `main` 的每次 push，由路径解析器决定构建服务或生成
no-op 计划。`workflow_dispatch` 输入和行为保持兼容。

自动触发时：

- `target_environment` 固定为 `development`。
- 源提交固定为 `github.sha`，禁止调用方覆盖。
- 使用 `github.event.before..github.sha` 计算本次 push 的完整变更集合。
- `before` 不可用、全零或无法形成有效比较范围时，安全降级为全服务构建。
- 仅文档、测试、基线报告或非运行时 CI 说明变化时，生成“无需部署”的成功计划，不构建镜像。

### 自动部署

新增 `Auto Deploy Dev`，通过 `workflow_run` 监听 `Build Docker Images`。只有同时满足以下条件才继续：

- 上游 conclusion 为 `success`。
- 上游 event 为 `push`，排除手动构建。
- 上游 head branch 为 `main`。
- build plan 的 commit SHA 与上游 `head_sha` 完全一致。
- build plan 的 target environment 为 `development`。

自动部署使用全局开发环境 concurrency，`cancel-in-progress: false`。新的 push 可以取消尚未完成的旧构建，
但不能中断正在操作 Docker 的部署 run，避免开发环境停在半部署状态。

## 变更到服务的映射

路径解析器输出两个去重集合：`build_services` 和 `deploy_services`。服务名只允许来自现有白名单。

| 变更范围 | 构建 | 部署 | 说明 |
| --- | --- | --- | --- |
| Web 运行代码、资源、Web 构建配置、`docker/web.Dockerfile` | `api`, `web` | `api`, `web` | Web Gate 要求 API revision 与 Web SHA 相同 |
| API 运行代码、API 构建配置、`docker/api.Dockerfile` | `api`, `social-video-worker` | `api`, `social-video-worker`, `cos-reconcile-worker` | COS worker 消费 API 镜像；独立 worker 镜像也复制 API 源码 |
| Admin 运行代码、Admin 构建配置、`docker/admin.Dockerfile` | `admin` | `admin` | 不重建无关服务 |
| `docker/social-video-worker.Dockerfile` | `social-video-worker` | `social-video-worker` | 独立 Worker 镜像 |
| `packages/domain` 运行代码 | `api`, `admin`, `web`, `social-video-worker` | 全部开发服务 | Domain 被 API、Admin、Web 和 Worker 共享 |
| 根依赖锁文件、workspace 配置、开发 compose 公共配置 | 全部可构建服务 | 全部开发服务 | 无法安全细分时保守扩大范围 |
| `supabase/migrations` | 按同一次 push 的运行代码决定 | 迁移预检通过后才允许 | migration 只作为阻断信号，不自动 apply |
| 仅 `*.test.*`、`apps/*/tests`、`apps/*/e2e` | 无 | 无 | 测试变化由质量检查处理，不发布镜像 |
| 仅文档、Lighthouse 摘要、设计资产清单 | 无 | 无 | 输出 no-op 计划 |
| 仅 GitHub Actions 或部署脚本 | 无 | 无 | 验证编排本身，不重启业务容器 |

若同一 push 命中多个规则，取集合并集。任何不能分类但可能影响运行产物的路径必须安全降级为全服务，
不能静默跳过。

## 不可变构建计划

构建工作流始终生成 `build-plan.json`，至少包含：

- schema version；
- target environment；
- commit SHA 与 before SHA；
- change classification；
- migration changed 标记；
- build services 与 deploy services；
- no-op 标记；
- 生成计划的 workflow run ID。

计划作为 artifact 上传。每个实际构建服务继续上传独立 `image-manifest-<service>`，包含同一 commit SHA、
目标环境、镜像地址和 digest。自动部署必须同时校验 plan、上游 run 元数据和所有必需 manifest，缺少任一证据
即失败关闭。

## 数据库安全门

自动链路只做 plan/preflight，不做 apply。部署前在 `gooes-dev-deploy` Runner 上：

1. 校验 Runner 名称和 `/opt/gooes-dev/docker/.env.dev.db`。
2. 校验 dev project ref、数据库主机和生产阻断列表。
3. 对目标 commit 的 `supabase/migrations` 执行 migration list。
4. 使用现有严格校验器确认 Local/Remote 版本、顺序和最新版本完全对齐。

存在 pending、remote-only、乱序或解析失败时，任何服务都不得部署。操作人员通过现有
`Migrate Dev Database` 人工确认并应用 migration，验证对齐后重跑失败的自动部署 run。重新 push 不是恢复
前置条件。

## 部署顺序与 Web Gate

自动部署按依赖关系执行：

1. 验证 build plan、构建证据和 migration 历史。
2. 若计划包含 API，先部署 API 并验证容器 revision、health 与 `api-dev`。
3. 部署计划中的 Admin 和 Worker；每项继续使用现有单服务部署与健康检查。
4. 若计划包含 Web，确认 API 已部署为相同 SHA，然后执行 Development Web Gate。
5. 使用同一自动部署 run 中的不可变 Gate 回执部署 Web。
6. 验证 `www-dev.goodcms.cn` 的 service/revision 响应头和页面 smoke。

`deploy-dev.yml` 与开发 Web Gate 将增加 `workflow_call` 接口，自动编排与手动入口复用同一实现。手动入口的
workflow path 校验保持原样；自动入口必须显式传入并校验允许的调用工作流路径，不能放宽为任意 Actions run。

## 失败与恢复

- 变更解析或证据校验失败：不构建或不部署，失败关闭。
- 任一镜像构建失败：上游不成功，不触发自动部署。
- migration 未对齐：在第一个 Docker 变更前失败。
- API 部署失败：Worker、Gate 和 Web 不继续。
- Admin 或 Worker 失败：对应 job 失败，运行总结显示已成功和未执行的服务，禁止假报全量成功。
- Web Gate 失败：不修改 Web 容器。
- Web 部署或 smoke 失败：沿用现有旧镜像标签和 revision 校验执行自动回滚。
- 非 Web 服务暂不增加通用自动回滚；通过现有手动 `Deploy Dev` 选择上一 SHA 恢复。

每次自动部署的 Job Summary 必须展示 commit、上游 build run、分类结果、migration 状态、各服务结果、
Web Gate run/receipt 和最终 revision。

## 手动入口与生产隔离

- `Build Docker Images` 的手动 development/production 构建继续可用。
- `Deploy Dev`、`Verify Development Web Deployment Gate` 和 `Migrate Dev Database` 的手动入口继续可用。
- 手动 Build 不触发 Auto Deploy Dev。
- 自动工作流不得出现 `gooes-prod-deploy`、生产主机、生产目录、生产数据库标识或生产确认文本。
- `Deploy Docker Services`、Production Web Gate 和 Production Migration 不增加 push 触发。

## 测试与验证

实施使用契约测试先行，至少覆盖：

- main push 与 workflow_run 的事件、分支和 conclusion 限制；
- 手动构建不进入自动部署；
- 每类路径的 build/deploy 集合与去重；
- Web 必须自动补充 API；
- API 必须包含两个 Worker 的正确构建/部署关系；
- test/docs-only 生成 no-op；
- 未知运行路径安全降级为全服务；
- build plan 和 manifest 的 SHA、环境、run ID 校验；
- migration 不对齐发生在任何 Docker 操作之前；
- 自动部署只运行于 `gooes-dev-deploy`；
- 生产工作流没有新增自动触发；
- 现有手动工作流契约继续通过。

本地验证包括 workflow YAML 解析、路径解析器单元测试、现有 Web/CI 契约测试、API/Admin/Domain 最小检查和
`git diff --check`。首次推送后必须观察真实 Actions 链路，确认一次 no-op push 计划和一次受控运行时变更的构建、
Gate、部署与 revision 证据。

## 验收标准

- 推送 `main` 的运行时代码变化后自动创建 Build Docker Images run。
- 构建计划只选择映射范围内的服务，Web 变化必定同时选择 API。
- 成功的自动构建触发且仅触发一个 Auto Deploy Dev run。
- migration 未对齐时没有任何开发容器 revision 变化。
- 部署完成后被选服务的容器 revision 等于 push commit SHA，未选服务保持原 revision。
- Web 发布同时满足 API 同 SHA、Gate 回执有效和域名 smoke 成功。
- docs/test-only 变化不会构建镜像或重启开发容器。
- 手动开发发布仍可用，生产发布仍需原有人工触发和确认。

## 回滚

- 自动化工作流异常时，移除/禁用 push 与 workflow_run 触发，恢复为现有手动流程；不需要回滚业务数据。
- 构建产物仍以 SHA 保存，开发服务可通过手动 Deploy Dev 回退到上一已知健康 SHA。
- Web 继续使用现有自动回滚标签；其他服务按运行总结中记录的上一 revision 手动恢复。
- 本设计不自动执行 migration，因此关闭自动化不会产生数据库回滚动作。
