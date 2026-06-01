# Admin 拆分后重复逻辑清理机会

日期：2026-05-31

## 扫描目的

在完成大文件拆分和回归加固后，继续扫描 `apps/admin` 中可以清理的重复逻辑。本文只做风险评估和下一轮规划，不在本轮直接改业务实现。

## 扫描命令

```bash
rg -n 'function getPayloadMessage|const getPayloadMessage|async function requestJson|function requestJson|requestBackend|refreshAfterDialogClose\(|router\.refresh\(' apps/admin/components apps/admin/app apps/admin/lib -g '*.ts' -g '*.tsx'

rg -n 'direct-init|direct-complete|public-url|upload.*Avatar|upload.*Direct|COS|cos' apps/admin/components apps/admin/lib -g '*.ts' -g '*.tsx'

find apps/admin/components -path '*/node_modules' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>=350 { print $1, $2 }' \
  | sort -nr
```

## 发现

### 1. 后端请求与错误消息重复

- `getPayloadMessage` 分散在 32 个文件。
- `requestJson` / `requestBackend` 类函数分散在 17 个文件。
- 多数逻辑都是：
  - 调 `/api/backend...`
  - 解析 JSON
  - 判断 `!response.ok || payload.success === false`
  - 从 `payload.message` 取错误文案

风险：

- 错误兜底文案不一致。
- 部分请求函数自动拼 `/api/backend`，部分要求传完整路径，调用者容易混淆。
- 后续要补 trace id、原始错误详情、统一 toast 时改动面大。

建议：

- 阶段 A 新增 `apps/admin/lib/backend-client.ts`，提供 `requestBackendJson<T>()` 和 `getPayloadMessage()`。
- 阶段 B 先迁移低风险模块：settings、permissions、employee-personalization、platform-ai。
- 阶段 C 再迁移高交互模块：customers、projects、expenses、marketing、cameras。

### 2. COS 直传流程重复

重复文件：

- `customers/customer-mutation-shared.tsx`
- `employees/employee-mutation-shared.ts`
- `expenses/expense-mutation-shared.ts`
- `marketing/h5-page-editor-api.ts`
- `projects/project-acceptance-utils.ts`

重复步骤：

- direct-init
- PUT 上传
- direct-complete
- storage path / object key 归一
- public-url 预览地址拼接
- 文件大小和 MIME 类型校验

风险：

- 错误文案、headers、etag、storage path 兜底策略不完全一致。
- 新增上传场景时容易复制旧逻辑。

建议：

- 新增 `apps/admin/lib/cos-direct-upload.ts`：
  - `uploadDirectToCos(file, { scene, filename, extraPayload })`
  - `buildUploadPreviewUrl(path)`
  - `validateUploadFile(file, constraints)`
- 每个业务模块只保留 scene、大小、类型和业务文案。

### 3. 刷新时序重复

- `router.refresh()` 出现在 44 个文件。
- 部分弹窗用 `refreshAfterDialogClose(router)`，部分直接 `router.refresh()`。

风险：

- 弹窗关闭动画、Radix focus restore 与页面刷新时序不一致，可能再次引发 card 操作时底层闪烁。
- 成功后更新本地 optimistic state 与整页 refresh 混用，回归定位困难。

建议：

- 统一弹窗关闭后刷新：涉及 Dialog / AlertDialog 的保存动作优先用 `refreshAfterDialogClose`。
- 列表筛选和分页保留直接 `router.refresh()`。
- 后续可补 `useDeferredRouterRefresh()`，明确 `immediate` / `afterDialogClose` 两种语义。

### 4. 仍接近 500 行的组件

当前 350 行以上文件中，最值得后续关注：

- `projects/project-acceptances-panel.tsx`：500 行，刚好到门禁上限。
- `organization/department-post-config-dialog.tsx`：494 行。
- `roles/role-mutations.tsx`：484 行。
- `marketing/h5-page-editor-preview.tsx`：481 行。
- `projects/project-status-panel.tsx`：472 行。
- `layout/admin-shell.tsx`：467 行。

建议：

- 不急于继续拆，除非这些文件马上要承接新需求。
- 如果要动，优先拆 `project-acceptances-panel.tsx` 和 `department-post-config-dialog.tsx`，避免后续小需求直接触发行数门禁。

## 下一轮建议顺序

1. **请求工具统一**
   - 低风险，高收益。
   - 验收：`pnpm admin:check`、`pnpm --dir apps/admin test:e2e`、关键页面打开。

2. **COS 直传工具统一**
   - 中风险，需要覆盖头像、验收图、费用凭证、H5 图片。
   - 验收：至少保留现有构建和 E2E；有条件时用测试文件跑上传链路。

3. **刷新时序统一**
   - 中风险，主要收益是减少弹窗关闭闪烁和刷新竞态。
   - 验收：重点看项目、员工、权限、部门、费用弹窗关闭后的页面状态。

4. **接近 500 行文件预拆**
   - 低优先级，只在相关需求进入前做。
   - 验收：文件仍 `<= 500`，业务入口不变。

## 本轮不建议直接做的事项

- 不建议一次性替换所有 `requestBackend`，容易引入跨模块回归。
- 不建议把所有 `router.refresh()` 机械替换成延迟刷新，列表筛选和分页不属于弹窗刷新问题。
- 不建议继续追求所有文件低于 350 行，当前门禁已经解决主要维护风险。

## 2026-06-01 执行记录

### 已完成

- 新增统一后端请求工具：`apps/admin/lib/backend-client.ts`。
  - 提供 `getPayloadMessage()`。
  - 提供 `buildBackendProxyPath()`，兼容 `/api/backend/...` 和业务相对路径。
  - 提供 `requestBackendJson<T>()`，统一 JSON 解析、`success === false` 判断、错误对象附加 `status/code/requestId/payload`。
- 已迁移低风险模块：
  - `settings/settings-actions.tsx`
  - `settings/settings-mutation-shared.tsx`
  - `permissions/permission-mutation-shared.tsx`
  - `employee-personalization/employee-personalization-shared.ts`
  - `platform-ai/ai-model-routing-shared.ts`
- 新增统一 COS 直传工具：`apps/admin/lib/cos-direct-upload.ts`。
  - 提供 `uploadDirectToCos()`。
  - 提供 `buildUploadPreviewUrl()`。
  - 提供 `validateUploadFile()`。
- 已迁移 COS 直传场景：
  - 客户头像。
  - 员工头像。
  - 费用打款凭证。
  - 项目验收图片。
  - H5 编辑器图片。

### 扫描结果

- `direct-init` / `direct-complete` 只剩 `apps/admin/lib/cos-direct-upload.ts` 一个实现。
- `getPayloadMessage` 从 32 个文件降到 30 个文件。本轮只迁移低风险模块，客户、项目、费用、营销、摄像头等高交互模块的请求函数保留到后续阶段逐步迁移。

### 验收记录

2026-06-01：

- `pnpm admin:check` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，6 个 smoke 用例全部通过。
- `git diff --check` 通过。

### 后续建议

- 后端请求工具下一步可以继续迁移 cameras、customer-service、roles、billing 等中风险模块。
- 高交互模块 customers、projects、expenses、marketing 建议结合具体需求逐步迁移，避免请求工具替换和业务改动混在一起。
- COS 直传如需真实链路验收，应准备测试文件和可回收测试数据，覆盖头像、费用凭证、项目验收图、H5 图片四类实际上传。
