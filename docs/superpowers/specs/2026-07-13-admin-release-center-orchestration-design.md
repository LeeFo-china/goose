# Admin 版本发布中心编排修复设计

**日期：** 2026-07-13
**状态：** 已确认，待实施
**范围：** Admin 超管版本发布、API 发布编排、GitHub Actions 契约、发布证据与审计

## 背景与 Root Cause

Admin 超管侧“运维 / 版本发布”仍按旧工作流契约发起任务，但 CI/CD 已在环境隔离和开发自动部署中拆成构建、证据校验与部署工作流。页面读取版本、Tag、运行记录和容器版本的能力仍可用，真正的发布入口已经失配：

- API 将开发环境映射到 `deploy-dev.yml`，调用时只传 `service`；当前工作流还强制要求 `commit_sha` 和 `build_run_id`，因此请求不能形成合法的开发发布。
- API 将生产环境映射到 `build-docker-images.yml`，调用时仍只传 `service`；该工作流的 `target_environment` 默认是 `development`，Admin 生产发布可能构建错误环境的镜像。
- 当前 `build-docker-images.yml` 只负责构建和上传证据，成功不等于部署；Admin 却把提交动作描述成生产发布，生产容器不会因此更新。
- 生产回滚复用同一条错误链路，因此同样不能形成可验证的生产部署。
- 现有自动化测试没有覆盖 Admin API 到 GitHub Actions 必填输入的端到端契约，工作流演进后未能及时发现失配。

根因不是 Admin 页面按钮、GitHub 网络或服务器 SSH，而是 Admin 依赖了底层工作流的易变输入，并把“构建成功”和“部署成功”混成一个发布状态。

## 目标

- 恢复 Admin 超管侧开发环境的一键构建并部署。
- 将生产发布拆成“构建生产候选”和“确认部署候选”两个明确阶段。
- Admin 只依赖稳定的发布编排契约，不再拼装底层工作流证据。
- 开发、生产镜像和 Runner 严格隔离，生产构建必须显式绑定 `production`。
- 每次部署绑定精确 Commit SHA、构建 Run、服务范围和镜像 manifest。
- 构建成功不能显示为部署成功，失败阶段和恢复动作必须明确。
- 保留现有手动工作流，用于诊断、补发和特殊运维。
- 保持现有生产 Web Gate 和 migration 安全边界，不通过本修复扩大生产 Web 发布能力。

## 非目标

- 不自动部署生产环境。
- 不从 Admin 自动执行生产数据库 migration；现有独立迁移入口保持不变。
- 不新增 CI 构建机、服务器、缓存、队列或数据库表。
- 不把 GitHub Actions 的长任务改为同步 HTTP 请求。
- 不改造生产 Web 发布流程；Admin 当前支持的“全部服务”明确不包含 Web。
- 不修改 orange 仓库或小程序代码。
- 不借机重构无关的 Ops 页面、审计系统或 GitHub 客户端。

## 方案选择

采用“独立发布编排工作流”方案：新增稳定的 `release-dev.yml` 和 `release-production.yml`，由它们调用现有可复用构建、Gate 与部署工作流。

未采用以下方案：

- API 直接轮询并串联多个工作流：会把长任务状态机、重试和证据传递搬进常驻 API，复杂度和故障面过高。
- 恢复旧版构建后直接部署：会重新耦合构建和生产变更，无法满足生产二次确认，也会削弱当前环境隔离。

编排工作流是 Admin 的稳定边界；底层构建、验证和部署工作流可以继续演进，只需保持编排调用契约。

## 总体架构

### 开发环境

```text
Admin
  -> POST /admin/ops/releases/dispatch
  -> release-dev.yml
       -> Build Docker Images（development）
       -> migration history preflight
       -> immutable manifest validation
       -> Deploy Dev
       -> service/domain health check
```

开发环境仍是一次用户操作，但运行记录必须展示构建、预检、部署和健康检查各阶段。任何阶段失败都不能标记为发布成功。

### 生产环境

```text
阶段一：构建候选
Admin
  -> POST /admin/ops/releases/dispatch
  -> release-production.yml(operation=build)
       -> Build Docker Images（production）
       -> upload candidate + build plan + image manifests
       -> candidate ready

阶段二：确认部署
Admin 显示并确认候选证据
  -> POST /admin/ops/releases/production-candidates/:runId/deploy
  -> API 重新验证 GitHub run 与 artifacts
  -> release-production.yml(operation=deploy, build_run_id, commit_sha, services)
       -> revalidate build evidence
       -> production migration/Web safety gates where applicable
       -> Deploy Docker Services
       -> service/domain health check
```

生产构建和生产部署是两个独立的 Actions run。部署失败时可以对同一个仍有效的候选重试，不要求创建新 Tag 或重新构建。

## 工作流契约

### `release-dev.yml`

提供 `workflow_dispatch`，接收：

- `service`：Admin 支持服务的规范化逗号列表；
- `operation`：`release` 或 `rollback`，仅用于审计和运行标题，执行都基于精确 Ref；
- `reason`：可选发布说明，不参与安全判断。

调用工作流的 Git ref 是用户选择且已由 API 验证存在的 branch 或 tag。工作流以该 ref 解析出的 `github.sha` 作为唯一构建和部署 SHA，构建目标固定为 `development`。底层 `deploy-dev.yml` 所需的 `commit_sha`、`build_run_id` 和 Gate 回执均由编排工作流生成和传递，Admin 不负责填写。

服务按依赖顺序发布。API 服务变化包含 COS Worker 使用的 API 镜像关系；Web 仍沿用现有 API 同 SHA 和 Development Web Gate 规则。开发 migration 只做历史对齐预检，不自动 apply。

### `release-production.yml`

提供 `workflow_dispatch`，输入由 `operation` 区分：

- `operation=build`：接收 `service`、`reason`，调用 ref 必须是 tag，构建目标强制为 `production`；
- `operation=deploy`：接收 `service`、`build_run_id`、`commit_sha`、`confirm_text`，其中确认文本固定为 `确认部署生产环境`。

生产 `all` 只代表 Admin 当前支持的 API、Admin、视频 Worker 和 COS Worker，不包含 Web。底层构建集合按镜像复用关系归一化，COS Worker 使用 API manifest，不为其虚构独立镜像。生产 Web 继续走现有专用 Gate，不因选择 `all` 被隐式构建或部署。

`operation=build` 成功时上传 `production-release-candidate` artifact。候选文件至少包含 schema version、构建 workflow run ID、生产 Tag、完整 Commit SHA、请求服务、实际镜像服务、目标环境和 build plan artifact 名称。该文件是“这是一次候选构建”的机器可读证据，不能从运行标题或前端状态推断。

`operation=deploy` 必须验证构建 run：

- workflow path 是 `release-production.yml`；
- event 是 `workflow_dispatch`；
- conclusion 是 `success`；
- head SHA 等于请求中的完整 SHA；
- 存在 schema 合法且 run ID 匹配的 `production-release-candidate` artifact；
- 候选中的生产 Tag 通过 GitHub tag ref 重新解析后仍指向同一完整 SHA；
- build plan 的目标环境是 `production`；
- build plan 与所有必需 manifest 的 run ID、SHA、服务和环境一致；
- manifest digest 格式有效且制品完整；
- 当前不存在同一候选的进行中部署。

任一证据缺失或不一致时失败关闭，不能回退到分支最新提交、可变镜像标签或客户端状态。

### 底层可复用工作流

- `build-docker-images.yml` 增加 `workflow_call`，同时保留 `push` 和 `workflow_dispatch`。
- `deploy-dev.yml` 继续保留手动入口和现有不可变证据校验，并允许受信任的 `release-dev.yml` 调用。
- `deploy-docker-services.yml` 继续保留手动入口；可复用调用必须校验非 Web 服务的构建 run 与 manifest，而不只校验 Web Gate。
- 生产 deploy 编排在候选 Tag ref 上运行；`deploy-docker-services.yml` 将原有仅允许 `main` 的 guard 收紧为“当前完整 SHA、候选 Tag 和已验证候选证据一致”，不允许任意 branch 或未验证 Tag。
- 编排调用和手动调用使用不同的受信任 workflow path/event 校验，不能放宽为任意 Actions run。
- 自动开发发布、手动开发发布和 Admin 开发发布拥有可区分的 concurrency key；实际 Docker 部署仍共享环境级互斥，且 `cancel-in-progress: false`。
- 生产部署保持全局串行，运行中的生产部署不能被新请求取消。

## API 设计

### 开发发布与生产候选构建

保留：

```text
POST /admin/ops/releases/dispatch
```

语义调整：

- `environment=dev`：调度 `release-dev.yml`，表示构建并发布开发环境；
- `environment=production`：调度 `release-production.yml` 的 `build` 操作，只表示构建生产候选；
- `operation=rollback`：开发环境直接基于选定 Ref 发布；生产环境先创建/选择回滚 Tag 并构建候选，仍需第二阶段确认部署。

生产候选构建的确认文本调整为 `确认构建生产候选`，不再使用会暗示已经部署的 `确认发布生产`。

响应继续返回 workflow URL 和可发现的近期 run；审计元数据增加：

- `stage`：`release` 或 `build`；
- `commit_sha`（能够解析时）；
- `build_run_id`；
- `services`；
- `ref` 与 `ref_type`；
- `workflow_id`、`workflow_url`、`run_id` 和 `run_url`。

### 生产候选部署

新增：

```text
POST /admin/ops/releases/production-candidates/:runId/deploy
```

请求体包含 `services`、`confirm_text` 和可选 `reason`。`:runId` 是生产候选构建 run ID。客户端可传服务范围用于确认展示，但服务端必须以构建 plan 为准并要求二者完全一致。

service 层在调度前重新读取 GitHub run、候选 artifact、build plan、tag ref 和 manifests，得到可信的 tag、SHA、服务与环境，然后以该候选 Tag 作为 dispatch ref，调度 `release-production.yml` 的 `deploy` 操作。controller 只读取和校验请求、调用 service，并用 `ResponseHandler.success` 包装结果。

### 查询与状态归一化

运行列表改为读取 `release-dev.yml` 和 `release-production.yml`，并将运行阶段归一化为：

- `build_queued`：构建已排队；
- `building`：正在构建；
- `build_failed`：构建失败；
- `ready_to_deploy`：生产候选证据完整，可部署；
- `deploy_queued`：部署已排队；
- `deploying`：正在部署；
- `deploy_failed`：部署失败；
- `deployed`：部署和健康检查成功。

开发编排可以在详情中额外展示 `building`、`migration_preflight`、`deploying`、`health_check`，但对外最终状态仍为 `deployed` 或对应失败。旧 `deploy-dev.yml`、`build-docker-images.yml` 运行记录继续可读，并标为 legacy，不把旧 build-only run 推断为生产已部署。

候选状态由 GitHub run 和 artifacts 派生，不新增数据库候选表。现有平台审计日志记录用户动作和 run 关联，不作为部署安全证据，因此无需 migration。

## 权限、幂等与失败关闭

- 沿用现有超管发布权限和生产确认规则，不新增普通管理员入口。
- API 在调度前检查目标环境的编排工作流是否已有冲突任务。
- 同一生产 build run 同一时间只允许一个 deploy run；已经成功部署的候选默认拒绝再次部署，回退必须创建新的回滚 Tag 和候选。
- GitHub 配置缺失、Ref 不存在、工作流拒绝、候选未就绪、证据失效、服务不一致和任务冲突返回不同的业务错误语义。
- 错误统一通过 `error-factory.ts` 创建；GitHub gateway 保留 GitHub 状态码和安全的响应详情，不直接 `throw new Error()`，也不吞掉失败。
- GitHub Actions dispatch 返回 204 后暂时找不到 run 时，API 返回 workflow URL 和“已提交、等待同步”状态；前端通过现有轮询刷新，HTTP 请求不等待长任务完成。
- dispatch 成功但审计写入失败沿用现有 best-effort 策略；审计失败不能把已提交的 GitHub 任务伪装成未提交，也不能作为重复调度依据。

## Admin 信息架构与交互

保留 `/ops?tab=releases` 和现有页面导航。页面使用现有 Next.js、shadcn/Radix、Tailwind、Lucide 和 Gooes 设计令牌，不新增 UI 依赖，不采用营销页式布局。

### 开发发布

- 在同一表单中选择环境、服务和 Git Ref。
- 唯一主操作为“构建并发布到开发环境”。
- 提交后按顺序展示构建镜像、迁移预检、部署服务和健康检查。
- 失败记录明确失败阶段，并提供对应 Actions run 链接；用户可以重跑失败阶段，不需要重新创建 Tag。
- 任务运行中禁用重复提交，并在按钮附近说明原因。

### 生产发布

- 第一阶段表单选择或创建 Tag、选择服务并填写发布说明，主操作为“构建生产候选”。
- 构建成功后在同一工作台展示只读证据：Tag、完整/短 SHA、build run 链接、服务范围、构建完成时间和 manifest 校验结果。
- 只有服务端确认 `ready_to_deploy` 后才显示“部署此构建到生产”。
- 最终 `AlertDialog` 重复展示 Tag、SHA、服务和 build run，要求输入 `确认部署生产环境`。
- rollback Tag 与正常 Tag 使用同一个两阶段流程，不提供绕过候选证据的快捷部署。

### 状态与组件

- 使用现有 `Alert`、`Badge`、`Button`、`Card`、`FieldGroup`、`Field`、`Separator`、`Skeleton`、`AlertDialog` 和 toast。
- 避免卡片嵌套；表单、候选证据和运行记录通过标题、分隔线和留白建立层级。
- 加载时使用与最终布局一致的 Skeleton；请求失败使用就地 Alert；无记录使用现有 Empty 模式。
- GitHub token 缺失、任务冲突、候选未验证、证据过期或确认文本错误时禁用操作并显示具体原因。
- 只使用 Gooes 黑/黄主色与语义状态色，圆角不超过现有 8px 规范；不增加装饰动画、渐变或阴影堆叠。
- 状态变化只使用 150 至 200ms 的轻量过渡，并遵循 `prefers-reduced-motion`。
- 桌面保持紧凑工作台布局；小于 768px 时改为单列，主操作可占满宽度，Tag、SHA、服务和 run 链接不得隐藏。

## 错误恢复

- 构建失败：不创建可部署候选，修复后重跑构建或重新提交同一 Tag。
- migration 预检失败：不执行任何 Docker 变更，人工处理现有迁移流程后重跑对应发布。
- 候选证据缺失或不一致：部署请求失败，页面提示重新构建候选，禁止手工补填 SHA 绕过。
- 生产部署失败：候选保持可追溯；在证据仍有效且没有成功部署记录时允许重试 deploy 阶段。
- 健康检查失败：工作流失败，不能标记为 `deployed`；沿用目标部署工作流现有回滚能力和运行总结。
- GitHub 暂时不可达：API 返回可重试业务错误；已收到 204 的 dispatch 不自动再次提交，由运行列表确认是否创建成功。
- 旧运行记录无法推断阶段：显示“历史任务”，仅展示 GitHub 原始状态，不生成“可部署”按钮。

## 测试策略

实施采用 TDD，先写能复现当前失配的契约测试，再修改实现。

### API 契约测试

- 开发 dispatch 必须调用 `release-dev.yml`，且不再直接调用缺少证据的 `deploy-dev.yml`。
- 生产 dispatch 必须调用 `release-production.yml` 的 build，目标环境固定为 production。
- 生产 build-only run 不得归一化为 `deployed`。
- 生产 deploy 接口必须重新验证 run、ref、SHA、环境、服务和 artifacts。
- 客户端服务与 build plan 不一致、候选失败、运行中、证据缺失和重复部署均失败关闭。
- controller/service/gateway 边界、ResponseHandler 和 error factory 行为保持一致。
- 现有分页、Tag、回滚 Tag、成功版本、失败详情和生产 migration 接口不回归。

### Workflow 契约测试

- 两个编排工作流的事件、输入、权限、environment、Runner 和 concurrency 符合设计。
- production build 显式使用 production，不能依赖默认值。
- production deploy 只能消费匹配 build run、SHA、服务和 production manifest 的候选。
- development 和 production manifest 不能交叉使用。
- `all` 不隐式包含 production Web。
- 手动底层工作流仍可用，但不能绕过其原有确认和证据校验。
- migration/Gate 失败发生在 Docker 变更之前。
- YAML 可解析，shell/Node 校验脚本对合法和篡改证据都有测试。

### Admin 测试

- 开发按钮文案和提交语义是“构建并发布”。
- 生产构建成功只显示“可部署”，不显示“已部署”。
- 未验证候选、运行中任务和配置缺失状态不能提交生产部署。
- 最终确认展示 Tag、SHA、服务、build run，并验证确认文本。
- 加载、空、错误、失败阶段和移动端关键内容均有覆盖。
- 现有 Tag 创建、回滚 Tag、运行列表轮询和生产 migration 操作不回归。

## 验证与验收

本地验证至少包括：

- API 和 Admin 的最小静态检查、类型检查与构建；
- 新增 API、Admin 和 workflow 契约测试；
- GitHub Actions YAML 解析和脚本测试；
- `git diff --check`；
- 浏览器检查桌面和移动端的加载、可用、失败、候选就绪与确认状态。

推送后的真实验证分两层：

1. 使用受控开发 Ref 从 Admin 发起一个非生产服务发布，确认 Actions 完成构建、预检、部署、health，开发容器 revision 等于构建 SHA。
2. 使用测试 Tag 构建生产候选，确认目标环境、manifest 和 Admin “可部署”证据正确，但不点击生产部署。生产部署只在运维人员单独授权的维护窗口验证。

验收标准：

- Admin 开发发布不再因缺少 `commit_sha/build_run_id` 被 GitHub 拒绝。
- 开发发布成功后目标服务运行 revision 与该 run 的完整 SHA 一致。
- Admin 生产候选使用 production 镜像配置，构建完成后生产容器没有变化。
- 未经第二阶段确认不能创建生产 deploy run。
- 生产 deploy run 只能消费经服务端和工作流双重验证的候选证据。
- 构建、部署、失败和 legacy 状态在 Admin 中不会互相混淆。
- 生产 Web、migration、Runner 和凭据隔离边界没有被放宽。

## 实施边界与回滚

实施按契约测试、工作流、API、Admin UI、集成验证的顺序小步提交。无数据库结构或数据变更，因此不需要 migration。

若新编排入口出现问题：

- Admin 暂停新 dispatch，底层 `workflow_dispatch` 入口继续用于人工恢复；
- 将 API workflow 映射回只读/禁用状态，而不是回到已知失配的旧调用；
- 已构建镜像和 manifests 继续按 SHA 保留，可用原有手动工作流恢复开发或生产服务；
- 关闭编排工作流不会修改数据库，也不会自动回滚现有生产容器。
