# 小程序员工侧项目详情权限边界对接方案

日期：2026-05-26

## 背景

员工侧进入项目详情时，曾出现全局“无权限”提示，但项目详情本身可以进入，施工日志里的客户评论也可以正常展示。已确认这不是“项目详情不可读”，而是项目详情页加载期间的附属接口存在权限边界不一致或接口失败。

本方案用于小程序端项目团队对接落代码。小程序端不应静默隐藏真实问题，也不应把附属模块失败误报成整个项目无权限。

关联排查文档：

- `/Users/leefo/Public/work/orange/docs/2026-05-26-employee-project-detail-permission-boundary-investigation.md`

目标排查项目：

- `project_id`: `b2f0a85c-0084-44ba-a988-438b6dcbec23`

## 对接目标

1. 项目详情主链路可读时，附属接口失败不得弹全局“无权限”toast。
2. 附属接口失败必须在页面内暴露模块级异常，不能完全隐藏。
3. 评论预加载失败不得影响日志列表展示。
4. 小程序端日志必须保留接口错误上下文，便于后端按 `requestId`、`code`、`project_id`、`log_id` 排查。
5. 后端修复权限边界后，小程序端无需再次改动即可恢复完整展示。

## 接口分级

### 页面级接口

页面级接口失败时，可以阻断项目详情页。

| 接口 | 失败处理 |
| --- | --- |
| `GET /auth/me/permissions` | 显示页面级权限错误，例如“你没有查看该项目的权限” |
| `GET /projects/:projectId` | 显示页面级加载错误，例如“项目详情加载失败，请稍后重试” |

### 模块级接口

模块级接口失败时，不得阻断项目详情页，不得弹全局“无权限”toast。

| 模块 | 接口 | 失败后 UI |
| --- | --- | --- |
| 项目成员 | `GET /projects/:projectId/members` | 抽屉底部成员区域降级为空或显示“成员信息暂不可用” |
| 施工日志 | `GET /project-logs/projects?project_id=:projectId` | 日志区域显示“施工日志暂时无法加载”，保留重试入口 |
| 日志日历 | `GET /project-logs/projects/calendar?project_id=:projectId` | 顶部模块异常提示，日历入口可置灰或打开后显示空状态 |
| 日志评论 | `GET /project_log_comments?log_id=:logId` | 对应日志评论区提示“评论暂未完整加载”，不影响其他日志 |
| 项目监控 | `GET /projects/:projectId/cameras` | 监控卡片显示“监控列表加载失败”，保留重试入口 |
| 状态动作 | `GET /projects/:projectId/status-actions` | 状态按钮隐藏或禁用，不影响详情浏览 |
| 施工阶段 | `GET /projects/:projectId/construction-stages` | 施工阶段模块显示错误文案 |
| 介绍费 | `GET /project-referrals/by-project/:projectId` 或现有介绍费接口 | 按权限局部加载，失败只影响介绍费模块 |

## 加载编排要求

### 推荐顺序

1. 读取 `GET /auth/me/permissions`。
2. 判断是否具备项目读取能力。
3. 读取 `GET /projects/:projectId`。
4. 项目详情成功后，再并行加载附属模块。
5. 附属模块统一使用局部错误处理。

### 关键要求

附属模块并行加载时，不允许使用会被单个失败整体 reject 的写法作为最终页面状态依据。

推荐使用 `Promise.allSettled`，或封装 `loadOptionalModule`。

示例伪代码：

```ts
const loadOptionalModule = async (
  moduleName: string,
  loader: () => Promise<void>,
) => {
  try {
    await loader();
  } catch (error) {
    recordProjectDetailModuleError(moduleName, error);
  }
};

await Promise.allSettled([
  loadOptionalModule('projectMembers', loadProjectMembers),
  loadOptionalModule('projectLogs', loadProjectLogs),
  loadOptionalModule('projectLogCalendar', loadProjectLogCalendar),
  loadOptionalModule('projectCameras', loadProjectCameras),
  loadOptionalModule('statusActions', loadProjectStatusActions),
  loadOptionalModule('constructionStages', loadProjectConstructionStages),
  loadOptionalModule('projectReferral', loadProjectReferral),
]);
```

页面级 catch 只能处理权限上下文和项目详情主接口，不能因为附属模块失败进入整页错误态。

## 请求封装要求

项目详情页里的模块级接口请求必须关闭全局错误 toast。

建议在服务层或调用层支持类似参数：

```ts
{
  showErrorToast: false
}
```

需要覆盖以下接口：

- `GET /projects/:projectId/members`
- `GET /project-logs/projects`
- `GET /project-logs/projects/calendar`
- `GET /project_log_comments`
- `GET /projects/:projectId/cameras`
- `GET /projects/:projectId/status-actions`
- `GET /projects/:projectId/construction-stages`
- 介绍费读取接口

注意：创建、提交、保存、删除等操作类接口不适用本规则。操作失败仍可按业务弹 toast。

## 页面内异常展示

项目详情页顶部增加或复用模块异常提示：

标题：

```text
部分项目模块加载异常
```

描述按模块拼接：

```text
日志日历：无权限访问项目日志日历；日志评论：部分客户评论可能未显示，请联系后端核查；施工阶段：无权限访问项目施工阶段
```

模块文案建议：

| 模块 | 默认文案 |
| --- | --- |
| 项目成员 | `成员信息暂不可用` |
| 施工日志 | `施工日志暂时无法加载` |
| 日志日历 | `施工日志日历加载失败` |
| 日志评论 | `部分客户评论可能未显示，请联系后端核查` |
| 项目监控 | `监控列表加载失败` |
| 状态动作 | `当前状态操作暂不可用` |
| 施工阶段 | `施工阶段加载失败` |
| 介绍费 | `介绍费信息加载失败` |

如果后端返回了 `message`，优先展示后端 `message`；但要避免在主详情已可读时弹全局“无权限”。

## 错误日志要求

每个模块级失败都需要在小程序端记录结构化日志。

建议字段：

```ts
{
  page: 'employeeProjectDetail',
  module: 'constructionStages',
  projectId,
  logId,
  statusCode,
  code,
  requestId,
  message,
  error,
}
```

字段说明：

| 字段 | 要求 |
| --- | --- |
| `page` | 固定为 `employeeProjectDetail` |
| `module` | 使用稳定枚举，例如 `projectLogComments`、`projectCameras` |
| `projectId` | 必填 |
| `logId` | 仅评论接口必填 |
| `statusCode` | 从请求错误中提取 |
| `code` | 从后端错误响应提取 |
| `requestId` | 从后端错误响应或响应头提取 |
| `message` | 用户可理解错误信息 |
| `error` | 原始错误对象，仅 console 或埋点内部使用 |

## 日志评论处理要求

评论预加载必须按日志维度独立处理。

要求：

1. `GET /project-logs/projects` 成功后，按当前页日志逐条请求 `GET /project_log_comments?log_id=:logId`。
2. 任一 `log_id` 评论失败，不得清空其他日志评论。
3. 任一 `log_id` 评论失败，不得影响日志列表展示。
4. 评论失败时，顶部模块异常包含“日志评论”。
5. 单条日志评论区显示“评论暂未完整加载”或“评论加载失败，点击重试”。
6. 用户打开评论弹层时，如果该日志评论未加载，应允许单条重试。

评论数量口径：

- 如果评论列表已加载，优先使用实际评论列表数量。
- 如果评论列表未加载，使用日志接口返回的 `comment_count`。
- 如果评论加载失败，不要把 `comment_count` 置为 0。

## 施工日志处理要求

施工日志列表接口属于模块级接口，但它是详情页主要内容模块。失败时不要整页失败，日志区域局部降级。

建议 UI：

```text
施工日志暂时无法加载
请稍后重试，或联系后端核查项目日志权限
[重试]
```

重试只重新请求：

- `GET /project-logs/projects`
- `GET /project-logs/projects/calendar`
- 当前页日志对应的评论接口

不要重新触发整页权限校验，除非用户下拉刷新整个页面。

## 后端错误响应期望

小程序端需要后端稳定返回 `code` 和 `requestId`，否则只能展示泛化异常。

推荐响应：

```json
{
  "success": false,
  "message": "无权限访问项目施工阶段",
  "code": "PROJECT_CONSTRUCTION_STAGE_FORBIDDEN",
  "requestId": "req_xxx",
  "data": {
    "project_id": "b2f0a85c-0084-44ba-a988-438b6dcbec23",
    "resource": "project_construction_stages",
    "required_permission": "project.read",
    "employee_id": "employee_xxx"
  }
}
```

小程序端展示：

- 用户可见：`施工阶段：无权限访问项目施工阶段`
- 日志记录：`code`、`requestId`、`project_id`、`required_permission`、`employee_id`

## 权限语义对齐

小程序端按以下语义理解项目详情页：

### 只读附属资源

项目详情可读时，以下资源应被视为项目详情的只读附属资源：

- 项目成员
- 施工日志
- 施工日志评论
- 日志日历
- 施工阶段概要
- 项目监控摘要

如果这些接口返回 403，小程序端局部降级，同时记录为后端权限边界问题。

### 操作类资源

以下接口可以继续按更严格权限处理：

- 新增/编辑施工日志
- 创建/提交/审核验收
- 配置摄像头
- 修改项目状态
- 修改项目成员
- 修改介绍费

操作类接口失败可以弹 toast，因为这是用户主动操作的反馈。

## 验收用例

测试项目：

- `project_id`: `b2f0a85c-0084-44ba-a988-438b6dcbec23`

### 用例 1：主详情成功，施工阶段 403

预期：

- 页面正常展示项目详情。
- 不弹全局“无权限”toast。
- 顶部显示“部分项目模块加载异常”。
- 描述包含“施工阶段：...”。
- 施工阶段模块显示局部错误。
- console 或埋点记录 `module=constructionStages`、`projectId`、`code`、`requestId`。

### 用例 2：主详情成功，日志日历 403

预期：

- 日志列表正常展示。
- 日历入口不阻断页面。
- 顶部显示“日志日历：...”。
- 不弹全局“无权限”toast。

### 用例 3：部分日志评论 403

预期：

- 日志列表正常展示。
- 已成功加载评论的日志正常展示客户评论和员工评论。
- 失败日志评论区提示评论未完整加载。
- 顶部显示“日志评论：部分客户评论可能未显示，请联系后端核查”。
- 不清空其他日志评论。

### 用例 4：施工日志列表失败

预期：

- 项目基础信息正常展示。
- 日志区域显示“施工日志暂时无法加载”。
- 页面提供日志重试入口。
- 不进入整页“项目详情加载失败”。

### 用例 5：项目详情主接口失败

预期：

- 显示页面级错误。
- 可以提示“项目详情加载失败，请稍后重试”或“你没有查看该项目的权限”。
- 这是允许阻断页面的场景。

### 用例 6：用户主动操作失败

场景：

- 新增日志失败。
- 创建验收失败。
- 配置摄像头失败。
- 修改项目状态失败。

预期：

- 可以弹 toast。
- 不走“部分项目模块加载异常”。
- 保持操作类失败反馈清晰。

## 交付清单

小程序端项目团队落代码时建议拆成以下任务：

1. 项目详情页加载编排改为“主接口阻断、附属接口 allSettled 局部降级”。
2. 项目详情页模块级接口统一关闭全局错误 toast。
3. 增加模块错误归一化方法，提取 `message`、`code`、`requestId`、`statusCode`。
4. 顶部增加或复用“部分项目模块加载异常”提示。
5. 施工日志列表失败改为日志区域局部降级。
6. 评论预加载按日志维度独立失败，保留已成功评论。
7. 增加单模块重试入口：日志、评论、日历、监控、施工阶段。
8. 使用目标项目完成 6 个验收用例。

## 注意事项

1. 不要用前端权限判断隐藏后端真实 403。只读模块失败必须可见。
2. 不要把所有 403 都解释为整页无权限。只有项目详情主接口 403 才能阻断详情页。
3. 不要在附属模块 catch 中只写 `console.error` 而不更新页面状态。
4. 不要在评论加载失败时把 `comment_count` 置为 0。
5. 不要为规避 toast 修改全局请求封装的默认行为，应在项目详情页相关模块请求中显式关闭。

## 完成标准

小程序端完成后，应满足：

- 员工进入可读项目详情时，不再因为附属接口失败弹全局“无权限”。
- 附属接口失败时，页面内明确显示“部分项目模块加载异常”。
- 施工日志客户评论可以展示。
- 评论预加载失败时，页面明确提示评论可能未完整显示。
- 所有模块级失败都有可追踪日志，至少包含 `module`、`projectId`、`code`、`requestId`。
- 后端权限边界修复后，小程序端页面自动恢复完整模块展示。
