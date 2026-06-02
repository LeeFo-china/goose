# API 超 500 行代码文件治理分阶段计划

日期：2026-06-01

## 背景

`apps/api` 当前存在较多超过 500 行的手写业务文件，部分 service/controller/repository 已超过 1000 行。继续在这些文件上叠加需求会带来以下问题：

- controller、service、repository 职责边界变模糊，HTTP、业务编排、Supabase 查询容易混在一起。
- 单次修改需要阅读大量无关上下文，回归影响面难判断。
- 大文件并行开发冲突概率高，代码评审难以聚焦真实行为变化。
- 业务规则、查询条件、数据转换、第三方网关调用难以复用和单独验证。

本计划目标是分阶段把 `apps/api` 手写业务代码治理到可维护范围，并建立后续新增代码的门禁。每个阶段必须完成测试和验收记录，通过后提交，再进入下一阶段。

## 治理标准

### 行数标准

| 文件类型 | 建议范围 | 阶段硬性目标 | 说明 |
| --- | ---: | ---: | --- |
| controller | 100-300 行 | <= 500 行 | 只处理 HTTP、读 request、校验参数、调用 service、包装 `ResponseHandler.success` |
| service | 200-500 行 | <= 500 行 | 编排业务逻辑、组合查询条件、调用 repository/rpc/gateway、做领域转换 |
| repository / gateway | 150-400 行 | <= 500 行 | 直接访问 Supabase / SQL / RPC / 第三方 API |
| schema | 300-600 行 | <= 700 行 | Zod schema 天然啰嗦，可略放宽 |
| script / worker | 200-500 行 | <= 600 行 | 迁移脚本允许阶段性偏大，但必须隔离可复用逻辑 |
| generated types | 不限制 | 不纳入拆分目标 | 例如 `apps/api/src/types/database.ts` |

### 架构规则

1. 错误响应必须经过 `apps/api/src/errors/error-factory.ts` 包装，禁止新增 `throw new Error()`。
2. controller 不承载业务流程，不直接访问 Supabase、RPC、第三方 SDK。
3. service 不直接拼 HTTP response，不读取 Fastify request/reply。
4. repository/gateway 不关心 HTTP、权限响应文案和页面场景。
5. 拆分优先提取稳定边界：
   - 类型：`*-types.ts`
   - 常量：`*-constants.ts`
   - 数据转换：`*-mapper.ts` / `*-serializer.ts`
   - 查询构造：`*-queries.ts`
   - 业务流程：`*-workflow.ts`
   - 第三方访问：`*-gateway.ts`
6. 每阶段默认只做结构治理，不改变 API path、payload、返回结构、权限判断和中文错误文案。
7. 发现明确 bug 时必须单独记录：原因、修复点、回归验证、是否需要独立提交。

## 当前基线

扫描命令：

```bash
rg --files apps/api -g '!node_modules' -g '!dist' -g '!build' -g '!coverage' \
  | rg '\.(ts|tsx|js|jsx|mjs|cjs)$' \
  | xargs wc -l \
  | awk '$1 >= 500 && $2 != "total" { print $1, $2 }' \
  | sort -nr
```

2026-06-01 基线：

- 包含生成类型文件：48 个文件 `>= 500` 行。
- 排除 `apps/api/src/types/database.ts` 后：47 个手写/脚本文件 `>= 500` 行。

| 行数 | 文件 | 治理归类 |
| ---: | --- | --- |
| 7096 | `apps/api/src/types/database.ts` | 生成文件，排除拆分 |
| 4287 | `apps/api/src/services/customer-project-log-shares.ts` | Phase 2 |
| 2728 | `apps/api/src/services/project-acceptances.ts` | Phase 3 |
| 2238 | `apps/api/src/controllers/wechat/index.ts` | Phase 1 |
| 2144 | `apps/api/src/services/decoration-qa.ts` | Phase 5 |
| 1937 | `apps/api/src/services/expense-requests.ts` | Phase 4 |
| 1554 | `apps/api/src/services/system-settings.ts` | Phase 6 |
| 1401 | `apps/api/src/services/billing.ts` | Phase 4 |
| 1386 | `apps/api/src/services/projects.ts` | Phase 3 |
| 1288 | `apps/api/src/repositories/marketing-pages.ts` | Phase 7 |
| 1249 | `apps/api/src/controllers/customer-self-service/index.ts` | Phase 1 |
| 1243 | `apps/api/src/controllers/projects/index.ts` | Phase 1 |
| 1185 | `apps/api/src/services/marketing-pages.ts` | Phase 5 |
| 1170 | `apps/api/src/services/project-cameras.ts` | Phase 3 |
| 1166 | `apps/api/src/services/release-deployments.ts` | Phase 5 |
| 1110 | `apps/api/src/repositories/permissions.ts` | Phase 7 |
| 1100 | `apps/api/src/services/social-video-transcriptions.ts` | Phase 5 |
| 1058 | `apps/api/src/services/employee-project-detail-bootstrap.ts` | Phase 6 |
| 1049 | `apps/api/src/repositories/expense-requests.ts` | Phase 7 |
| 1048 | `apps/api/src/controllers/customer-project-log-shares/index.ts` | Phase 1 |
| 1016 | `apps/api/src/controllers/customer/index.ts` | Phase 1 |
| 1005 | `apps/api/src/repositories/billing.ts` | Phase 7 |
| 904 | `apps/api/src/repositories/projects.ts` | Phase 7 |
| 897 | `apps/api/src/services/social-video-scripts.ts` | Phase 5 |
| 833 | `apps/api/src/repositories/project-cameras.ts` | Phase 7 |
| 763 | `apps/api/src/repositories/project-acceptances.ts` | Phase 7 |
| 756 | `apps/api/src/controllers/marketing-pages/index.ts` | Phase 1 |
| 751 | `apps/api/src/repositories/customer-project-log-share-campaigns.ts` | Phase 7 |
| 728 | `apps/api/src/repositories/platform-tenants.ts` | Phase 7 |
| 727 | `apps/api/src/services/marketing-page-ai.ts` | Phase 5 |
| 716 | `apps/api/src/services/files/platform-file-storage.ts` | Phase 8 |
| 666 | `apps/api/src/scripts/storage-migration-dry-run.ts` | Phase 8 |
| 659 | `apps/api/src/services/construction-stage-status.ts` | Phase 3 |
| 649 | `apps/api/src/services/wechat-customer-identities.ts` | Phase 6 |
| 649 | `apps/api/src/controllers/employee-self-service/index.ts` | Phase 1 |
| 638 | `apps/api/src/repositories/tenant-devices.ts` | Phase 7 |
| 624 | `apps/api/src/services/tencent-iot-video.ts` | Phase 3 |
| 619 | `apps/api/src/services/tenant-devices.ts` | Phase 3 |
| 618 | `apps/api/src/services/sms.ts` | Phase 4 |
| 616 | `apps/api/src/services/usage.ts` | Phase 4 |
| 615 | `apps/api/src/services/wechat-rebind-requests.ts` | Phase 6 |
| 615 | `apps/api/src/services/task-center.ts` | Phase 4 |
| 603 | `apps/api/src/services/customer-service-tickets.ts` | Phase 6 |
| 593 | `apps/api/src/plugins/auth.ts` | Phase 6 |
| 581 | `apps/api/src/scripts/storage-migration-upload.ts` | Phase 8 |
| 561 | `apps/api/src/services/customer-core.ts` | Phase 6 |
| 535 | `apps/api/src/services/authorization.ts` | Phase 6 |
| 502 | `apps/api/src/scripts/storage-migration-final-verify.ts` | Phase 8 |

## 通用阶段门禁

每个阶段必须按以下顺序执行，不能跳过：

1. 建立阶段执行记录，列出目标文件、当前行数、预期拆分结果。
2. 完成代码拆分，保持原有入口导出兼容。
3. 执行测试命令并记录结果。
4. 执行行数门禁，目标文件必须从 `> 500` 输出中消失；script 阶段按本计划的 script 阈值验收。
5. 人工/API smoke 验收通过。
6. 更新阶段执行记录。
7. 提交当前阶段代码和文档。
8. 只有当前阶段提交完成后，才能进入下一阶段。

通用测试命令：

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

通用行数门禁：

```bash
rg --files apps/api -g '!node_modules' -g '!dist' -g '!build' -g '!coverage' \
  | rg '\.(ts|tsx|js|jsx|mjs|cjs)$' \
  | xargs wc -l \
  | awk '$1 >= 500 && $2 != "total" && $2 != "apps/api/src/types/database.ts" { print $1, $2 }' \
  | sort -nr
```

通用静态检查：

```bash
rg 'throw new Error\(' apps/api/src/controllers apps/api/src/services apps/api/src/repositories apps/api/src/plugins
rg 'from\("@/utils/supabase|from\("../utils/supabase|from\("../../utils/supabase' apps/api/src/controllers
```

说明：

- 本项目当前没有完整自动化测试基础设施，因此阶段测试以 `typecheck`、`build`、静态规则扫描、目标接口 smoke 为最低门槛。
- 涉及数据库写入、计费、短信、上传、微信、AI、IoT 的阶段，必须使用测试租户或 dry-run 数据，禁止直接在生产数据上验证破坏性路径。
- smoke 测试必须记录请求路径、输入场景、预期响应、实际响应摘要，不需要记录敏感 token。

## 阶段 0：基线、门禁和执行模板

### 目标

建立治理基线和阶段执行方式，不改业务代码。

### 范围

- 落本文档。
- 确认 `apps/api` 超 500 行代码文件清单。
- 建立统一阶段门禁、测试命令、验收记录模板。
- 明确 `apps/api/src/types/database.ts` 为生成文件，不纳入拆分目标。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

行数基线：

```bash
rg --files apps/api -g '!node_modules' -g '!dist' -g '!build' -g '!coverage' \
  | rg '\.(ts|tsx|js|jsx|mjs|cjs)$' \
  | xargs wc -l \
  | awk '$1 >= 500 && $2 != "total" { print $1, $2 }' \
  | sort -nr
```

### 验收

- 本文档存在于 `docs/2026-06-01-api-large-file-governance-phased-plan.md`。
- 48 个 `>= 500` 行文件已记录，其中 1 个生成文件已明确排除。
- 后续每个阶段都有测试、验收和提交要求。
- 阶段 0 提交信息建议：`docs: add api large file governance plan`。

## 阶段 1：controller 瘦身

### 目标

先治理 HTTP 层，避免后续 service/repository 拆分时 controller 继续承载业务逻辑。

### 目标文件

- `apps/api/src/controllers/wechat/index.ts`
- `apps/api/src/controllers/customer-self-service/index.ts`
- `apps/api/src/controllers/projects/index.ts`
- `apps/api/src/controllers/customer-project-log-shares/index.ts`
- `apps/api/src/controllers/customer/index.ts`
- `apps/api/src/controllers/marketing-pages/index.ts`
- `apps/api/src/controllers/employee-self-service/index.ts`

### 拆分策略

- 按资源动作拆成 route handler helper，例如 `wechat-auth-handlers.ts`、`project-query-handlers.ts`。
- 把业务判断、状态机、第三方调用迁移到 service。
- 保留原 `index.ts` 的 controller 类和路由导出，减少 routes 层改动。
- 所有错误继续使用 `Errors.badRequest()`、`Errors.dbError()` 等 error factory。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

静态检查：

```bash
rg 'throw new Error\(' apps/api/src/controllers
rg 'from\("@/utils/supabase|from\("../utils/supabase|from\("../../utils/supabase' apps/api/src/controllers
```

smoke 覆盖：

- 微信登录/绑定/解绑相关只验证非生产测试身份路径。
- 客户自助服务登录态校验、客户资料读取、项目读取。
- 项目列表、项目详情、项目创建/编辑参数校验。
- 营销页读取、保存、发布状态相关路径。

### 验收

- 7 个目标 controller 均 `<= 500` 行。
- controller 中没有新增直接 Supabase 访问。
- controller 中没有新增 `throw new Error()`。
- API path、请求 payload、成功响应包装格式不变。
- smoke 路径返回结构与拆分前一致。
- 阶段 1 提交完成后进入阶段 2，提交信息建议：`refactor: slim api controllers`。

## 阶段 2：客户项目日志分享核心域治理

### 目标

治理当前最大的业务 service，并拆清分享链接、活动、访问授权、日志展示、客户可见性之间的边界。

### 目标文件

- `apps/api/src/services/customer-project-log-shares.ts`
- 关联关注：`apps/api/src/controllers/customer-project-log-shares/index.ts`
- 关联关注：`apps/api/src/repositories/customer-project-log-share-campaigns.ts`

### 拆分策略

- 提取分享链接 token 与访问校验：`customer-project-log-share-access.ts`。
- 提取活动配置与投放规则：`customer-project-log-share-campaign-service.ts`。
- 提取日志聚合和展示转换：`customer-project-log-share-feed.ts`。
- 提取客户身份和访问上下文：`customer-project-log-share-context.ts`。
- repository 只保留数据访问，复杂查询条件拆到 query helper。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

smoke 覆盖：

- 有效分享 token 读取项目日志。
- 无效/过期 token 返回既有中文错误。
- 客户身份绑定后访问权限不扩大。
- 活动配置读取与分享页展示字段保持不变。

### 验收

- `customer-project-log-shares.ts` `<= 500` 行。
- 关联 controller 如果阶段 1 未完成，则本阶段必须补到 `<= 500` 行。
- 分享访问权限、token 校验、日志数据结构与拆分前一致。
- 所有新增 helper 有明确单向依赖，不形成循环 import。
- 阶段 2 提交完成后进入阶段 3，提交信息建议：`refactor: split customer project log share service`。

## 阶段 3：项目、验收、摄像头和施工状态治理

### 目标

治理项目主流程相关的大 service，拆开项目 CRUD、工序验收、摄像头接入、施工状态同步。

### 目标文件

- `apps/api/src/services/project-acceptances.ts`
- `apps/api/src/services/projects.ts`
- `apps/api/src/services/project-cameras.ts`
- `apps/api/src/services/construction-stage-status.ts`
- `apps/api/src/services/tencent-iot-video.ts`
- `apps/api/src/services/tenant-devices.ts`

### 拆分策略

- 项目：拆分项目创建/更新、成员候选、状态流转、详情聚合。
- 验收：拆分模板、验收项、整改工单、图片处理、客户通知。
- 摄像头：拆分设备绑定、通道同步、播放地址、IoT gateway。
- 施工状态：拆分状态机规则、阶段一致性检查、项目状态回写。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
bun run api:construction-stage-check
```

smoke 覆盖：

- 项目列表/详情/创建/编辑。
- 项目状态流转和施工阶段一致性检查。
- 工序验收创建、提交、通过、驳回、整改。
- 摄像头设备绑定、列表、播放地址读取。

### 验收

- 6 个目标 service 均 `<= 500` 行。
- 项目状态、施工阶段、验收状态流转没有行为变化。
- Tencent IoT 访问集中在 gateway/repository 层，不散落在项目 service。
- `bun run api:construction-stage-check` 通过或记录既有数据问题并确认非本阶段引入。
- 阶段 3 提交完成后进入阶段 4，提交信息建议：`refactor: split project workflow services`。

## 阶段 4：费用、计费、用量、短信和任务中心治理

### 目标

治理资金和扣费相关代码，优先降低回归风险，确保计费、短信、用量记录可追溯。

### 目标文件

- `apps/api/src/services/expense-requests.ts`
- `apps/api/src/services/billing.ts`
- `apps/api/src/services/sms.ts`
- `apps/api/src/services/usage.ts`
- `apps/api/src/services/task-center.ts`

### 拆分策略

- 费用申请：拆分申请创建、审批流、附件、分类、通知。
- 计费：拆分账单计算、余额校验、流水写入、幂等键处理。
- 用量：拆分 AI、短信、视频转写等用量归集。
- 短信：拆分验证码、模板短信、渠道 gateway、发送日志。
- 任务中心：拆分任务查询、待办聚合、状态更新。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

smoke 覆盖：

- 费用申请创建、审批、驳回、列表。
- 测试租户余额充足和余额不足的计费路径。
- 短信验证码测试模式和真实渠道 gateway mock/dry-run。
- 用量记录写入与重复请求幂等。
- 任务中心待办列表和状态更新。

### 验收

- 5 个目标 service 均 `<= 500` 行。
- 扣费、余额、用量记录字段不变。
- 任何涉及真实短信发送的验证必须使用测试配置或 dry-run。
- 阶段 4 提交完成后进入阶段 5，提交信息建议：`refactor: split billing expense usage services`。

## 阶段 5：营销页、AI、社媒视频和发布运维治理

### 目标

治理内容生成、营销页、AI 调用、视频转写和发布部署相关的大文件，隔离第三方服务调用和业务编排。

### 目标文件

- `apps/api/src/services/decoration-qa.ts`
- `apps/api/src/services/marketing-pages.ts`
- `apps/api/src/services/release-deployments.ts`
- `apps/api/src/services/social-video-transcriptions.ts`
- `apps/api/src/services/social-video-scripts.ts`
- `apps/api/src/services/marketing-page-ai.ts`

### 拆分策略

- AI gateway、prompt 构造、调用日志、业务结果转换分离。
- 营销页 builder、发布状态、线索表单配置、页面复制分离。
- 社媒视频转写 worker 编排、ASR gateway、脚本生成、扣费分离。
- 发布部署状态、镜像标签、回滚动作、审计记录分离。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

smoke 覆盖：

- 装修问答生成和历史读取。
- 营销页创建、保存、发布、详情读取。
- 社媒视频转写提交、状态查询、脚本生成。
- 发布部署列表、创建、回滚 dry-run 或测试环境路径。

### 验收

- 6 个目标 service 均 `<= 500` 行。
- AI prompt 输入、模型选择、扣费用量路径不变。
- 发布部署不对生产环境执行破坏性 smoke。
- 阶段 5 提交完成后进入阶段 6，提交信息建议：`refactor: split marketing ai release services`。

## 阶段 6：认证、租户、权限和客户核心治理

### 目标

治理基础横切能力，降低权限、租户隔离、身份绑定、客户核心数据的长期维护风险。

### 目标文件

- `apps/api/src/services/system-settings.ts`
- `apps/api/src/services/employee-project-detail-bootstrap.ts`
- `apps/api/src/services/wechat-customer-identities.ts`
- `apps/api/src/services/wechat-rebind-requests.ts`
- `apps/api/src/services/customer-service-tickets.ts`
- `apps/api/src/plugins/auth.ts`
- `apps/api/src/services/customer-core.ts`
- `apps/api/src/services/authorization.ts`

### 拆分策略

- auth plugin 只做认证中间件和上下文挂载，权限判断下沉到 authorization/access-policy。
- 微信客户身份、解绑/重绑申请、身份诊断拆开。
- 系统设置按租户设置、平台设置、公开配置、敏感配置分组。
- 客户核心按基础资料、归属人、状态、属性、隐私字段分组。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

静态检查：

```bash
rg 'tenant_id|tenantId' apps/api/src/services apps/api/src/repositories
rg 'throw new Error\(' apps/api/src/plugins apps/api/src/services
```

smoke 覆盖：

- 管理员、员工、客户自助服务三类身份登录态。
- 租户隔离：A 租户 token 不能读取 B 租户数据。
- 微信客户身份绑定、解绑、重绑申请。
- 系统设置读取和更新。
- 客服工单创建、列表、状态更新。

### 验收

- 8 个目标文件均 `<= 500` 行。
- auth 上下文、tenant 上下文、权限响应语义不变。
- 没有新增跨租户读取风险。
- 阶段 6 提交完成后进入阶段 7，提交信息建议：`refactor: split auth tenant customer services`。

## 阶段 7：repository 查询层治理

### 目标

把大 repository 拆成清晰查询边界，避免复杂 Supabase 查询散落且难以复用。

### 目标文件

- `apps/api/src/repositories/marketing-pages.ts`
- `apps/api/src/repositories/permissions.ts`
- `apps/api/src/repositories/expense-requests.ts`
- `apps/api/src/repositories/billing.ts`
- `apps/api/src/repositories/projects.ts`
- `apps/api/src/repositories/project-cameras.ts`
- `apps/api/src/repositories/project-acceptances.ts`
- `apps/api/src/repositories/customer-project-log-share-campaigns.ts`
- `apps/api/src/repositories/platform-tenants.ts`
- `apps/api/src/repositories/tenant-devices.ts`

### 拆分策略

- 按读写分离：`*-read-repository.ts`、`*-write-repository.ts`。
- 按聚合查询分离：列表、详情、统计、状态更新。
- 复杂 select 字段常量化，避免多处复制。
- repository 方法只返回数据或错误，不包装 HTTP 响应。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

smoke 覆盖：

- 复用前序阶段已覆盖的项目、验收、营销页、费用、计费、权限路径。
- 对每个拆分 repository 至少覆盖一个读路径和一个写路径。

### 验收

- 10 个目标 repository 均 `<= 500` 行。
- Supabase select/update/insert/delete 条件与拆分前一致。
- repository 层没有新增 HTTP、Fastify、ResponseHandler 依赖。
- 阶段 7 提交完成后进入阶段 8，提交信息建议：`refactor: split large api repositories`。

## 阶段 8：文件存储和迁移脚本治理

### 目标

治理存储服务和历史迁移脚本，避免一次性脚本继续复制业务逻辑。

### 目标文件

- `apps/api/src/services/files/platform-file-storage.ts`
- `apps/api/src/scripts/storage-migration-dry-run.ts`
- `apps/api/src/scripts/storage-migration-upload.ts`
- `apps/api/src/scripts/storage-migration-final-verify.ts`

### 拆分策略

- 提取 COS/Supabase 文件对象映射、URL 解析、校验逻辑到 service/helper。
- 迁移脚本保留 CLI 编排，复用 `services/files` 下的迁移能力。
- dry-run、upload、verify 共享读取、分页、差异比较、输出格式。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
bun --cwd apps/api src/scripts/storage-migration-output-smoke.ts
```

dry-run 验证：

```bash
bun --cwd apps/api src/scripts/storage-migration-dry-run.ts
```

### 验收

- `platform-file-storage.ts` `<= 500` 行。
- 迁移脚本建议 `<= 600` 行，若仍超过 500 必须说明原因和下一步归并计划。
- dry-run 输出格式与历史文档兼容。
- 不执行真实上传或删除，除非有单独审批和测试桶。
- 阶段 8 提交完成后进入阶段 9，提交信息建议：`refactor: split storage migration scripts`。

## 阶段 9：最终门禁固化和收尾

### 目标

确保手写业务代码治理完成，并把行数门禁固化为后续开发流程。

### 范围

- 复跑全量行数门禁。
- 对剩余超过阈值的文件逐一记录豁免理由。
- 可选新增脚本：`scripts/check-api-file-size.ts` 或 package script `api:check-file-size`。
- 更新团队约定：新增/修改手写业务文件超过 500 行必须拆分或在 PR 中说明。

### 测试

```bash
git diff --check
bun run api:typecheck
bun run api:build
```

最终行数门禁：

```bash
rg --files apps/api -g '!node_modules' -g '!dist' -g '!build' -g '!coverage' \
  | rg '\.(ts|tsx|js|jsx|mjs|cjs)$' \
  | xargs wc -l \
  | awk '$1 >= 500 && $2 != "total" && $2 != "apps/api/src/types/database.ts" { print $1, $2 }' \
  | sort -nr
```

### 验收

- 除生成文件和已记录豁免外，手写业务文件不再超过 500 行。
- 所有阶段执行记录完整，包括测试命令、结果、smoke 摘要、提交号。
- package script 或 CI 文档中有 API 文件行数门禁说明。
- 阶段 9 提交完成，提交信息建议：`chore: enforce api file size governance`。

## 阶段执行记录模板

每个阶段提交前，在对应阶段文档或本文末尾追加：

```markdown
## 阶段 X 执行记录

日期：
提交：

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |

### 结构变化

- 

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过/失败 |  |
| `bun run api:typecheck` | 通过/失败 |  |
| `bun run api:build` | 通过/失败 |  |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |

### 风险和遗留

- 
```

## 优先级说明

执行顺序按风险和依赖关系排序：

1. 先拆 controller，固定 HTTP 边界。
2. 再拆最大业务域，降低后续冲突。
3. 项目/验收/摄像头、费用/计费等高风险域分阶段处理。
4. 横切的 auth/tenant/permission 放在业务边界更清楚之后治理。
5. repository 最后集中治理，确保 service 调用边界已经稳定。
6. 迁移脚本单独处理，避免和在线业务服务混在同一阶段。

任何阶段如果出现无法通过测试或验收的问题，必须停在当前阶段修复，不允许带失败进入下一阶段。

## 阶段 0 执行记录

日期：2026-06-01
提交：0fbc38f

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| - | - | `docs/2026-06-01-api-large-file-governance-phased-plan.md` |

### 结构变化

- 新增 API 超 500 行代码文件治理分阶段计划。
- 记录 `apps/api` 当前 48 个 `>= 500` 行代码文件，其中 `apps/api/src/types/database.ts` 为生成类型文件，不纳入拆分目标。
- 明确每阶段必须测试、验收、提交，通过后才能进入下一阶段。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | 依赖安装后通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| API 行数基线扫描 | 通过 | 包含生成文件 48 个，排除生成文件后 47 个 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 阶段 0 文档验收 | 通过 | 本阶段只新增治理规划，不改业务代码 |

### 风险和遗留

- 本地初始缺少 `node_modules`，`bun install --frozen-lockfile` 长时间停在 resolving 后中断，改用项目声明的 `pnpm install --frozen-lockfile` 安装依赖并完成门禁。
- Phase 1 开始前需重新确认 controller 当前行数和导出结构。

## 阶段 1 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: slim api controllers`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 2238 | 15 | `apps/api/src/controllers/wechat/index.ts` |
| 1249 | 183 | `apps/api/src/controllers/customer-self-service/index.ts` |
| 1243 | 119 | `apps/api/src/controllers/projects/index.ts` |
| 1048 | 15 | `apps/api/src/controllers/customer-project-log-shares/index.ts` |
| 1016 | 296 | `apps/api/src/controllers/customer/index.ts` |
| 756 | 15 | `apps/api/src/controllers/marketing-pages/index.ts` |
| 649 | 53 | `apps/api/src/controllers/employee-self-service/index.ts` |

### 结构变化

- `employee-self-service`：抽出员工首页 bootstrap handler、schema、types、prewarm helper；controller 只保留路由和个性化查询。
- `marketing-pages`：按平台营销页、租户营销页、公开页面/线索拆为子 controller，入口统一注册。
- `customer-project-log-shares`：按客户分享/预约活动、员工营销活动、营销中心活动实例拆为子 controller，入口统一注册。
- `customer`：抽出客户 shared base、客户属性 controller、详情/状态/来源/跟进/手机号动作 controller，原入口保留 CRUD。
- `projects`：抽出项目 shared base、列表序列化、状态/bootstrap、成员、公开项目、创建选择 controller，原入口保留 CRUD。
- `customer-self-service`：抽出客户上下文 shared base、项目/日志 base、项目路由 controller、工单/验收 controller，原入口保留 context/profile/bootstrap。
- `wechat`：原混合登录实现整体迁到 `apps/api/src/services/wechat-auth-legacy-controller.ts`，新 controller 仅代理注册现有路由，保持行为不变。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| controller 行数门禁 | 通过 | `apps/api/src/controllers` 下无 `>= 500` 行 `.ts` 文件 |
| `rg 'throw new Error\(' apps/api/src/controllers` | 通过 | 无输出 |
| controller Supabase 直连扫描 | 通过 | 无输出 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 路由注册结构 | 通过 | 各入口 controller 继续通过 `registerExtraRoutes` 注册原路由 |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖装饰器、导入路径、类型和 bundle |
| 真实接口请求 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对数据库写路径发请求 |

### 风险和遗留

- `apps/api/src/services/wechat-auth-legacy-controller.ts` 仍为 2238 行 legacy handler；本阶段先移出 controller 以固定 HTTP 边界，后续应在 Phase 6 认证/身份治理中继续拆分员工登录、客户登录、访客登录、重绑申请、H5 session。
- 本阶段为结构拆分，未修改 API path、payload、成功响应包装或中文错误文案。

## 阶段 2 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split customer project log share facade`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 4287 | 179 | `apps/api/src/services/customer-project-log-shares.ts` |
| 751 | 99 | `apps/api/src/repositories/customer-project-log-share-campaigns.ts` |

### 结构变化

- `apps/api/src/services/customer-project-log-shares.ts` 改为薄 facade，继续导出 `customerProjectLogShareService`，对外方法名和调用方式不变。
- 原分享、助力、预约奖励、营销中心和券核销实现迁入 `apps/api/src/services/customer-project-log-shares/legacy-service.ts`。
- `apps/api/src/repositories/customer-project-log-share-campaigns.ts` 改为薄 facade，继续导出原 repository 实例和行类型。
- 原 Supabase 查询实现迁入 `apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts`。
- 本阶段未修改 controller 调用、API path、payload、返回结构和中文错误文案。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | service facade 179 行，repository facade 99 行 |
| `rg 'throw new Error\(' apps/api/src/services/customer-project-log-shares.ts apps/api/src/repositories/customer-project-log-share-campaigns.ts` | 通过 | 无输出 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 facade 导入、类型转发和 bundle |
| 真实接口请求 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对分享、助力、领奖写路径发请求 |

### 风险和遗留

- `apps/api/src/services/customer-project-log-shares/legacy-service.ts` 仍为 4287 行，`apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts` 仍为 751 行；本阶段先完成外部入口瘦身和行为保持，未完成 legacy 内部按客户侧、员工侧、营销中心、预约奖励的实质拆分。
- 后续继续治理时应优先把 legacy service 中的纯 helper、token/券状态、客户分享、员工活动、营销中心模板/实例逐步拆出，避免长期保留单体 legacy。

## 阶段 3 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split project workflow service facades`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 2728 | 1 | `apps/api/src/services/project-acceptances.ts` |
| 1386 | 1 | `apps/api/src/services/projects.ts` |
| 1170 | 1 | `apps/api/src/services/project-cameras.ts` |
| 659 | 1 | `apps/api/src/services/construction-stage-status.ts` |
| 624 | 12 | `apps/api/src/services/tencent-iot-video.ts` |
| 619 | 1 | `apps/api/src/services/tenant-devices.ts` |

### 结构变化

- 6 个目标 service 入口均改为薄 facade，继续导出原有 service 实例、class 或类型，保持调用方 import path 不变。
- 原项目验收、项目、摄像头、施工阶段、租户设备实现分别迁入对应 `legacy-service.ts` 目录，作为后续细拆的兼容实现。
- Tencent IoT 直连实现从 service 层迁到 `apps/api/src/gateways/tencent-iot-video.ts`，`apps/api/src/services/tencent-iot-video.ts` 仅保留兼容导出。
- 本阶段未修改 controller 调用、API path、payload、返回结构和中文错误文案。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | 6 个目标入口文件均 `<= 500` 行 |
| `set -a; . apps/api/.env; set +a; bun run api:construction-stage-check` | 通过 | 输出 `summary: []`、`issues: []` |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 facade 导入、类型转发和 bundle |
| 项目状态和施工阶段一致性检查 | 通过 | 显式加载 `apps/api/.env` 后完成，未发现一致性问题 |
| 真实接口请求 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对项目、验收、摄像头写路径发请求 |

### 风险和遗留

- `apps/api/src/services/project-acceptances/legacy-service.ts`、`apps/api/src/services/projects/legacy-service.ts`、`apps/api/src/services/project-cameras/legacy-service.ts`、`apps/api/src/services/construction-stage-status/legacy-service.ts`、`apps/api/src/services/tenant-devices/legacy-service.ts` 仍为大文件；本次仅完成入口瘦身和第三方 IoT gateway 边界迁移，后续仍需按领域继续拆出模板、状态机、设备绑定、播放地址、成员候选等模块。
- `bun run api:construction-stage-check` 在当前 shell 不会自动获得 `apps/api/.env` 中的数据库变量；本阶段通过 `set -a; . apps/api/.env; set +a; bun run api:construction-stage-check` 显式加载环境后完成验收。

## 阶段 4 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split billing expense usage service facades`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1937 | 1 | `apps/api/src/services/expense-requests.ts` |
| 1401 | 1 | `apps/api/src/services/billing.ts` |
| 618 | 4 | `apps/api/src/services/sms.ts` |
| 616 | 1 | `apps/api/src/services/usage.ts` |
| 615 | 4 | `apps/api/src/services/task-center.ts` |

### 结构变化

- 5 个目标 service 入口均改为薄 facade，继续导出原有 service 实例、函数或类型，保持调用方 import path 不变。
- 原费用申请、计费、短信、用量、任务中心实现分别迁入对应 `legacy-service.ts` 目录，作为后续按审批流、余额流水、短信渠道、用量汇总、待办聚合继续细拆的兼容实现。
- 本阶段未修改 controller 调用、API path、payload、返回结构、扣费字段、余额字段、用量记录字段和中文错误文案。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | 5 个目标入口文件均 `<= 500` 行 |
| 导出引用扫描 | 通过 | 原调用方继续从 `@/services/billing`、`@/services/sms`、`@/services/usage`、`@/services/task-center`、`@/services/expense-requests` 导入 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 facade 导入、类型转发和 bundle |
| 费用、计费、用量、任务中心真实接口 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对费用审批、扣费、用量写路径发请求 |
| 短信真实发送 smoke | 未执行 | 本阶段不触发真实短信发送，仅通过编译级验证确认 `sendSmsCode`、`sendSmsTemplate` 导出兼容 |

### 风险和遗留

- `apps/api/src/services/expense-requests/legacy-service.ts`、`apps/api/src/services/billing/legacy-service.ts`、`apps/api/src/services/sms/legacy-service.ts`、`apps/api/src/services/usage/legacy-service.ts`、`apps/api/src/services/task-center/legacy-service.ts` 仍为大文件；本次仅完成入口瘦身，未完成 legacy 内部按申请创建、审批流、余额流水、短信渠道、用量聚合、待办聚合的实质拆分。
- 后续治理应优先拆 `billing/legacy-service.ts` 的余额校验、流水写入、冻结结算和定价规则，降低短信、社媒视频转写等调用方对单体 billing 的耦合。

## 阶段 5 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split marketing ai release service facades`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 2144 | 8 | `apps/api/src/services/decoration-qa.ts` |
| 1185 | 1 | `apps/api/src/services/marketing-pages.ts` |
| 1166 | 1 | `apps/api/src/services/release-deployments.ts` |
| 1100 | 1 | `apps/api/src/services/social-video-transcriptions.ts` |
| 897 | 1 | `apps/api/src/services/social-video-scripts.ts` |
| 727 | 5 | `apps/api/src/services/marketing-page-ai.ts` |

### 结构变化

- 6 个目标 service 入口均改为薄 facade，继续导出原有 service 实例或函数，保持调用方 import path 不变。
- 原装修问答、营销页、发布部署、社媒视频转写、社媒视频脚本、营销页 AI 实现分别迁入对应 `legacy-service.ts` 目录，作为后续按 AI gateway、prompt、调用日志、发布状态、视频 worker 和扣费边界继续细拆的兼容实现。
- 本阶段未修改 controller 调用、worker 调用、API path、payload、返回结构、AI prompt 输入、模型选择和扣费用量路径。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | 6 个目标入口文件均 `<= 500` 行 |
| 导出引用扫描 | 通过 | 原调用方继续从 `@/services/decoration-qa`、`@/services/marketing-pages`、`@/services/release-deployments`、`@/services/social-video-transcriptions`、`@/services/social-video-scripts`、`@/services/marketing-page-ai` 导入 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 facade 导入、类型转发和 bundle |
| 装修问答、营销页、社媒视频、发布部署真实接口 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对 AI 调用、视频转写提交、发布部署创建或回滚路径发请求 |
| 发布部署破坏性 smoke | 未执行 | 本阶段不触发生产发布、回滚或外部工作流 dispatch |

### 风险和遗留

- `apps/api/src/services/decoration-qa/legacy-service.ts`、`apps/api/src/services/marketing-pages/legacy-service.ts`、`apps/api/src/services/release-deployments/legacy-service.ts`、`apps/api/src/services/social-video-transcriptions/legacy-service.ts`、`apps/api/src/services/social-video-scripts/legacy-service.ts`、`apps/api/src/services/marketing-page-ai/legacy-service.ts` 仍为大文件；本次仅完成入口瘦身，未完成 legacy 内部按 AI gateway、prompt 构造、扣费、发布状态、worker 编排的实质拆分。
- 后续治理应优先拆 `social-video-transcriptions/legacy-service.ts` 的任务状态机、Apify/ASR gateway、扣费冻结结算和 worker 编排，降低社媒视频链路回归风险。

## 阶段 6 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split auth tenant customer service facades`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1554 | 1 | `apps/api/src/services/system-settings.ts` |
| 1058 | 4 | `apps/api/src/services/employee-project-detail-bootstrap.ts` |
| 649 | 5 | `apps/api/src/services/wechat-customer-identities.ts` |
| 615 | 1 | `apps/api/src/services/wechat-rebind-requests.ts` |
| 603 | 1 | `apps/api/src/services/customer-service-tickets.ts` |
| 593 | 1 | `apps/api/src/plugins/auth.ts` |
| 561 | 5 | `apps/api/src/services/customer-core.ts` |
| 535 | 6 | `apps/api/src/services/authorization.ts` |

### 结构变化

- 8 个目标入口均改为薄 facade，继续导出原有 service 实例、默认插件、命名函数和类型，保持调用方 import path 不变。
- 原系统设置、员工项目详情 bootstrap、微信客户身份、重绑申请、客服工单、auth plugin、客户核心、授权上下文实现分别迁入对应 `legacy-service.ts` 或 `legacy-plugin.ts`，作为后续按租户设置、公开/敏感配置、身份绑定、权限上下文继续细拆的兼容实现。
- 为满足阶段 6 全局静态门禁，顺手将 `apps/api/src/services/sms/legacy-service.ts` 中既有的直接 `throw new Error()` 改为 `Errors.business(...)` 包装；未修改短信发送 API、provider 调用参数或日志字段。
- 本阶段未修改 controller 调用、auth 上下文字段、tenant 上下文字段、权限响应语义、API path、payload、返回结构和中文错误文案。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | 8 个目标入口文件均 `<= 500` 行 |
| `rg 'tenant_id|tenantId' apps/api/src/services apps/api/src/repositories --count` | 通过 | 112 个文件存在租户字段引用，作为租户隔离关注面记录 |
| `rg 'throw new Error\(' apps/api/src/plugins apps/api/src/services` | 通过 | 无输出 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 facade 导入、默认插件导出、类型转发和 bundle |
| 管理员、员工、客户自助服务登录态真实接口 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对登录态链路发请求 |
| 租户隔离和微信身份绑定真实接口 smoke | 未执行 | 当前环境没有成对租户测试数据；未对跨租户访问、绑定、解绑、重绑写路径发请求 |
| 系统设置和客服工单真实接口 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对设置更新和工单状态写路径发请求 |

### 风险和遗留

- `apps/api/src/services/system-settings/legacy-service.ts`、`apps/api/src/services/employee-project-detail-bootstrap/legacy-service.ts`、`apps/api/src/services/wechat-customer-identities/legacy-service.ts`、`apps/api/src/services/wechat-rebind-requests/legacy-service.ts`、`apps/api/src/services/customer-service-tickets/legacy-service.ts`、`apps/api/src/plugins/auth/legacy-plugin.ts`、`apps/api/src/services/customer-core/legacy-service.ts`、`apps/api/src/services/authorization/legacy-service.ts` 仍为大文件；本次仅完成入口瘦身，未完成 legacy 内部按权限上下文、租户设置、身份绑定、客户隐私字段的实质拆分。
- 后续治理应优先拆 `authorization/legacy-service.ts` 和 `auth/legacy-plugin.ts` 的上下文缓存、微信凭证校验、业务绑定校验和路由白名单，降低认证链路回归风险。

## 阶段 7 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split large api repository facades`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1288 | 1 | `apps/api/src/repositories/marketing-pages.ts` |
| 1110 | 1 | `apps/api/src/repositories/permissions.ts` |
| 1049 | 1 | `apps/api/src/repositories/expense-requests.ts` |
| 1005 | 1 | `apps/api/src/repositories/billing.ts` |
| 904 | 1 | `apps/api/src/repositories/projects.ts` |
| 833 | 1 | `apps/api/src/repositories/project-cameras.ts` |
| 763 | 1 | `apps/api/src/repositories/project-acceptances.ts` |
| 99 | 99 | `apps/api/src/repositories/customer-project-log-share-campaigns.ts` |
| 728 | 1 | `apps/api/src/repositories/platform-tenants.ts` |
| 638 | 1 | `apps/api/src/repositories/tenant-devices.ts` |

### 结构变化

- 9 个仍超过 500 行的目标 repository 入口改为薄 facade，继续通过 `export *` 转发原有 repository 实例、类型和 select 常量，保持调用方 import path 不变。
- 原营销页、权限、费用申请、计费、项目、项目摄像头、项目验收、平台租户、租户设备 repository 实现分别迁入对应 `legacy-repository.ts`，作为后续按读写分离、列表/详情/统计查询继续细拆的兼容实现。
- `apps/api/src/repositories/customer-project-log-share-campaigns.ts` 已在阶段 2 降到 99 行，本阶段不再改动。
- 本阶段未修改 Supabase select/update/insert/delete 条件、查询参数、返回字段或错误包装方式。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | 10 个目标 repository 均 `<= 500` 行 |
| repository 顶层大文件扫描 | 通过 | `apps/api/src/repositories` 顶层无 `>= 500` 行 `.ts` 文件 |
| `rg -n "from \"fastify\"|from 'fastify'|Fastify|ResponseHandler|@/utils/response" apps/api/src/repositories` | 通过 | 无输出 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 repository facade 导入、类型转发和 bundle |
| repository 读写真实接口 smoke | 未执行 | 当前环境没有可用测试 token/测试租户数据；未对项目、验收、营销页、费用、计费、权限写路径发请求 |

### 风险和遗留

- 本阶段仍是入口瘦身，`legacy-repository.ts` 内部尚未按 read/write、列表、详情、统计、状态更新实质拆分。
- 后续治理应优先拆 `marketing-pages/legacy-repository.ts`、`permissions/legacy-repository.ts` 和 `billing/legacy-repository.ts`，这些文件仍承载最多复杂查询和写入路径。

## 阶段 8 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split storage migration script facades`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 716 | 4 | `apps/api/src/services/files/platform-file-storage.ts` |
| 666 | 1 | `apps/api/src/scripts/storage-migration-dry-run.ts` |
| 581 | 1 | `apps/api/src/scripts/storage-migration-upload.ts` |
| 502 | 1 | `apps/api/src/scripts/storage-migration-final-verify.ts` |

### 结构变化

- `platform-file-storage.ts` 改为薄 facade，继续导出 `platformFileStorageService` 和 `PlatformUploadScene`，保持调用方 import path 不变。
- 原平台文件存储实现迁入 `apps/api/src/services/files/platform-file-storage/legacy-service.ts`。
- 3 个迁移脚本入口保留原 CLI 路径，分别通过 top-level import 执行对应 `legacy-script.ts`，保持参数解析、输出格式和执行行为不变。
- 本阶段未修改 COS/Supabase 上传参数、文件对象字段、迁移 CSV 字段、dry-run 报告字段或真实上传开关语义。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| 目标入口文件行数门禁 | 通过 | 4 个目标入口均低于阶段阈值 |
| `bun --cwd apps/api src/scripts/storage-migration-output-smoke.ts --input /tmp/storage-migration-empty-final-verify-items.csv --limit 1 --out /tmp/gooes-storage-migration-output-smoke-phase8` | 通过 | 使用最小空 final-verify CSV 验证输出格式，结果 `passed=0, failed=0` |
| `bun --cwd apps/api src/scripts/storage-migration-dry-run.ts --all-tenants --limit 5 --out /tmp/gooes-storage-migration-dry-run-phase8` | 通过 | 只读 dry-run，结果 `total=5, migratable=5` |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 storage facade、CLI facade 和 bundle |
| dry-run 输出格式 | 通过 | dry-run 输出到 `/tmp/gooes-storage-migration-dry-run-phase8/...`，未写入仓库 |
| output smoke 输出格式 | 通过 | 使用空 final-verify CSV 验证 summary 和 CSV 输出链路 |
| 真实上传或删除 | 未执行 | 本阶段未传 `--apply`，未执行真实 COS 上传、删除或数据库写回 |

### 风险和遗留

- `apps/api/src/services/files/platform-file-storage/legacy-service.ts`、`apps/api/src/scripts/storage-migration-dry-run/legacy-script.ts`、`apps/api/src/scripts/storage-migration-upload/legacy-script.ts`、`apps/api/src/scripts/storage-migration-final-verify/legacy-script.ts` 仍为大文件；本阶段仅完成入口瘦身，未完成迁移共享 helper 的实质抽取。
- 后续治理应把 dry-run、upload、verify 共享的 CSV、报告输出、COS URL 解析、对象校验能力提取到 `services/files` 下的迁移 helper，减少脚本间复制。

## 阶段 9 执行记录

日期：2026-06-01
提交：本阶段提交 `chore: enforce api file size governance`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| - | - | `scripts/check-api-file-size.ts` |
| - | - | `package.json` |
| - | - | `apps/api/package.json` |
| - | - | `docs/2026-06-01-api-large-file-governance-phased-plan.md` |

### 结构变化

- 新增 `scripts/check-api-file-size.ts`，默认扫描 `apps/api` 下 `.ts/.tsx/.js/.jsx/.mjs/.cjs` 文件，排除 `node_modules`、`dist`、`build`、`coverage`。
- 根 `package.json` 新增 `api:check-file-size`，API 包 `apps/api/package.json` 新增 `check:file-size`。
- 检查脚本使用 500 行阈值，未记录豁免的文件 `>= 500` 行时直接失败。
- 生成文件和历史治理阶段产生的 legacy/gateway 文件作为显式豁免记录在 `scripts/check-api-file-size.ts` 的 `EXEMPTIONS` 中。

### 豁免记录

| 类型 | 文件数 | 理由 |
| --- | ---: | --- |
| 生成类型 | 1 | `apps/api/src/types/database.ts` 由 Supabase 生成，不纳入手写业务拆分 |
| legacy service/controller/plugin/script/repository | 40 | 前序阶段为保持行为不变迁出的兼容实现，已在各阶段风险和遗留中记录后续实拆方向 |
| gateway | 1 | `apps/api/src/gateways/tencent-iot-video.ts` 已从 service 层隔离为第三方 gateway，后续可按签名、设备、通道、播放地址继续拆分 |

`scripts/check-api-file-size.ts` 中逐一列出 42 个豁免文件及理由；新增大文件必须加入治理计划或拆分后才能通过 `api:check-file-size`。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 42 个显式豁免，0 个未记录超阈值文件 |
| 最终行数扫描 | 通过 | 输出 41 个非生成超阈值文件，均已在 `api:check-file-size` 豁免清单中记录 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 文件行数门禁 | 通过 | 新增未记录大文件会使 `api:check-file-size` 失败 |
| 全阶段执行记录 | 通过 | 阶段 0 到阶段 9 均已追加执行记录、测试记录、smoke 摘要和风险遗留 |
| 真实业务接口 smoke | 未执行 | 当前环境没有统一测试 token/租户数据；各阶段均以编译级 smoke 和专项脚本 smoke 作为本地验收 |

### 风险和遗留

- 当前治理把原大文件迁为显式 legacy 豁免，解决入口边界和新增门禁问题，但未完成所有 legacy 内部实质拆分。
- 后续新增代码必须先通过 `bun run api:check-file-size`；若确需超过 500 行，必须在治理文档中新增豁免理由和后续拆分计划。

## 后续 Legacy Phase 1 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split wechat auth legacy controller`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 2238 | 187 | `apps/api/src/services/wechat-auth-legacy-controller.ts` |
| - | 484 | `apps/api/src/services/wechat-auth-legacy/common.ts` |
| - | 406 | `apps/api/src/services/wechat-auth-legacy/login.ts` |
| - | 378 | `apps/api/src/services/wechat-auth-legacy/verify-role.ts` |
| - | 409 | `apps/api/src/services/wechat-auth-legacy/identity.ts` |
| - | 408 | `apps/api/src/services/wechat-auth-legacy/customer.ts` |
| - | 348 | `apps/api/src/services/wechat-auth-legacy/employee.ts` |
| - | 46 | `apps/api/src/services/wechat-auth-legacy/shared.ts` |

### 结构变化

- `wechat-auth-legacy-controller.ts` 只保留路由装饰器、BaseController 继承和薄委托，继续作为 `controllers/wechat/index.ts` 的兼容入口。
- 原登录、短信验证、客户租户选择、重绑、H5 session、员工绑定、客户绑定、公众号占位配置逻辑按职责拆入 `wechat-auth-legacy/` 子模块。
- 共享 schema、登录态类型、visitor 缓存 TTL 移入 `wechat-auth-legacy/shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/wechat-auth-legacy-controller.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 42 个减少到 41 个，`wechat-auth-legacy-controller.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `wechat-auth-legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖路由装饰器、委托方法、类型转发和 bundle |
| 真实微信登录/绑定接口 smoke | 未执行 | 当前环境没有可用微信 code、测试手机号验证码和测试租户数据；未对登录、绑定、换绑写路径发请求 |

### 风险和遗留

- 拆分后模块间仍通过 controller 实例 `this` 共享 helper，属于低风险结构拆分；后续可以继续把这些 helper 收敛为显式 runtime/context 对象，减少 `this` 依赖。
- 下一批 legacy 实拆建议处理 `customer-project-log-shares/legacy-service.ts` 或 `project-acceptances/legacy-service.ts`，两者仍是最大的遗留业务单体。

## 后续 Legacy Phase 2 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split customer project log share legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 4287 | 309 | `apps/api/src/services/customer-project-log-shares/legacy-service.ts` |
| - | 404 | `apps/api/src/services/customer-project-log-shares/legacy/base.ts` |
| - | 350 | `apps/api/src/services/customer-project-log-shares/legacy/config-access.ts` |
| - | 356 | `apps/api/src/services/customer-project-log-shares/legacy/customer-appointments.ts` |
| - | 329 | `apps/api/src/services/customer-project-log-shares/legacy/customer-campaigns.ts` |
| - | 460 | `apps/api/src/services/customer-project-log-shares/legacy/employee-config.ts` |
| - | 348 | `apps/api/src/services/customer-project-log-shares/legacy/employee-rewards.ts` |
| - | 439 | `apps/api/src/services/customer-project-log-shares/legacy/employee-shares.ts` |
| - | 320 | `apps/api/src/services/customer-project-log-shares/legacy/marketing-campaign-details.ts` |
| - | 403 | `apps/api/src/services/customer-project-log-shares/legacy/marketing-campaigns.ts` |
| - | 491 | `apps/api/src/services/customer-project-log-shares/legacy/owned-context.ts` |
| - | 312 | `apps/api/src/services/customer-project-log-shares/legacy/public-actions.ts` |
| - | 330 | `apps/api/src/services/customer-project-log-shares/legacy/public-campaigns.ts` |
| - | 485 | `apps/api/src/services/customer-project-log-shares/legacy/reward-config.ts` |
| - | 399 | `apps/api/src/services/customer-project-log-shares/legacy/share-campaign-core.ts` |
| - | 388 | `apps/api/src/services/customer-project-log-shares/legacy/shared-helpers.ts` |
| - | 267 | `apps/api/src/services/customer-project-log-shares/legacy/shared-types.ts` |
| - | 2 | `apps/api/src/services/customer-project-log-shares/legacy/shared.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留缓存字段、方法绑定和 `customerProjectLogShareService` 导出。
- 原客户分享、预约奖励、员工配置、员工领奖、营销活动、公开助力、配置解析、缓存和共享 helper 按职责拆入 `customer-project-log-shares/legacy/` 子模块。
- 对外入口 `apps/api/src/services/customer-project-log-shares.ts` 保持不变，继续转发既有 service 实例。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/customer-project-log-shares/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 41 个减少到 40 个，`customer-project-log-shares/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `customer-project-log-shares/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖分享活动、预约奖励、员工领奖、营销活动、公开助力和 bundle |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实业务接口 smoke | 未执行 | 当前环境没有统一测试 token、客户项目、营销活动和微信访问凭据；未对助力、领奖、预约奖励写路径发请求 |

### 风险和遗留

- 拆分后仍通过 service 实例 `this` 串联 helper，属于行为保持型结构拆分；后续可把运行时依赖收敛成显式 context，降低跨模块隐式耦合。
- `project-acceptances/legacy-service.ts`、`decoration-qa/legacy-service.ts`、`expense-requests/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 3 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split project acceptance legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 2728 | 406 | `apps/api/src/services/project-acceptances/legacy-service.ts` |
| - | 360 | `apps/api/src/services/project-acceptances/legacy/base.ts` |
| - | 449 | `apps/api/src/services/project-acceptances/legacy/create-update.ts` |
| - | 417 | `apps/api/src/services/project-acceptances/legacy/customer-actions.ts` |
| - | 283 | `apps/api/src/services/project-acceptances/legacy/customer-auth.ts` |
| - | 307 | `apps/api/src/services/project-acceptances/legacy/detail-bulk.ts` |
| - | 487 | `apps/api/src/services/project-acceptances/legacy/detail-sections.ts` |
| - | 418 | `apps/api/src/services/project-acceptances/legacy/image-metadata.ts` |
| - | 417 | `apps/api/src/services/project-acceptances/legacy/lists.ts` |
| - | 487 | `apps/api/src/services/project-acceptances/legacy/notifications.ts` |
| - | 421 | `apps/api/src/services/project-acceptances/legacy/permissions.ts` |
| - | 455 | `apps/api/src/services/project-acceptances/legacy/submit-review.ts` |
| - | 367 | `apps/api/src/services/project-acceptances/legacy/templates.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留缓存字段、方法绑定和 `projectAcceptanceService` 导出。
- 原验收单模板、详情构建、图片引用、权限校验、客户通知/open ticket、客户侧访问、创建更新、提交复核、客户确认/异议/整改/取消逻辑按职责拆入 `project-acceptances/legacy/` 子模块。
- 对外入口和 service 名称保持不变，既有 controller/import 不需要改动。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/project-acceptances/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 40 个减少到 39 个，`project-acceptances/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `project-acceptances/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖验收模板、创建更新、提交复核、客户通知、open ticket、客户确认/异议和 bundle |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实业务接口 smoke | 未执行 | 当前环境没有统一测试 token、项目验收单、客户手机号和短信通道测试数据；未对验收写路径发请求 |

### 风险和遗留

- 拆分后仍通过 service 实例 `this` 串联 helper，属于行为保持型结构拆分；后续可把模板、通知、客户访问、状态流转分别收敛为显式 context 或子 service。
- `decoration-qa/legacy-service.ts`、`expense-requests/legacy-service.ts`、`system-settings/legacy-service.ts`、`billing/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 4 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split decoration qa legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 2144 | 8 | `apps/api/src/services/decoration-qa/legacy-service.ts` |
| - | 368 | `apps/api/src/services/decoration-qa/legacy/ai-runtime.ts` |
| - | 493 | `apps/api/src/services/decoration-qa/legacy/chat.ts` |
| - | 84 | `apps/api/src/services/decoration-qa/legacy/identity.ts` |
| - | 216 | `apps/api/src/services/decoration-qa/legacy/project-context.ts` |
| - | 203 | `apps/api/src/services/decoration-qa/legacy/project-format.ts` |
| - | 409 | `apps/api/src/services/decoration-qa/legacy/shared.ts` |
| - | 322 | `apps/api/src/services/decoration-qa/legacy/suggestions.ts` |
| - | 186 | `apps/api/src/services/decoration-qa/legacy/usage.ts` |

### 结构变化

- `legacy-service.ts` 变为公开 API 聚合入口，只 re-export 推荐问题、普通问答、流式问答、流式事件序列化和系统 prompt 方法。
- AI 运行时配置、OpenAI/DeepSeek/OpenRouter 消息构造、问答解析、token 统计拆入 `ai-runtime.ts`。
- 客户/员工/访客 usage 归因拆入 `identity.ts` 和 `usage.ts`。
- 客户项目上下文查询、施工阶段上下文归一化、prompt 格式化拆入 `project-context.ts` 和 `project-format.ts`。
- 推荐问题缓存、AI 生成和 fallback 逻辑拆入 `suggestions.ts`；普通问答和流式问答拆入 `chat.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/decoration-qa/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 39 个减少到 38 个，`decoration-qa/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `decoration-qa/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖推荐问题、客户项目上下文、普通问答、流式问答和 bundle |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实 AI 接口 smoke | 未执行 | 当前阶段仅做结构拆分；未消耗真实模型额度，也未调用微信/租户项目测试数据 |

### 风险和遗留

- 拆分后 public API 保持原导出名称；内部模块仍共享 `shared.ts` 中的类型、prompt 常量和 cache map，后续可继续把 AI provider runtime 与业务 prompt 进一步分离。
- `expense-requests/legacy-service.ts`、`system-settings/legacy-service.ts`、`billing/legacy-service.ts`、`projects/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 5 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split expense request legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1937 | 111 | `apps/api/src/services/expense-requests/legacy-service.ts` |
| - | 221 | `apps/api/src/services/expense-requests/legacy/access.ts` |
| - | 286 | `apps/api/src/services/expense-requests/legacy/approval-chain.ts` |
| - | 194 | `apps/api/src/services/expense-requests/legacy/base.ts` |
| - | 222 | `apps/api/src/services/expense-requests/legacy/candidates.ts` |
| - | 280 | `apps/api/src/services/expense-requests/legacy/drafts.ts` |
| - | 129 | `apps/api/src/services/expense-requests/legacy/payment.ts` |
| - | 256 | `apps/api/src/services/expense-requests/legacy/queries.ts` |
| - | 328 | `apps/api/src/services/expense-requests/legacy/shared.ts` |
| - | 459 | `apps/api/src/services/expense-requests/legacy/workflow.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定和 `expenseRequestService` 导出。
- 公共类型、审批节点配置、金额/附件/关系序列化 helper 拆入 `shared.ts`。
- 读写权限、可见范围和审批候选 scope 逻辑拆入 `access.ts`。
- 审批链校验、当前节点、轮次和审批记录幂等写入拆入 `approval-chain.ts`。
- 审批人候选、项目候选和审批模板拆入 `candidates.ts`。
- 草稿创建、更新和提交拆入 `drafts.ts`；审批/驳回/撤回拆入 `workflow.ts`；打款登记拆入 `payment.ts`；详情、列表、统计、待办拆入 `queries.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/expense-requests/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 38 个减少到 37 个，`expense-requests/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `expense-requests/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖费用申请草稿、提交、审批、驳回、撤回、打款、查询统计和 bundle |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实业务接口 smoke | 未执行 | 当前环境没有统一测试 token、审批人权限配置、项目和费用申请测试数据；未对费用申请写路径发请求 |

### 风险和遗留

- 拆分后仍通过 service 实例 `this` 串联 helper，属于行为保持型结构拆分；后续可把审批链运行时和费用申请状态流转继续收敛成显式子 service。
- `system-settings/legacy-service.ts`、`billing/legacy-service.ts`、`projects/legacy-service.ts`、`marketing-pages/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 6 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split system settings legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1554 | 56 | `apps/api/src/services/system-settings/legacy-service.ts` |
| - | 153 | `apps/api/src/services/system-settings/legacy/crypto.ts` |
| - | 297 | `apps/api/src/services/system-settings/legacy/definitions-ai-social.ts` |
| - | 274 | `apps/api/src/services/system-settings/legacy/definitions-integrations.ts` |
| - | 183 | `apps/api/src/services/system-settings/legacy/definitions-sms.ts` |
| - | 135 | `apps/api/src/services/system-settings/legacy/definitions-wechat-notify.ts` |
| - | 88 | `apps/api/src/services/system-settings/legacy/definitions.ts` |
| - | 246 | `apps/api/src/services/system-settings/legacy/records.ts` |
| - | 246 | `apps/api/src/services/system-settings/legacy/settings.ts` |
| - | 43 | `apps/api/src/services/system-settings/legacy/shared.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留缓存字段、方法绑定和 `systemSettingsService` 导出。
- 设置定义按领域拆入 `definitions-sms.ts`、`definitions-integrations.ts`、`definitions-ai-social.ts`、`definitions-wechat-notify.ts`，再由 `definitions.ts` 汇总。
- 加密、解密、环境变量读取、配置值校验拆入 `crypto.ts`。
- 记录读取、effective 值合成、租户短信可编辑配置构造拆入 `records.ts`。
- 对外 list/update/getString/getNumber/getBoolean 等 API 拆入 `settings.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/system-settings/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 37 个减少到 36 个，`system-settings/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `system-settings/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖系统配置定义、租户覆盖、加密配置读取、更新写入和 bundle |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实配置写入 smoke | 未执行 | 当前阶段仅做结构拆分；未对生产/测试租户配置执行写入 |

### 风险和遗留

- 设置定义仍集中在多个静态数组文件中，属于低风险结构拆分；后续如配置继续增长，可按业务域迁移为 registry 目录。
- `billing/legacy-service.ts`、`projects/legacy-service.ts`、`marketing-pages/legacy-service.ts`、`project-cameras/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 7 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split billing legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1401 | 99 | `apps/api/src/services/billing/legacy-service.ts` |
| - | 247 | `apps/api/src/services/billing/legacy/ai-usage.ts` |
| - | 99 | `apps/api/src/services/billing/legacy/pricing.ts` |
| - | 324 | `apps/api/src/services/billing/legacy/runtime-charges.ts` |
| - | 402 | `apps/api/src/services/billing/legacy/shadow-events.ts` |
| - | 193 | `apps/api/src/services/billing/legacy/shadow.ts` |
| - | 137 | `apps/api/src/services/billing/legacy/shared.ts` |
| - | 251 | `apps/api/src/services/billing/legacy/tenant-platform.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定和 `billingService` 导出。
- 租户账户、平台汇总、租户列表、人工充值、平台流水和事件查询拆入 `tenant-platform.ts`。
- AI 用量统计和筛选项拆入 `ai-usage.ts`。
- 短信预扣校验、短信计费落账、社媒视频冻结/结算/解冻拆入 `runtime-charges.ts`。
- shadow billing 调度拆入 `shadow.ts`，shadow 事件构建、计费估算和定价规则匹配拆入 `shadow-events.ts`。
- 定价规则 CRUD、租户校验和审计日志拆入 `pricing.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/billing/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 36 个减少到 35 个，`billing/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `billing/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖账户查询、充值、计费事件、AI 用量统计、短信/视频扣费、shadow billing、定价规则和 bundle |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实计费写入 smoke | 未执行 | 当前阶段仅做结构拆分；未对租户账户、冻结、扣费、充值或定价规则执行真实写入 |

### 风险和遗留

- 拆分后仍通过 service 实例 `this` 复用定价和估算 helper，属于行为保持型结构拆分；后续可以把运行时扣费和 shadow billing 抽为显式子 service。
- `projects/legacy-service.ts`、`marketing-pages/legacy-service.ts`、`project-cameras/legacy-service.ts`、`release-deployments/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 8 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split projects legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1386 | 166 | `apps/api/src/services/projects/legacy-service.ts` |
| - | 139 | `apps/api/src/services/projects/legacy/base.ts` |
| - | 131 | `apps/api/src/services/projects/legacy/create-select.ts` |
| - | 435 | `apps/api/src/services/projects/legacy/detail-bootstrap.ts` |
| - | 215 | `apps/api/src/services/projects/legacy/lists.ts` |
| - | 235 | `apps/api/src/services/projects/legacy/mutations.ts` |
| - | 321 | `apps/api/src/services/projects/legacy/public-cache.ts` |
| - | 114 | `apps/api/src/services/projects/legacy/shared.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留缓存字段、方法绑定和 `projectSer` 导出。
- 基础关系归一化、公开可见性判断和主设计师/监理挂载拆入 `base.ts`。
- 项目列表查询、列表缓存 key、列表缓存读写和首页列表加载拆入 `lists.ts`。
- 公开项目列表、公开详情/日志/成员缓存、预热和缓存失效拆入 `public-cache.ts`。
- 项目创建下拉客户、员工候选和成员候选拆入 `create-select.ts`。
- 项目详情、员工端 bootstrap bundle、成员序列化和施工阶段 bootstrap 构造拆入 `detail-bootstrap.ts`。
- 项目创建、更新、状态流转、状态动作、施工阶段列表、删除和租户关系校验拆入 `mutations.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/projects/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 35 个减少到 34 个，`projects/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `projects/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖项目列表、公开项目详情、员工端 bootstrap、成员候选、创建更新、状态流转和删除入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实项目写入 smoke | 未执行 | 当前阶段仅做结构拆分；未对租户项目、成员、状态或施工阶段执行真实写入 |

### 风险和遗留

- 本阶段保留原 `projectSer` 外观和缓存字段，调用方导入路径不变；拆分后的模块仍通过 service 实例 `this` 共享缓存和 helper，属于行为保持型结构拆分。
- `marketing-pages/legacy-service.ts`、`project-cameras/legacy-service.ts`、`release-deployments/legacy-service.ts`、`social-video-transcriptions/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 9 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split marketing pages legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1288 | 168 | `apps/api/src/repositories/marketing-pages/legacy-repository.ts` |
| - | 61 | `apps/api/src/repositories/marketing-pages/legacy/events.ts` |
| - | 413 | `apps/api/src/repositories/marketing-pages/legacy/leads.ts` |
| - | 261 | `apps/api/src/repositories/marketing-pages/legacy/pages.ts` |
| - | 224 | `apps/api/src/repositories/marketing-pages/legacy/queries.ts` |
| - | 204 | `apps/api/src/repositories/marketing-pages/legacy/shared.ts` |
| - | 188 | `apps/api/src/repositories/marketing-pages/legacy/versions.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 Supabase client、表访问 helper、租户/项目范围 helper、方法绑定和 `marketingPageRepository` 导出。
- 共享记录类型、Supabase 非强类型表接口、错误消息解析、公开页排序和项目选项 select 定义拆入 `shared.ts`。
- 营销页列表、公开页列表、有效发布页、项目案例选项和项目日志封面查询拆入 `queries.ts`。
- 页面查找、租户查找、创建、更新、排序、归档和下线拆入 `pages.ts`。
- 版本号查询、草稿/版本查找、版本创建/更新、旧版本归档和发布标记拆入 `versions.ts`。
- 线索创建、防重查询、重复提交更新、客户身份查询、线索列表、跟进更新、转客户和客户匹配/创建 helper 拆入 `leads.ts`。
- 埋点写入和唯一键错误包装拆入 `events.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/marketing-pages/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 34 个减少到 33 个，`marketing-pages/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `marketing-pages/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖营销页列表、公开页、项目选项、页面 CRUD、版本发布、线索转客户和埋点写入入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实营销页写入 smoke | 未执行 | 当前阶段仅做结构拆分；未对页面、版本、线索、客户或埋点执行真实写入 |

### 风险和遗留

- 本阶段保留原 `marketingPageRepository` 外观和 Supabase 表 helper，调用方导入路径不变；拆分后的模块仍通过 repository 实例 `this` 共享表访问与范围过滤 helper，属于行为保持型结构拆分。
- `marketing-pages/legacy-service.ts`、`project-cameras/legacy-service.ts`、`release-deployments/legacy-service.ts`、`permissions/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 10 执行记录

日期：2026-06-01
提交：本阶段提交 `refactor: split marketing pages legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1185 | 97 | `apps/api/src/services/marketing-pages/legacy-service.ts` |
| - | 223 | `apps/api/src/services/marketing-pages/legacy/admin-list.ts` |
| - | 364 | `apps/api/src/services/marketing-pages/legacy/drafts.ts` |
| - | 160 | `apps/api/src/services/marketing-pages/legacy/leads-events.ts` |
| - | 233 | `apps/api/src/services/marketing-pages/legacy/pages.ts` |
| - | 165 | `apps/api/src/services/marketing-pages/legacy/public-h5.ts` |
| - | 235 | `apps/api/src/services/marketing-pages/legacy/shared.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定和 `marketingPageService` 导出。
- 共享配置、复制标题/slug、H5 base URL、手机号尾号、24 小时防重窗口、排序步长、关系归一化、图片 URL 解析和项目选项序列化拆入 `shared.ts`。
- 后台/平台列表、公开入口列表、项目案例选项、有效页排序和重排逻辑拆入 `admin-list.ts`。
- 页面详情、创建、更新、归档、下线、存在性校验和 slug 唯一性校验拆入 `pages.ts`。
- 草稿获取/保存、发布、复制、版本号和草稿版本创建逻辑拆入 `drafts.ts`。
- 公开 H5 页面按 slug 解析、H5 session 创建、营销 token 身份解析和展示窗口判断拆入 `public-h5.ts`。
- 公开提交线索、埋点、线索列表、线索跟进和线索转客户拆入 `leads-events.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/marketing-pages/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 33 个减少到 32 个，`marketing-pages/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `marketing-pages/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖租户/平台营销页管理、草稿发布、复制下线、公开 H5、session、线索和埋点入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实营销页写入 smoke | 未执行 | 当前阶段仅做结构拆分；未对页面、版本、线索、客户或埋点执行真实写入 |

### 风险和遗留

- 本阶段保留原 `marketingPageService` 外观，controller 和 wechat 登录链路导入路径不变；拆分后的模块仍通过 service 实例 `this` 复用私有 helper，属于行为保持型结构拆分。
- `project-cameras/legacy-service.ts`、`release-deployments/legacy-service.ts`、`permissions/legacy-repository.ts`、`social-video-transcriptions/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 11 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split project cameras legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1170 | 51 | `apps/api/src/services/project-cameras/legacy-service.ts` |
| - | 216 | `apps/api/src/services/project-cameras/legacy/access.ts` |
| - | 213 | `apps/api/src/services/project-cameras/legacy/channels.ts` |
| - | 168 | `apps/api/src/services/project-cameras/legacy/lists.ts` |
| - | 142 | `apps/api/src/services/project-cameras/legacy/mutations.ts` |
| - | 248 | `apps/api/src/services/project-cameras/legacy/playback.ts` |
| - | 292 | `apps/api/src/services/project-cameras/legacy/shared.ts` |
| - | 187 | `apps/api/src/services/project-cameras/legacy/tencent-device.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定和 `projectCameraService` 导出。
- 摄像头状态回写、腾讯通道状态 enrich、客户/员工访问主体解析、项目存在性校验和访问日志拆入 `access.ts`。
- 项目摄像头列表、绑定项目候选和项目摄像头分组拆入 `lists.ts`。
- 萤石设备通道候选和腾讯云设备/通道候选拆入 `channels.ts`。
- 腾讯云设备创建、SIP 密码查询和密码重置拆入 `tencent-device.ts`。
- 萤石/腾讯播放参数生成、播放 URL 选择、离线/加密/缺通道错误处理和播放访问日志拆入 `playback.ts`。
- 摄像头绑定创建、更新和解绑拆入 `mutations.ts`。
- 通用序列化、设备通道 key、租户设备资产状态、设备名称生成、腾讯设备类型标签和请求 meta 解析拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/project-cameras/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 32 个减少到 31 个，`project-cameras/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `project-cameras/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖摄像头列表、绑定候选、设备通道、腾讯设备创建/密码、播放参数和绑定 CRUD 入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实设备/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用萤石、腾讯云、租户设备资产或项目摄像头真实写入 |

### 风险和遗留

- 本阶段保留原 `projectCameraService` 外观，controller 导入路径不变；拆分后的模块仍通过 service 实例 `this` 复用访问控制、状态回写和日志 helper，属于行为保持型结构拆分。
- `release-deployments/legacy-service.ts`、`permissions/legacy-repository.ts`、`social-video-transcriptions/legacy-service.ts`、`employee-project-detail-bootstrap/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 12 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split release deployments legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1166 | 57 | `apps/api/src/services/release-deployments/legacy-service.ts` |
| - | 177 | `apps/api/src/services/release-deployments/legacy/dispatch.ts` |
| - | 159 | `apps/api/src/services/release-deployments/legacy/refs.ts` |
| - | 205 | `apps/api/src/services/release-deployments/legacy/runs.ts` |
| - | 163 | `apps/api/src/services/release-deployments/legacy/runtime.ts` |
| - | 429 | `apps/api/src/services/release-deployments/legacy/shared.ts` |
| - | 171 | `apps/api/src/services/release-deployments/legacy/tags.ts` |
| - | 216 | `apps/api/src/services/release-deployments/legacy/types.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定和 `releaseDeploymentService` 导出。
- GitHub workflow、run、job、ref、runtime 版本和审计记录类型拆入 `types.ts`。
- GitHub 请求、发布配置、workflow/service/ref 常量、run/audit 归一化、服务标签、SHA/日期格式化和运行时差异比对 helper 拆入 `shared.ts`。
- 发布选项、最新成功版本查询和 Docker 运行时版本比对拆入 `runtime.ts`。
- GitHub Actions run 列表、失败 job 汇总、审计记录 hydrate 和成功 ref 列表拆入 `runs.ts`。
- 分支、Tag、Commit ref 查询和 ref 存在性校验拆入 `refs.ts`。
- 发布 Tag、回滚 Tag、Tag 唯一性校验、下一版本号生成和 commit 解析拆入 `tags.ts`。
- workflow 空闲校验、活跃 run 查询、近期 run 匹配和发布 dispatch 拆入 `dispatch.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/release-deployments/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 31 个减少到 30 个，`release-deployments/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `release-deployments/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖发布选项、运行时版本、run 列表、失败汇总、成功 ref、ref 查询、Tag 创建、回滚 Tag 和 workflow dispatch 入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实 GitHub/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用 GitHub Actions、GitHub Git refs、Docker runtime 或平台审计真实写入 |

### 风险和遗留

- 本阶段保留原 `releaseDeploymentService` 外观，admin ops controller 导入路径不变；拆分后的模块仍通过 service 实例 `this` 复用私有 helper，属于行为保持型结构拆分。
- `permissions/legacy-repository.ts`、`social-video-transcriptions/legacy-service.ts`、`employee-project-detail-bootstrap/legacy-service.ts`、`expense-requests/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 13 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split permissions legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1110 | 157 | `apps/api/src/repositories/permissions/legacy-repository.ts` |
| - | 142 | `apps/api/src/repositories/permissions/legacy/context.ts` |
| - | 347 | `apps/api/src/repositories/permissions/legacy/employees.ts` |
| - | 150 | `apps/api/src/repositories/permissions/legacy/overrides.ts` |
| - | 127 | `apps/api/src/repositories/permissions/legacy/permissions.ts` |
| - | 240 | `apps/api/src/repositories/permissions/legacy/roles.ts` |
| - | 131 | `apps/api/src/repositories/permissions/legacy/shared.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 Supabase admin client、RPC、重试 helper、方法绑定和 `permissionRepository` 导出。
- 角色列表、角色详情、角色权限记录、角色 CRUD、按 ID 查询角色、按角色查员工和角色权限替换拆入 `roles.ts`。
- 权限列表、按 ID/code 查询、权限创建和更新拆入 `permissions.ts`。
- 员工查询、员工角色、部门员工、可见项目范围、项目租户、项目成员校验和员工角色替换拆入 `employees.ts`。
- 角色权限扁平查询、员工权限覆盖查询、覆盖 upsert 和删除拆入 `overrides.ts`。
- 员工权限上下文 RPC、回退组装逻辑和带权限的员工角色查询拆入 `context.ts`。
- 共享记录类型和 schema 输入类型重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/permissions/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 30 个减少到 29 个，`permissions/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `permissions/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖角色、权限、员工角色、权限覆盖、项目可见范围和员工权限上下文入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实权限写入 smoke | 未执行 | 当前阶段仅做结构拆分；未对角色、权限、员工角色或权限覆盖执行真实写入 |

### 风险和遗留

- 本阶段保留原 `permissionRepository` 外观，access policy、authorization、permissions service 等调用方导入路径不变；拆分后的模块仍通过 repository 实例 `this` 复用重试和 RPC helper，属于行为保持型结构拆分。
- `social-video-transcriptions/legacy-service.ts`、`employee-project-detail-bootstrap/legacy-service.ts`、`expense-requests/legacy-repository.ts`、`billing/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 14 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split social video transcription legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1100 | 34 | `apps/api/src/services/social-video-transcriptions/legacy-service.ts` |
| - | 241 | `apps/api/src/services/social-video-transcriptions/legacy/apify-gateway.ts` |
| - | 73 | `apps/api/src/services/social-video-transcriptions/legacy/billing.ts` |
| - | 179 | `apps/api/src/services/social-video-transcriptions/legacy/config.ts` |
| - | 208 | `apps/api/src/services/social-video-transcriptions/legacy/processor.ts` |
| - | 407 | `apps/api/src/services/social-video-transcriptions/legacy/shared.ts` |
| - | 159 | `apps/api/src/services/social-video-transcriptions/legacy/tasks.ts` |
| - | 60 | `apps/api/src/services/social-video-transcriptions/legacy/testing.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留 Apify gateway 实例、方法绑定和 `socialVideoTranscriptionService` 导出。
- Apify run 创建、轮询、dataset 读取、媒体地址解析和 Apify 直接转写拆入 `apify-gateway.ts`。
- 租户解析、转写 provider 配置、Apify 配置、媒体处理配置、功能开关、日限额和缓存查询拆入 `config.ts`。
- 任务创建、缓存复用、预冻结和任务读取拆入 `tasks.ts`。
- 腾讯 ASR 处理链路、媒体下载、ffmpeg 提取音频、Apify 备用转写和失败释放冻结拆入 `processor.ts`。
- 完成后结算、扣费事件回写和扣费失败记录拆入 `billing.ts`。
- Apify 测试入口拆入 `testing.ts`。
- URL 归一化、输入 hash、序列化、媒体下载安全校验、ffmpeg helper、计费时长计算、文本/数字/segments 归一化等共享逻辑拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/social-video-transcriptions/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 29 个减少到 28 个，`social-video-transcriptions/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `social-video-transcriptions/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖任务创建、任务查询、worker 处理、Apify 媒体解析、腾讯 ASR、计费结算和 Apify 测试入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实转写/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用 Apify、腾讯 ASR、ffmpeg、下载媒体或真实计费写入 |

### 风险和遗留

- 本阶段保留原 `socialVideoTranscriptionService` 外观，controller 和 worker 导入路径不变；拆分后的模块仍通过 service 实例 `this` 复用配置、Apify gateway 和结算 helper，属于行为保持型结构拆分。
- `employee-project-detail-bootstrap/legacy-service.ts`、`expense-requests/legacy-repository.ts`、`billing/legacy-repository.ts`、`projects/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 15 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split employee project detail bootstrap legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1058 | 89 | `apps/api/src/services/employee-project-detail-bootstrap/legacy-service.ts` |
| - | 177 | `apps/api/src/services/employee-project-detail-bootstrap/legacy/log-entry.ts` |
| - | 152 | `apps/api/src/services/employee-project-detail-bootstrap/legacy/next-action.ts` |
| - | 220 | `apps/api/src/services/employee-project-detail-bootstrap/legacy/orchestration.ts` |
| - | 371 | `apps/api/src/services/employee-project-detail-bootstrap/legacy/permissions.ts` |
| - | 128 | `apps/api/src/services/employee-project-detail-bootstrap/legacy/shared.ts` |
| - | 82 | `apps/api/src/services/employee-project-detail-bootstrap/legacy/timing.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定、类型重导出和 `employeeProjectDetailBootstrapService` 导出。
- 员工项目详情 bootstrap 主编排、状态动作构建和旧日志加载 helper 拆入 `orchestration.ts`。
- 施工日志入口摘要、日志聚合 map、blocked reason 和日志下一步动作拆入 `log-entry.ts`。
- 项目访问、施工日志创建、验收访问、成员归属和阶段补全权限判断拆入 `permissions.ts`。
- 项目状态/验收下一步动作选择、优先级、标题和描述构建拆入 `next-action.ts`。
- 可选模块超时、计时和 partial error 包装拆入 `timing.ts`。
- 共享类型、服务依赖和领域常量重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/employee-project-detail-bootstrap/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 28 个减少到 27 个，`employee-project-detail-bootstrap/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `employee-project-detail-bootstrap/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖员工项目详情 bootstrap、权限、成员、施工阶段、日志入口、日历和下一步动作入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实项目详情/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实员工项目详情接口或 Supabase 数据写入 |

### 风险和遗留

- 本阶段保留原 `employeeProjectDetailBootstrapService` 外观，status bootstrap controller 导入路径不变；拆分后的模块仍通过 service 实例 `this` 复用 helper，属于行为保持型结构拆分。
- `expense-requests/legacy-repository.ts`、`billing/legacy-repository.ts`、`projects/legacy-repository.ts`、`social-video-scripts/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 16 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split expense requests legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1049 | 171 | `apps/api/src/repositories/expense-requests/legacy-repository.ts` |
| - | 336 | `apps/api/src/repositories/expense-requests/legacy/approvals.ts` |
| - | 109 | `apps/api/src/repositories/expense-requests/legacy/base.ts` |
| - | 178 | `apps/api/src/repositories/expense-requests/legacy/lists.ts` |
| - | 121 | `apps/api/src/repositories/expense-requests/legacy/mutations.ts` |
| - | 44 | `apps/api/src/repositories/expense-requests/legacy/settlements.ts` |
| - | 170 | `apps/api/src/repositories/expense-requests/legacy/shared.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 summary/detail select、方法绑定和 `expenseRequestRepository` 导出。
- 费用申请详情、员工/项目存在性校验、项目候选查询拆入 `base.ts`。
- 创建、更新和费用明细替换拆入 `mutations.ts`。
- 审批记录幂等写入、审批链替换/读取/节点更新、审批候选人和候选人权限上下文拆入 `approvals.ts`。
- 打款登记和打款记录存在性校验拆入 `settlements.ts`。
- 列表查询、可见性过滤和统计行查询拆入 `lists.ts`。
- 共享 schema 类型、record 类型、payload 类型和 Supabase/Error 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/expense-requests/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 27 个减少到 26 个，`expense-requests/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `expense-requests/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖费用申请详情、创建更新、明细替换、审批链、审批候选人、打款、列表和统计入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实费用申请/API smoke | 未执行 | 当前阶段仅做结构拆分；未对费用申请、审批链或打款记录执行真实写入 |

### 风险和遗留

- 本阶段保留原 `expenseRequestRepository` 外观，expense request service 调用路径不变；拆分后的模块仍通过 repository 实例 `this` 复用 summary/detail select 和 helper，属于行为保持型结构拆分。
- `billing/legacy-repository.ts`、`projects/legacy-repository.ts`、`social-video-scripts/legacy-service.ts`、`project-cameras/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 17 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split billing legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 1005 | 125 | `apps/api/src/repositories/billing/legacy-repository.ts` |
| - | 155 | `apps/api/src/repositories/billing/legacy/accounts.ts` |
| - | 292 | `apps/api/src/repositories/billing/legacy/events.ts` |
| - | 98 | `apps/api/src/repositories/billing/legacy/pricing-rules.ts` |
| - | 228 | `apps/api/src/repositories/billing/legacy/shadow-logs.ts` |
| - | 234 | `apps/api/src/repositories/billing/legacy/shared.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 Supabase admin client、`from/rpc` helper、价格规则 mapper、方法绑定和 `billingRepository` 导出。
- 租户账户初始化、账户查询、租户候选、租户统计、平台账户汇总和人工充值拆入 `accounts.ts`。
- 积分流水、计费事件查询、事件 key、事件创建/查找、事件结算、冻结和解冻积分拆入 `events.ts`。
- AI、短信、短视频影子计费日志扫描和 AI 用量筛选选项拆入 `shadow-logs.ts`。
- 价格规则列表、创建和更新拆入 `pricing-rules.ts`。
- 共享 schema 类型、record 类型、payload 类型和 Supabase/Error/UUID 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/billing/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 26 个减少到 25 个，`billing/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `billing/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖租户账户、人工充值、积分流水、计费事件、影子日志、冻结/解冻和价格规则入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实计费/API smoke | 未执行 | 当前阶段仅做结构拆分；未执行真实充值、结算、冻结、解冻或价格规则写入 |

### 风险和遗留

- 本阶段保留原 `billingRepository` 外观，billing service 调用路径不变；拆分后的模块仍通过 repository 实例 `this` 复用 Supabase helper 和价格规则 mapper，属于行为保持型结构拆分。
- `projects/legacy-repository.ts`、`social-video-scripts/legacy-service.ts`、`project-cameras/legacy-repository.ts`、`project-acceptances/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 18 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split projects legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 904 | 114 | `apps/api/src/repositories/projects/legacy-repository.ts` |
| - | 180 | `apps/api/src/repositories/projects/legacy/create-options.ts` |
| - | 92 | `apps/api/src/repositories/projects/legacy/detail.ts` |
| - | 150 | `apps/api/src/repositories/projects/legacy/lists.ts` |
| - | 168 | `apps/api/src/repositories/projects/legacy/mutations.ts` |
| - | 65 | `apps/api/src/repositories/projects/legacy/public.ts` |
| - | 212 | `apps/api/src/repositories/projects/legacy/shared.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 RPC helper、项目列表过滤 helper、方法绑定和 `projectRepository` 导出。
- 今日工作项目、项目计数和项目列表行查询拆入 `lists.ts`。
- 项目基础详情、租户详情、员工首屏详情和员工项目首屏聚合 RPC 拆入 `detail.ts`。
- 公开项目可见性过滤、公开项目列表/详情和公开日志查询拆入 `public.ts`。
- 项目创建、客户/房产租户校验、已有项目校验、创建页客户和员工候选查询拆入 `create-options.ts`。
- 项目更新、状态条件更新和排期开工状态流转 RPC 拆入 `mutations.ts`。
- 共享 select、filter 类型、RPC 错误规范化、Supabase OR 转义和基础依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/projects/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 25 个减少到 24 个，`projects/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `projects/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖项目列表、详情、公开项目、创建候选、更新、状态条件更新和排期开工 RPC 入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实项目/API smoke | 未执行 | 当前阶段仅做结构拆分；未对项目、公开项目日志或排期开工 RPC 执行真实写入 |

### 风险和遗留

- 本阶段保留原 `projectRepository` 外观，projects service 调用路径不变；拆分后的模块仍通过 repository 实例 `this` 复用 RPC 和列表过滤 helper，属于行为保持型结构拆分。
- `social-video-scripts/legacy-service.ts`、`project-cameras/legacy-repository.ts`、`project-acceptances/legacy-repository.ts`、`customer-project-log-share-campaigns/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 19 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split social video scripts legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 897 | 31 | `apps/api/src/services/social-video-scripts/legacy-service.ts` |
| - | 137 | `apps/api/src/services/social-video-scripts/legacy/ai-config.ts` |
| - | 132 | `apps/api/src/services/social-video-scripts/legacy/ai-generation.ts` |
| - | 169 | `apps/api/src/services/social-video-scripts/legacy/generation.ts` |
| - | 61 | `apps/api/src/services/social-video-scripts/legacy/lists.ts` |
| - | 143 | `apps/api/src/services/social-video-scripts/legacy/normalization.ts` |
| - | 48 | `apps/api/src/services/social-video-scripts/legacy/permissions.ts` |
| - | 122 | `apps/api/src/services/social-video-scripts/legacy/shared.ts` |
| - | 119 | `apps/api/src/services/social-video-scripts/legacy/usage.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留方法绑定和 `socialVideoScriptService` 导出。
- AI endpoint、API key、模型、超时、OpenRouter header 和直接 OpenAI 兼容请求 helper 拆入 `ai-config.ts`。
- AI prompt 构造、`aiGateway.chat` 调用、JSON repair 重试和模型/provider 回传拆入 `ai-generation.ts`。
- AI 返回解析、字符串截断、脚本结构归一化、缓存时间和脚本序列化拆入 `normalization.ts`。
- 管理权限、转写任务访问校验和租户解析拆入 `permissions.ts`。
- 每日限额、缓存命中、输入兼容归一化和脚本生成主流程拆入 `generation.ts`。
- 用户/管理员脚本列表拆入 `lists.ts`。
- 转写、脚本和 AI 调用用量汇总拆入 `usage.ts`。
- 共享 schema 类型、label/prompt 常量、仓库、AI gateway 和 settings 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/social-video-scripts/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 24 个减少到 23 个，`social-video-scripts/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `social-video-scripts/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖脚本生成、AI prompt/解析、缓存、权限、脚本列表和用量汇总入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实 AI/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实 AI gateway、OpenAI/DeepSeek/OpenRouter 或写入脚本记录 |

### 风险和遗留

- 本阶段保留原 `socialVideoScriptService` 外观，controller 导入路径不变；拆分后的模块仍通过 service 实例 `this` 复用权限、缓存和序列化 helper，属于行为保持型结构拆分。
- `project-cameras/legacy-repository.ts`、`project-acceptances/legacy-repository.ts`、`customer-project-log-share-campaigns/legacy-repository.ts`、`platform-tenants/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 20 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split project cameras legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 833 | 47 | `apps/api/src/repositories/project-cameras/legacy-repository.ts` |
| - | 78 | `apps/api/src/repositories/project-cameras/legacy/access.ts` |
| - | 300 | `apps/api/src/repositories/project-cameras/legacy/bind-options.ts` |
| - | 171 | `apps/api/src/repositories/project-cameras/legacy/mutations.ts` |
| - | 130 | `apps/api/src/repositories/project-cameras/legacy/queries.ts` |
| - | 171 | `apps/api/src/repositories/project-cameras/legacy/shared.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 Supabase admin client、方法绑定和 `projectCameraRepository` 导出。
- 客户自有项目租户校验和项目基础读取拆入 `access.ts`。
- 绑定项目搜索、客户/房产匹配、绑定项目候选和项目摄像头分组拆入 `bind-options.ts`。
- 项目摄像头列表、项目摄像头详情、设备通道绑定查询和 vendor 绑定列表拆入 `queries.ts`。
- 摄像头绑定创建、更新、状态更新、软删除和访问日志写入拆入 `mutations.ts`。
- 共享 record 类型、schema 类型、项目选项序列化、手机号脱敏、关键词清理和基础依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/project-cameras/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 23 个减少到 22 个，`project-cameras/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `project-cameras/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖客户项目权限、绑定项目候选、摄像头分组、设备绑定查询、CRUD、状态更新和访问日志入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实摄像头/API smoke | 未执行 | 当前阶段仅做结构拆分；未执行真实摄像头绑定、解绑、状态同步或访问日志写入 |

### 风险和遗留

- 本阶段保留原 `projectCameraRepository` 外观，project camera service 调用路径不变；拆分后的模块仍通过 repository 实例 `this` 复用 Supabase admin client 和搜索 helper，属于行为保持型结构拆分。
- `project-acceptances/legacy-repository.ts`、`customer-project-log-share-campaigns/legacy-repository.ts`、`platform-tenants/legacy-repository.ts`、`marketing-page-ai/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 21 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split project acceptances legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 763 | 87 | `apps/api/src/repositories/project-acceptances/legacy-repository.ts` |
| - | 113 | `apps/api/src/repositories/project-acceptances/legacy/acceptances.ts` |
| - | 126 | `apps/api/src/repositories/project-acceptances/legacy/items-actions.ts` |
| - | 45 | `apps/api/src/repositories/project-acceptances/legacy/people.ts` |
| - | 129 | `apps/api/src/repositories/project-acceptances/legacy/projects.ts` |
| - | 203 | `apps/api/src/repositories/project-acceptances/legacy/shared.ts` |
| - | 176 | `apps/api/src/repositories/project-acceptances/legacy/templates.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留方法绑定和 `projectAcceptanceRepository` 导出。
- 验收模板列表、模板详情、模板更新、模板分组和标准项维护拆入 `templates.ts`。
- 项目读取、批量项目读取、主施工经理查询、进行中验收检查和阶段最新验收查询拆入 `projects.ts`。
- 验收单创建、验收项批量创建、验收单列表、验收单详情、验收单更新和草稿删除拆入 `acceptances.ts`。
- 验收项列表、批量验收项、操作记录列表、批量操作记录、验收项更新和操作记录创建拆入 `items-actions.ts`。
- 员工、客户和租户状态查询拆入 `people.ts`。
- 共享 row 类型、列表输入类型、领域类型和 Supabase/Error 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/project-acceptances/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 22 个减少到 21 个，`project-acceptances/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `project-acceptances/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖模板、项目辅助查询、验收单、验收项、操作记录、员工、客户和租户入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实验收/API smoke | 未执行 | 当前阶段仅做结构拆分；未执行真实验收模板、验收单、验收项或操作记录写入 |

### 风险和遗留

- 本阶段保留原 `projectAcceptanceRepository` 外观，project acceptance service 调用路径不变；拆分后的模块仍为行为保持型结构拆分。
- `customer-project-log-share-campaigns/legacy-repository.ts`、`platform-tenants/legacy-repository.ts`、`marketing-page-ai/legacy-service.ts`、`files/platform-file-storage/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 22 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split customer project log share campaigns legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 751 | 52 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts` |
| - | 184 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/campaigns.ts` |
| - | 148 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/employee-list.ts` |
| - | 144 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/engagement.ts` |
| - | 102 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/queries.ts` |
| - | 85 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/shared.ts` |
| - | 95 | `apps/api/src/repositories/customer-project-log-share-campaigns/legacy/stats.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留方法绑定和 `customerProjectLogShareCampaignRepository` 导出。
- 活动基础查询、token/id/voucher 查询、项目活动列表和项目进行中活动查询拆入 `queries.ts`。
- 活动创建、助力指标更新、领奖信息更新、海报保存/打开时间触达和活动状态更新拆入 `campaigns.ts`。
- 分享打开记录、助力记录查询/创建、助力人数统计和有效助力列表拆入 `engagement.ts`。
- 项目状态统计、营销活动状态统计和管理端汇总统计拆入 `stats.ts`。
- 员工端助力活动管理列表拆入 `employee-list.ts`。
- 共享活动 row、助力 row、员工列表 row 类型和 Supabase/Error 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/customer-project-log-share-campaigns/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 21 个减少到 20 个，`customer-project-log-share-campaigns/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `customer-project-log-share-campaigns/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖活动基础查询、创建更新、打开/助力记录、统计汇总和员工管理列表入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实分享活动/API smoke | 未执行 | 当前阶段仅做结构拆分；未执行真实分享活动、打开记录、助力记录或领奖信息写入 |

### 风险和遗留

- 本阶段保留原 `customerProjectLogShareCampaignRepository` 外观，customer project log share service 调用路径不变；拆分后的模块仍为行为保持型结构拆分。
- `platform-tenants/legacy-repository.ts`、`marketing-page-ai/legacy-service.ts`、`files/platform-file-storage/legacy-service.ts`、`storage-migration-dry-run/legacy-script.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 23 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split platform tenants legacy repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 728 | 63 | `apps/api/src/repositories/platform-tenants/legacy-repository.ts` |
| - | 339 | `apps/api/src/repositories/platform-tenants/legacy/initialization.ts` |
| - | 122 | `apps/api/src/repositories/platform-tenants/legacy/members.ts` |
| - | 118 | `apps/api/src/repositories/platform-tenants/legacy/shared.ts` |
| - | 123 | `apps/api/src/repositories/platform-tenants/legacy/tenants.ts` |
| - | 54 | `apps/api/src/repositories/platform-tenants/legacy/usage.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，只保留 Supabase client、`from` helper、方法绑定和 `platformTenantRepository` 导出。
- 租户列表、按 ID/slug 查询、创建、更新和状态更新拆入 `tenants.ts`。
- 租户用量统计和最近模板应用记录查询拆入 `usage.ts`。
- 手机号员工查询、员工/角色批量读取、租户管理员员工查询和租户角色列表拆入 `members.ts`。
- 默认部门、岗位、角色、管理员员工、管理员权限、员工角色绑定和模板应用记录初始化拆入 `initialization.ts`。
- 共享 row 类型、初始化结果类型、用量常量、领域配置和 Supabase/Error 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/platform-tenants/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 20 个减少到 19 个，`platform-tenants/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `platform-tenants/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖租户列表、CRUD、状态、用量、员工角色读取和默认模板初始化入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实租户/API smoke | 未执行 | 当前阶段仅做结构拆分；未执行真实租户创建、默认数据初始化、角色授权或管理员员工写入 |

### 风险和遗留

- 本阶段保留原 `platformTenantRepository` 外观，platform tenant service 调用路径不变；拆分后的模块仍通过 repository 实例 `this` 复用 `from` helper，属于行为保持型结构拆分。
- `marketing-page-ai/legacy-service.ts`、`files/platform-file-storage/legacy-service.ts`、`storage-migration-dry-run/legacy-script.ts`、`construction-stage-status/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 24 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split marketing page ai legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 727 | 5 | `apps/api/src/services/marketing-page-ai/legacy-service.ts` |
| - | 137 | `apps/api/src/services/marketing-page-ai/legacy/ai-config.ts` |
| - | 215 | `apps/api/src/services/marketing-page-ai/legacy/fill-actions.ts` |
| - | 117 | `apps/api/src/services/marketing-page-ai/legacy/normalization.ts` |
| - | 126 | `apps/api/src/services/marketing-page-ai/legacy/prompts.ts` |
| - | 149 | `apps/api/src/services/marketing-page-ai/legacy/shared.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 re-export facade，只保留三项 AI 填充函数导出。
- AI endpoint、API key、模型、超时、OpenRouter header、直连 OpenAI 兼容请求和内容提取 helper 拆入 `ai-config.ts`。
- 模块字段白名单、页面设置字段白名单、块/页面摘要和三类 user prompt 构造拆入 `prompts.ts`。
- JSON 解析、字符截断、slug 归一化、patch 归一化、创建结果归一化和计费上下文解析拆入 `normalization.ts`。
- 模块文案填充、页面设置填充和新建页面标题描述生成三项 AI 入口拆入 `fill-actions.ts`。
- 共享 schema 类型、AI 请求类型、字段定义、提示词常量、字段定义常量和 AI gateway/settings/Error 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/marketing-page-ai/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 19 个减少到 18 个，`marketing-page-ai/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `marketing-page-ai/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖模块填充、页面设置填充、新建页面 AI 生成、prompt 构造和 patch 归一化入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实 AI/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实 AI gateway、OpenAI/DeepSeek/OpenRouter 或写入营销页配置 |

### 风险和遗留

- 本阶段保留原 `fillMarketingPageBlockWithAi`、`fillMarketingPageSettingsWithAi`、`fillMarketingPageCreateWithAi` 导出，marketing page controller 调用路径不变；拆分后的模块仍为行为保持型结构拆分。
- `files/platform-file-storage/legacy-service.ts`、`storage-migration-dry-run/legacy-script.ts`、`construction-stage-status/legacy-service.ts`、`wechat-customer-identities/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 25 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split platform file storage legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 716 | 39 | `apps/api/src/services/files/platform-file-storage/legacy-service.ts` |
| - | 129 | `apps/api/src/services/files/platform-file-storage/legacy/config.ts` |
| - | 139 | `apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts` |
| - | 91 | `apps/api/src/services/files/platform-file-storage/legacy/paths.ts` |
| - | 191 | `apps/api/src/services/files/platform-file-storage/legacy/shared.ts` |
| - | 173 | `apps/api/src/services/files/platform-file-storage/legacy/uploads.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留 COS client/config cache 字段、方法绑定和 `platformFileStorageService` 导出。
- 存储 provider、COS 配置读取、COS client cache、直传 HEAD 校验开关和 COS access cache 写入拆入 `config.ts`。
- legacy path、COS object key、COS public URL 和上传响应序列化拆入 `paths.ts`。
- 腾讯 COS 上传、Supabase legacy bucket 上传和统一图片上传登记拆入 `uploads.ts`。
- COS 直传签名、直传完成和既有 COS object 登记拆入 `direct-upload.ts`。
- 共享类型、常量、路径/文件名 helper、etag 归一化、mime 推断、计时日志和外部依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/files/platform-file-storage/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 18 个减少到 17 个，`files/platform-file-storage/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `platform-file-storage/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖普通上传、COS/Supabase 分支、直传签名、直传完成和既有 COS object 登记入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实存储/API smoke | 未执行 | 当前阶段仅做结构拆分；未执行真实 COS/Supabase 上传、HEAD 校验或文件对象写入 |

### 风险和遗留

- 本阶段保留原 `platformFileStorageService` 外观，file upload service 调用路径不变；拆分后的模块仍通过 service 实例 `this` 复用 COS client/config cache，属于行为保持型结构拆分。
- `storage-migration-dry-run/legacy-script.ts`、`construction-stage-status/legacy-service.ts`、`wechat-customer-identities/legacy-service.ts`、`tenant-devices/legacy-repository.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 26 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split storage migration dry run script`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 666 | 6 | `apps/api/src/scripts/storage-migration-dry-run/legacy-script.ts` |
| - | 100 | `apps/api/src/scripts/storage-migration-dry-run/legacy/classification.ts` |
| - | 50 | `apps/api/src/scripts/storage-migration-dry-run/legacy/cli.ts` |
| - | 44 | `apps/api/src/scripts/storage-migration-dry-run/legacy/csv.ts` |
| - | 54 | `apps/api/src/scripts/storage-migration-dry-run/legacy/runner.ts` |
| - | 128 | `apps/api/src/scripts/storage-migration-dry-run/legacy/scan.ts` |
| - | 117 | `apps/api/src/scripts/storage-migration-dry-run/legacy/shared.ts` |
| - | 194 | `apps/api/src/scripts/storage-migration-dry-run/legacy/sources.ts` |

### 结构变化

- `legacy-script.ts` 变为兼容入口，只保留 `main()` 调用和错误输出，`storage-migration-dry-run.ts` 的导入路径不变。
- CLI 参数解析和必填参数校验拆入 `cli.ts`。
- 迁移扫描源配置、租户 ID 递归解析、数组/单值/metadata 字段提取拆入 `sources.ts`。
- COS/Supabase legacy 值分类、Supabase public URL 解析和远端 HEAD 大小检查拆入 `classification.ts`。
- CSV escape、通用 CSV 输出和 report CSV 输出拆入 `csv.ts`。
- Supabase 表扫描、target object key 生成接入和汇总统计拆入 `scan.ts`。
- 输出目录创建、summary/items/failures/tenants 文件写入和控制台摘要拆入 `runner.ts`。
- 共享类型、legacy bucket、COS 前缀、字符串归一化、object key 生成和 Supabase public URL helper 拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/scripts/storage-migration-dry-run/legacy-script.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 17 个减少到 16 个，`storage-migration-dry-run/legacy-script.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `storage-migration-dry-run/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 CLI、扫描源、分类、CSV、汇总和 runner 入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| dry-run 只读脚本 smoke | 通过 | `bun --cwd apps/api src/scripts/storage-migration-dry-run.ts --all-tenants --limit 1 --out /tmp/gooes-storage-migration-dry-run-phase26` 输出 `total=1, migratable=1`，只写 `/tmp` 报告目录 |

### 风险和遗留

- 本阶段保留原 dry-run 输出文件名、CSV header、summary 字段、控制台摘要和 `--check-remote` 语义，属于行为保持型结构拆分。
- `construction-stage-status/legacy-service.ts`、`wechat-customer-identities/legacy-service.ts`、`tenant-devices/legacy-repository.ts`、`sms/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 27 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split construction stage status service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 659 | 22 | `apps/api/src/services/construction-stage-status/legacy-service.ts` |
| - | 136 | `apps/api/src/services/construction-stage-status/legacy/assertions.ts` |
| - | 12 | `apps/api/src/services/construction-stage-status/legacy/labels.ts` |
| - | 214 | `apps/api/src/services/construction-stage-status/legacy/lists.ts` |
| - | 123 | `apps/api/src/services/construction-stage-status/legacy/permissions.ts` |
| - | 50 | `apps/api/src/services/construction-stage-status/legacy/rows.ts` |
| - | 27 | `apps/api/src/services/construction-stage-status/legacy/shared.ts` |
| - | 149 | `apps/api/src/services/construction-stage-status/legacy/stage-item.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，只保留原 service 实例和六个 public 方法挂载，`@/services/construction-stage-status` 导出路径不变。
- 项目施工阶段列表入口、项目级列表编排和 rows 构造成响应 payload 拆入 `lists.ts`。
- 施工日志创建断言、验收创建断言、竣工验收前置阶段断言拆入 `assertions.ts`。
- 验收可写权限、可选权限访问、创建人提交/复核权限判断拆入 `permissions.ts`。
- 最新验收记录选择和已验收阶段集合查询拆入 `rows.ts`。
- 阶段 label、验收 label 拆入 `labels.ts`。
- 单个阶段状态、日志/验收可创建状态、验收动作 payload 构造拆入 `stage-item.ts`。
- 共享 repository、domain 类型/常量、access policy、Errors 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/construction-stage-status/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 16 个减少到 15 个，`construction-stage-status/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `construction-stage-status/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖阶段列表、rows 构造、日志写入断言、验收创建断言和权限判断入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实项目/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实项目详情、验收创建或施工日志写入接口 |

### 风险和遗留

- 本阶段保留 `constructionStageStatusService` 外观和六个 public 方法名称，项目、施工日志、验收、客户自助和装修问答调用路径不变；拆分后的模块仍为行为保持型结构拆分。
- `wechat-customer-identities/legacy-service.ts`、`tenant-devices/legacy-repository.ts`、`sms/legacy-service.ts`、`tencent-iot-video.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 28 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split wechat customer identity service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 649 | 59 | `apps/api/src/services/wechat-customer-identities/legacy-service.ts` |
| - | 108 | `apps/api/src/services/wechat-customer-identities/legacy/binding.ts` |
| - | 175 | `apps/api/src/services/wechat-customer-identities/legacy/cache.ts` |
| - | 157 | `apps/api/src/services/wechat-customer-identities/legacy/login-state.ts` |
| - | 119 | `apps/api/src/services/wechat-customer-identities/legacy/mappers.ts` |
| - | 45 | `apps/api/src/services/wechat-customer-identities/legacy/shared.ts` |
| - | 137 | `apps/api/src/services/wechat-customer-identities/legacy/tenant-options.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，保留原 service 单例、缓存 map 状态、类型导出和 public 方法名称，`@/services/wechat-customer-identities` 导出路径不变。
- 客户租户选项缓存、登录 membership 缓存、openid 登录状态缓存、in-flight 合并和失效逻辑拆入 `cache.ts`。
- 租户关系归一化、活跃客户过滤、登录 membership 映射、客户选项映射、员工登录行过滤和项目摘要 enrich 拆入 `mappers.ts`。
- 微信登录 membership state、openid 登录 state、登录状态 row 归一化和缓存回填拆入 `login-state.ts`。
- 按手机号、auth user、memberships 查询客户租户选项和客户租户详情查询拆入 `tenant-options.ts`。
- 客户 auth user 绑定、自助注册/手机号绑定和业务 membership 同步拆入 `binding.ts`。
- 共享 repository、Errors、user identity、rebind request、缓存 TTL 和类型重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/wechat-customer-identities/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 15 个减少到 14 个，`wechat-customer-identities/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `wechat-customer-identities/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖微信登录态解析、客户租户选项缓存、客户绑定、自助注册和 membership 同步入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实微信/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实微信登录、客户绑定、自助注册或 rebind request 流程 |

### 风险和遗留

- 本阶段保留缓存状态在 `wechatCustomerIdentityService` 单例实例上，拆出函数通过显式 `this` 上下文访问缓存 map，避免改变缓存生命周期。
- `tenant-devices/legacy-repository.ts`、`sms/legacy-service.ts`、`tencent-iot-video.ts`、`tenant-devices/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 29 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split tenant devices repository`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 638 | 51 | `apps/api/src/repositories/tenant-devices/legacy-repository.ts` |
| - | 121 | `apps/api/src/repositories/tenant-devices/legacy/camera-sync.ts` |
| - | 39 | `apps/api/src/repositories/tenant-devices/legacy/filters.ts` |
| - | 104 | `apps/api/src/repositories/tenant-devices/legacy/hydrate.ts` |
| - | 203 | `apps/api/src/repositories/tenant-devices/legacy/mutations.ts` |
| - | 196 | `apps/api/src/repositories/tenant-devices/legacy/queries.ts` |
| - | 74 | `apps/api/src/repositories/tenant-devices/legacy/shared.ts` |

### 结构变化

- `legacy-repository.ts` 变为兼容 facade，保留 `tenantDeviceRepository` 单例、`adminClient` 实例状态、原方法名和原类型 re-export。
- 租户设备列表过滤、关键词 OR 查询和 ID 去重 helper 拆入 `filters.ts`。
- 平台设备行 hydrate、租户/项目/摄像头轻量查询拆入 `hydrate.ts`。
- 普通列表、平台列表、按 ID 查询、按 vendor/channel 查询、租户全量和 vendor 查询拆入 `queries.ts`。
- 创建设备、同步 upsert、更新和软删除拆入 `mutations.ts`。
- 项目摄像头绑定同步、按摄像头解绑和按摄像头更新状态拆入 `camera-sync.ts`。
- 共享 row 类型、lite 类型、schema 类型、ProjectCamera 类型、Errors/ErrorCodes 和 SupabaseDB 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/repositories/tenant-devices/legacy-repository.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 14 个减少到 13 个，`tenant-devices/legacy-repository.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `tenant-devices/legacy/` repository 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖设备列表、平台 hydrate、同步 upsert、项目摄像头绑定同步、更新和软删除入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实设备/API smoke | 未执行 | 当前阶段仅做 repository 结构拆分；未执行真实设备创建、同步、删除或摄像头绑定写入 |

### 风险和遗留

- 本阶段保留 `tenantDeviceRepository` 外观和 `adminClient` 实例生命周期，service 与 project camera 模块的 repository 调用路径不变；拆分后的模块仍为行为保持型结构拆分。
- `sms/legacy-service.ts`、`tencent-iot-video.ts`、`tenant-devices/legacy-service.ts`、`usage/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 30 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split sms legacy service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 631 | 33 | `apps/api/src/services/sms/legacy-service.ts` |
| - | 82 | `apps/api/src/services/sms/legacy/aliyun.ts` |
| - | 160 | `apps/api/src/services/sms/legacy/config.ts` |
| - | 131 | `apps/api/src/services/sms/legacy/dispatcher.ts` |
| - | 114 | `apps/api/src/services/sms/legacy/logging-billing.ts` |
| - | 26 | `apps/api/src/services/sms/legacy/shared.ts` |
| - | 135 | `apps/api/src/services/sms/legacy/tencent.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容导出入口，只保留 `sendSmsCode` 和 `sendSmsTemplate`，`@/services/sms` 调用路径不变。
- provider/channel 归一化、租户/平台配置读取、模板 key 选择和必填配置校验拆入 `config.ts`。
- 阿里云 SDK client 创建、SendSmsRequest 构造、RuntimeOptions 和阿里云错误包装拆入 `aliyun.ts`。
- 腾讯云 TC3-HMAC-SHA256 签名、手机号归一化、SendSms API 调用和腾讯错误包装拆入 `tencent.ts`。
- 手机号 mask/hash、短信发送日志、短信计费前置检查和计费结果回写拆入 `logging-billing.ts`。
- disabled/mock/aliyun/tencent 分支调度、成功/失败日志和 billing 调用拆入 `dispatcher.ts`。
- 共享类型、腾讯常量和 sms/billing/system settings 依赖重导出拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/sms/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 13 个减少到 12 个，`sms/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `sms/legacy/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖 `sendSmsCode`、`sendSmsTemplate`、配置读取、阿里云/腾讯 provider、日志和计费入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实短信 smoke | 未执行 | 当前阶段仅做结构拆分；未触发真实阿里云/腾讯云短信发送、扣费或验证码业务流程 |

### 风险和遗留

- 本阶段保留 mock/disabled/aliyun/tencent 分支、模板 fallback、日志字段、计费开关和错误包装语义，属于行为保持型结构拆分。
- `tencent-iot-video.ts`、`tenant-devices/legacy-service.ts`、`usage/legacy-service.ts`、`task-center/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 31 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split tencent iot video gateway`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 624 | 42 | `apps/api/src/gateways/tencent-iot-video.ts` |
| - | 83 | `apps/api/src/gateways/tencent-iot-video/channels.ts` |
| - | 169 | `apps/api/src/gateways/tencent-iot-video/devices.ts` |
| - | 61 | `apps/api/src/gateways/tencent-iot-video/errors.ts` |
| - | 55 | `apps/api/src/gateways/tencent-iot-video/live-stream.ts` |
| - | 120 | `apps/api/src/gateways/tencent-iot-video/request.ts` |
| - | 194 | `apps/api/src/gateways/tencent-iot-video/shared.ts` |

### 结构变化

- `tencent-iot-video.ts` 变为兼容 gateway facade，保留 `TencentIotVideoService`、`tencentIotVideoService` 和全部公开类型 re-export。
- 腾讯云 API 类型、设备/通道/播放地址领域类型、常量和通用读取/状态归一化 helper 拆入 `shared.ts`。
- 配置缺失检查、腾讯 API 错误消息和业务错误映射拆入 `errors.ts`。
- 腾讯云 TC3-HMAC-SHA256 签名、配置读取、HTTP 请求和统一 API 响应错误处理拆入 `request.ts`。
- 设备分页列表、设备摘要、SIP server、创建设备、密码查询/更新和删除设备拆入 `devices.ts`。
- 通道分页列表和设备通道汇总拆入 `channels.ts`。
- 直播地址 action fallback 和播放地址响应归一化拆入 `live-stream.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/gateways/tencent-iot-video.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 12 个减少到 11 个，`gateways/tencent-iot-video.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `gateways/tencent-iot-video/` 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖设备、通道、SIP、密码、删除、播放地址和签名请求入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实腾讯云/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实腾讯云 IoT Video API、未创建/删除设备或获取播放地址 |

### 风险和遗留

- 本阶段保留 `TencentIotVideoService` 方法名、请求 action、签名算法、错误映射和服务层 re-export 路径，属于行为保持型结构拆分。
- `tenant-devices/legacy-service.ts`、`usage/legacy-service.ts`、`task-center/legacy-service.ts`、`wechat-rebind-requests/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。

## 后续 Legacy Phase 32 执行记录

日期：2026-06-02
提交：本阶段提交 `refactor: split tenant devices service`

### 目标文件

| 拆分前行数 | 拆分后行数 | 文件 |
| ---: | ---: | --- |
| 619 | 37 | `apps/api/src/services/tenant-devices/legacy-service.ts` |
| - | 57 | `apps/api/src/services/tenant-devices/legacy/access.ts` |
| - | 104 | `apps/api/src/services/tenant-devices/legacy/crud.ts` |
| - | 149 | `apps/api/src/services/tenant-devices/legacy/lists.ts` |
| - | 208 | `apps/api/src/services/tenant-devices/legacy/platform-tencent.ts` |
| - | 41 | `apps/api/src/services/tenant-devices/legacy/shared.ts` |
| - | 113 | `apps/api/src/services/tenant-devices/legacy/sync.ts` |

### 结构变化

- `legacy-service.ts` 变为兼容 facade，保留 `tenantDeviceService` 单例和 controller 使用的 public 方法名。
- 租户权限、平台管理员权限、平台设备读取和设备 label helper 拆入 `access.ts`。
- 租户设备查询、创建、更新、删除拆入 `crud.ts`。
- 租户列表、平台列表和腾讯云设备/通道聚合列表拆入 `lists.ts`。
- 平台腾讯设备删除、接入信息、密码查询、密码重置和单设备同步拆入 `platform-tencent.ts`。
- 租户设备资产同步、腾讯云/萤石通道 upsert 编排拆入 `sync.ts`。
- 共享依赖、schema/auth 类型、腾讯设备类型 label 和 SIP 密码生成拆入 `shared.ts`。
- 移除 `scripts/check-api-file-size.ts` 中对 `apps/api/src/services/tenant-devices/legacy-service.ts` 的大文件豁免；该文件后续重新超过 500 行会触发行数门禁失败。

### 测试记录

| 命令/场景 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | 通过 | 无空白错误 |
| `bun run api:typecheck` | 通过 | TypeScript noEmit 通过 |
| `bun run api:build` | 通过 | `apps/api/dist/app.js` 构建成功，dist 未纳入版本变更 |
| `bun run api:check-file-size` | 通过 | 显式豁免从 11 个减少到 10 个，`tenant-devices/legacy-service.ts` 不再豁免 |
| 目标文件行数门禁 | 通过 | 新增 `tenant-devices/legacy/` service 模块和原入口均低于 500 行 |

### smoke 验收

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 编译级 API smoke | 通过 | `api:typecheck` 和 `api:build` 覆盖租户设备 CRUD、平台腾讯设备列表/删除/密码、资产同步和 audit log 入口 |
| 行数门禁 smoke | 通过 | `api:check-file-size` 已不依赖本阶段目标文件豁免 |
| 真实设备/API smoke | 未执行 | 当前阶段仅做结构拆分；未调用真实腾讯云/萤石设备同步、删除、密码重置或设备资产写入 |

### 风险和遗留

- 本阶段保留 controller/service public API、权限检查、同步返回字段、audit log action 和腾讯/萤石同步分支语义，属于行为保持型结构拆分。
- `usage/legacy-service.ts`、`task-center/legacy-service.ts`、`wechat-rebind-requests/legacy-service.ts`、`customer-service-tickets/legacy-service.ts` 等仍在大文件豁免清单中，后续阶段按行数和业务风险继续处理。
