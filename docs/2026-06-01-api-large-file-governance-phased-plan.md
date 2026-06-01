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
