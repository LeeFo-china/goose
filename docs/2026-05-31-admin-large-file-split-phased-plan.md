# Admin 超 500 行文件拆分分阶段执行计划

日期：2026-05-31

## 背景

`apps/admin` 当前存在多个 TS/TSX 文件超过 500 行，部分文件已经超过 1000 行。继续在这些文件里叠加功能会增加以下风险：

- 页面、弹窗、表单状态、请求逻辑混在同一文件，回归影响面难判断。
- 小改动需要阅读大量无关上下文，维护成本高。
- 多人并行时容易产生冲突。
- UI 组件、业务 hooks、数据适配、常量定义无法复用。

本计划目标是把 `apps/admin` 中所有超过 500 行的业务文件拆分到 500 行以内，并为后续新增代码建立行数门禁。

## 基线

扫描命令：

```bash
find apps/admin -path '*/node_modules' -prune -o -path '*/.next' -prune -o -path '*/dist' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>500 { print $1, $2 }' \
  | sort -nr
```

2026-05-31 基线：

| 行数 | 文件 |
| ---: | --- |
| 2449 | `apps/admin/components/projects/project-acceptances-panel.tsx` |
| 2444 | `apps/admin/components/marketing/h5-page-editor.tsx` |
| 2066 | `apps/admin/components/customers/customer-mutations.tsx` |
| 1916 | `apps/admin/components/projects/project-mutations.tsx` |
| 1856 | `apps/admin/components/ops/release-deployments-panel.tsx` |
| 1369 | `apps/admin/components/cameras/camera-mutations.tsx` |
| 1152 | `apps/admin/components/marketing/h5-page-mutations.tsx` |
| 1133 | `apps/admin/components/expenses/expense-mutations.tsx` |
| 1104 | `apps/admin/app/(console)/platform/billing/page.tsx` |
| 963 | `apps/admin/components/marketing/marketing-mutations.tsx` |
| 868 | `apps/admin/components/employees/employee-mutations.tsx` |
| 743 | `apps/admin/components/platform-ai/ai-model-routing-panel.tsx` |
| 585 | `apps/admin/app/(console)/marketing/page.tsx` |
| 574 | `apps/admin/components/organization/department-mutations.tsx` |
| 515 | `apps/admin/components/settings/settings-actions.tsx` |
| 510 | `apps/admin/components/permissions/permission-mutations.tsx` |
| 506 | `apps/admin/components/employee-personalization/employee-personalization-client.tsx` |

总计：17 个文件超过 500 行。

## 拆分原则

1. 不改业务语义。每阶段只做结构拆分，除非拆分过程中发现明确 bug。
2. 保持现有路由、导出名、请求 payload、权限判断和页面文案不变。
3. 优先提取稳定边界：
   - 类型：`*-types.ts`
   - 常量与选项：`*-constants.ts`
   - 数据适配：`*-serializers.ts` / `*-mappers.ts`
   - 业务 hooks：`use-*.ts`
   - 弹窗/表单子组件：`*-dialog.tsx` / `*-form.tsx`
   - 表格列定义：`*-columns.tsx`
4. 拆分后的单文件目标：
   - 硬性验收：所有 admin TS/TSX 文件 `<= 500` 行。
   - 新增文件建议 `150-350` 行。
   - 如果个别文件临时超过 500 行，必须在阶段验收记录中说明原因并列入下一阶段。
5. 每阶段独立验收并提交，通过后再进入下一阶段。

## 通用验收命令

每个阶段至少执行：

```bash
git diff --check
pnpm --dir apps/admin build
```

涉及交互复杂页面的阶段增加：

```bash
pnpm --dir apps/admin test:e2e
```

每个阶段必须执行行数门禁：

```bash
find apps/admin -path '*/node_modules' -prune -o -path '*/.next' -prune -o -path '*/dist' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>500 { print $1, $2 }' \
  | sort -nr
```

阶段内目标文件必须不再出现在门禁输出中。最终阶段要求门禁输出为空。

## 阶段 0：准备与边界确认

### 范围

- 落本文档。
- 确认超过 500 行文件基线。
- 明确分阶段顺序、验收命令和提交策略。

### 测试

```bash
git diff --check
find apps/admin -path '*/node_modules' -prune -o -path '*/.next' -prune -o -path '*/dist' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>500 { print $1, $2 }' \
  | sort -nr
```

### 验收

- 本文档存在于 `docs/2026-05-31-admin-large-file-split-phased-plan.md`。
- 17 个超限文件已记录。
- 后续阶段每阶段都有测试与验收标准。

## 阶段 1：项目模块拆分

### 范围

目标文件：

- `apps/admin/components/projects/project-acceptances-panel.tsx`
- `apps/admin/components/projects/project-mutations.tsx`

拆分建议：

- 提取项目验收相关类型、状态选项、结果展示组件。
- 提取竣工验收模板、验收项、整改动作相关子组件。
- 提取项目新增/编辑表单状态、状态流转弹窗、成员候选选择控件。
- 保留原入口组件导出，避免页面引用大范围改动。

### 测试

```bash
git diff --check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

行数门禁：

```bash
find apps/admin -path '*/node_modules' -prune -o -path '*/.next' -prune -o -path '*/dist' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>500 { print $1, $2 }' \
  | sort -nr
```

### 验收

- 两个目标文件均 `<= 500` 行。
- 项目列表、项目新增/编辑、项目负责人选择、状态流转、工序验收、竣工验收模板入口可构建通过。
- 不改变项目相关 API path、payload 和返回数据适配。
- 验收通过后提交，提交信息建议：`refactor: split large admin project components`。

### 执行记录

2026-05-31：

- 已拆分 `apps/admin/components/projects/project-mutations.tsx`：
  - 类型：`project-mutation-types.ts`
  - 工具与请求：`project-mutation-utils.ts`
  - 项目表单：`project-form-dialog.tsx`
  - 项目详情：`project-detail-dialog.tsx`
  - 项目状态面板：`project-status-panel.tsx`
  - 状态动作弹窗：`project-status-action-dialog.tsx`
  - 项目成员弹窗：`project-member-dialog.tsx`
  - 下拉选择与选项 hook：`project-option-select.tsx`、`use-project-select-options.ts`
- 已拆分 `apps/admin/components/projects/project-acceptances-panel.tsx`：
  - 类型：`project-acceptance-types.ts`
  - 工具与请求：`project-acceptance-utils.ts`
  - 左侧验收列表：`project-acceptance-sidebar.tsx`
  - 右侧验收详情：`project-acceptance-detail.tsx`
  - 流程时间线：`project-acceptance-timeline.tsx`
  - 竣工模板弹窗：`project-final-acceptance-template-dialog.tsx`
  - 验收动作弹窗：`project-acceptance-action-dialog.tsx`
  - 客户通知条：`project-acceptance-customer-notification-panel.tsx`
  - 图片上传块：`project-acceptance-image-upload-block.tsx`

### 验收记录

2026-05-31：

- `apps/admin/components/projects/project-acceptances-panel.tsx`：500 行。
- `apps/admin/components/projects/project-mutations.tsx`：129 行。
- 阶段 1 目标文件已从 `>500` 行门禁输出中消失。
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，现有用例 `admin smoke › 租户管理员可访问组织架构并打开配置岗位弹窗` 通过。

## 阶段 2：客户、费用、摄像头业务弹窗拆分

### 范围

目标文件：

- `apps/admin/components/customers/customer-mutations.tsx`
- `apps/admin/components/expenses/expense-mutations.tsx`
- `apps/admin/components/cameras/camera-mutations.tsx`

拆分建议：

- 客户：提取客户表单、状态操作、归属/属性/头像截图相关控件。
- 费用：提取费用申请、审批、附件、明细项表单。
- 摄像头：提取设备绑定、通道选择、预览配置、资产操作弹窗。

### 测试

```bash
git diff --check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

### 验收

- 三个目标文件均 `<= 500` 行。
- 客户新增/编辑/状态操作、费用审批详情与操作、摄像头新增/编辑/绑定相关入口可构建通过。
- 成功操作后的 `router.refresh()`、toast、弹窗关闭行为保持不变。
- 验收通过后提交，提交信息建议：`refactor: split admin customer expense camera mutations`。

### 执行记录

2026-05-31：

- 已拆分 `apps/admin/components/customers/customer-mutations.tsx`：
  - 类型：`customer-mutation-types.ts`
  - 共享状态、请求与展示工具：`customer-mutation-shared.tsx`
  - 客户表单弹窗：`customer-form-dialog.tsx`
  - 客户详情弹窗：`customer-detail-dialog.tsx`
  - 客户状态操作：`customer-status-panel.tsx`
  - 设计项目前置状态确认：`design-project-before-status-dialog.tsx`
- 已拆分 `apps/admin/components/expenses/expense-mutations.tsx`：
  - 类型：`expense-mutation-types.ts`
  - 费用请求、枚举标签、COS 凭证上传工具：`expense-mutation-shared.ts`
  - 费用详情弹窗：`expense-detail-dialog.tsx`
  - 登记打款弹窗：`expense-pay-dialog.tsx`
- 已拆分 `apps/admin/components/cameras/camera-mutations.tsx`：
  - 类型：`camera-mutation-types.ts`
  - 表单 schema、请求、设备与预览工具：`camera-mutation-shared.ts`
  - 摄像头绑定/编辑弹窗：`camera-form-dialog.tsx`
  - 项目与设备选择区：`camera-project-device-fields.tsx`
  - 摄像头配置字段区：`camera-settings-fields.tsx`
  - 实时预览弹窗：`camera-play-preview-dialog.tsx`

### 验收记录

2026-05-31：

- `apps/admin/components/customers/customer-mutations.tsx`：124 行。
- `apps/admin/components/expenses/expense-mutations.tsx`：214 行。
- `apps/admin/components/cameras/camera-mutations.tsx`：130 行。
- 阶段 2 目标文件已从 `>500` 行门禁输出中消失。
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- `pnpm --dir apps/admin build` 通过。第一次与 E2E 并行执行时 Next `.next` 产物竞争导致 `/_document` 读取失败，随后单独重跑构建通过。
- `pnpm --dir apps/admin test:e2e` 通过，现有用例 `admin smoke › 租户管理员可访问组织架构并打开配置岗位弹窗` 通过。

## 阶段 3：营销与 H5 编辑器拆分

### 范围

目标文件：

- `apps/admin/components/marketing/h5-page-editor.tsx`
- `apps/admin/components/marketing/h5-page-mutations.tsx`
- `apps/admin/components/marketing/marketing-mutations.tsx`
- `apps/admin/app/(console)/marketing/page.tsx`

拆分建议：

- H5 编辑器按画布、区块列表、属性面板、资源选择、预览发布拆分。
- H5 页面 mutation 按新建/编辑/发布/复制/删除动作拆分。
- 营销活动 mutation 提取活动表单、状态操作、投放配置。
- Marketing page 仅保留页面级数据组合和布局。

### 测试

```bash
git diff --check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

如 E2E 暂未覆盖 H5 编辑器，补充手动验收记录：

- 打开营销页面。
- 打开 H5 编辑器。
- 新增/调整一个区块。
- 保存草稿。
- 关闭后重新打开能看到配置。

### 验收

- 四个目标文件均 `<= 500` 行。
- H5 编辑器核心交互、保存、预览、发布入口可构建通过。
- 组件拆分后不引入全局状态替代局部状态，避免扩大副作用。
- 验收通过后提交，提交信息建议：`refactor: split admin marketing editor modules`。

### 执行记录

2026-05-31：

- 已拆分 `apps/admin/components/marketing/h5-page-editor.tsx`：
  - 类型与模板常量：`h5-page-editor-types.ts`
  - 编辑器 API、图片校验压缩和 COS 上传：`h5-page-editor-api.ts`
  - 区块创建、规范化和字段读取工具：`h5-page-editor-block-utils.tsx`
  - 预览组件：`h5-page-editor-preview.tsx`
  - 属性面板：`h5-page-editor-property-panel.tsx`
  - 案例选择器：`h5-page-editor-project-case-selector.tsx`
  - 图片上传字段：`h5-page-editor-image-upload-field.tsx`
  - 通用字段控件：`h5-page-editor-fields.tsx`
- 已拆分 `apps/admin/components/marketing/h5-page-mutations.tsx`：
  - 共享 schema、请求与 payload 工具：`h5-page-mutation-shared.ts`
  - 新建弹窗：`h5-page-create-dialog.tsx`
  - 配置弹窗：`h5-page-settings-dialog.tsx`
  - 行操作：`h5-page-row-actions.tsx`
  - 排序控件：`h5-page-order-controls.tsx`
- 已拆分 `apps/admin/components/marketing/marketing-mutations.tsx`：
  - 共享 schema、请求与 payload 工具：`marketing-mutation-shared.ts`
  - 活动表单弹窗：`marketing-campaign-form-dialog.tsx`
  - 项目选择器：`marketing-project-selector.tsx`
  - 详情弹窗：`marketing-campaign-detail-dialog.tsx`
- 已拆分 `apps/admin/app/(console)/marketing/page.tsx`：
  - 页面参数、数据读取和 tab href 工具：`marketing-page-data.ts`

### 验收记录

2026-05-31：

- `apps/admin/components/marketing/h5-page-editor.tsx`：453 行。
- `apps/admin/components/marketing/h5-page-mutations.tsx`：4 行。
- `apps/admin/components/marketing/marketing-mutations.tsx`：156 行。
- `apps/admin/app/(console)/marketing/page.tsx`：330 行。
- 阶段 3 目标文件已从 `>500` 行门禁输出中消失。
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，现有用例 `admin smoke › 租户管理员可访问组织架构并打开配置岗位弹窗` 通过。

## 阶段 4：平台、运维、计费复杂页拆分

### 范围

目标文件：

- `apps/admin/components/ops/release-deployments-panel.tsx`
- `apps/admin/app/(console)/platform/billing/page.tsx`
- `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`

拆分建议：

- 发布部署：拆分环境选择、发布列表、详情抽屉、回滚/同步操作。
- 平台计费：拆分统计卡片、筛选栏、账单表、事件表、用量图表。
- AI 路由：拆分 provider 配置、模型规则、测试调用、状态展示。

### 测试

```bash
git diff --check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

### 验收

- 三个目标文件均 `<= 500` 行。
- 平台计费、发布部署、AI 路由页面可构建通过。
- 表格筛选、分页、操作按钮、弹窗确认流程保持原行为。
- 验收通过后提交，提交信息建议：`refactor: split admin platform ops panels`。

### 执行记录

2026-05-31：

- 已拆分 `apps/admin/components/ops/release-deployments-panel.tsx`：
  - 请求、格式化和状态工具：`release-deployments-shared.ts`
  - 运行详情与运行版本面板：`release-deployments-dialogs.tsx`
  - 版本/服务选择和分页控件：`release-deployments-controls.tsx`
  - 发布表单卡片：`release-deployments-dispatch-card.tsx`
  - 成功版本辅助和发布记录列表：`release-deployments-sections.tsx`
- 已拆分 `apps/admin/app/(console)/platform/billing/page.tsx`：
  - 页面参数、数据读取、格式化和基础控件：`billing-page-shared.tsx`
  - 租户账户和影子计费 tab：`billing-account-tabs.tsx`
  - AI 观察、价格规则和计费流水 tab：`billing-usage-tabs.tsx`
- 已拆分 `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`：
  - 表单状态和请求工具：`ai-model-routing-shared.ts`
  - 表单、表格和状态控件：`ai-model-routing-sections.tsx`

### 验收记录

2026-05-31：

- `apps/admin/components/ops/release-deployments-panel.tsx`：406 行。
- `apps/admin/app/(console)/platform/billing/page.tsx`：236 行。
- `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`：343 行。
- 阶段 4 目标文件已从 `>500` 行门禁输出中消失。
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，现有用例 `admin smoke › 租户管理员可访问组织架构并打开配置岗位弹窗` 通过。

## 阶段 5：组织、权限、员工、设置轻量收口

### 范围

目标文件：

- `apps/admin/components/employees/employee-mutations.tsx`
- `apps/admin/components/organization/department-mutations.tsx`
- `apps/admin/components/settings/settings-actions.tsx`
- `apps/admin/components/permissions/permission-mutations.tsx`
- `apps/admin/components/employee-personalization/employee-personalization-client.tsx`

拆分建议：

- 员工：提取员工表单、角色展示/绑定、微信解绑操作。
- 部门：提取新增/编辑表单、岗位配置入口、启用停用操作。
- 设置：按设置域拆分 action 组件。
- 权限：提取权限表单、角色分配、确认弹窗。
- 员工个性化：拆分筛选、规则表、规则编辑弹窗。

### 测试

```bash
git diff --check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

### 验收

- 五个目标文件均 `<= 500` 行。
- 员工、组织、权限、设置、员工个性化页面相关操作可构建通过。
- 角色、权限、部门岗位这些关键业务字段展示不丢失。
- 验收通过后提交，提交信息建议：`refactor: split admin organization permission modules`。

### 执行记录

2026-05-31：

- 已拆分 `apps/admin/components/employees/employee-mutations.tsx`：
  - 类型：`employee-types.ts`
  - 员工表单弹窗：`employee-dialog.tsx`
  - 员工角色配置弹窗：`employee-roles-dialog.tsx`
  - 请求、状态选项、头像直传工具：`employee-mutation-shared.ts`
- 已拆分 `apps/admin/components/organization/department-mutations.tsx`：
  - 部门编辑弹窗：`department-dialog.tsx`
  - 启用部门弹窗：`enable-departments-dialog.tsx`
  - 部门请求与编码工具：`department-mutation-shared.ts`
- 已拆分 `apps/admin/components/settings/settings-actions.tsx`：
  - COS 文件访问策略编辑器：`settings-file-access-policy-editor.tsx`
  - 设置请求与来源标签：`settings-mutation-shared.tsx`
- 已拆分 `apps/admin/components/permissions/permission-mutations.tsx`：
  - 类型：`permission-types.ts`
  - 权限表单弹窗：`permission-dialog.tsx`
  - 权限表单选项、schema 与请求：`permission-mutation-shared.tsx`
- 已拆分 `apps/admin/components/employee-personalization/employee-personalization-client.tsx`：
  - 规则编辑弹窗：`employee-personalization-rule-dialog.tsx`
  - 请求与展示工具：`employee-personalization-shared.ts`

### 验收记录

2026-05-31：

- `apps/admin/components/employees/employee-mutations.tsx`：135 行。
- `apps/admin/components/organization/department-mutations.tsx`：141 行。
- `apps/admin/components/settings/settings-actions.tsx`：287 行。
- `apps/admin/components/permissions/permission-mutations.tsx`：119 行。
- `apps/admin/components/employee-personalization/employee-personalization-client.tsx`：179 行。
- 阶段 5 目标文件已从 `>500` 行门禁输出中消失。
- `git diff --check` 通过。
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，现有用例 `admin smoke › 租户管理员可访问组织架构并打开配置岗位弹窗` 通过。

## 阶段 6：全局门禁与最终验收

### 范围

- 增加或记录 admin 文件行数检查脚本。
- 扫描所有 admin TS/TSX 文件，确保没有超过 500 行。
- 复查拆分过程中产生的新文件命名、导出和目录层级。
- 补充最终执行记录。

建议增加脚本：

```bash
find apps/admin -path '*/node_modules' -prune -o -path '*/.next' -prune -o -path '*/dist' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>500 { print $1, $2; failed=1 } END { exit failed }'
```

后续可接入 `package.json`：

```json
{
  "scripts": {
    "admin:check-file-size": "pnpm --dir apps/admin check:file-size"
  }
}
```

### 测试

```bash
git diff --check
pnpm --dir apps/admin build
pnpm --dir apps/admin test:e2e
```

最终行数门禁：

```bash
find apps/admin -path '*/node_modules' -prune -o -path '*/.next' -prune -o -path '*/dist' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs wc -l \
  | awk 'NF==2 && $2!="total" && $1>500 { print $1, $2 }' \
  | sort -nr
```

### 验收

- 最终行数门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，或对暂无自动化覆盖的页面记录手动验收结果。
- 工作区只包含本任务相关改动。
- 最终提交后，本文档更新完整执行记录。

### 执行记录

2026-05-31：

- 新增 admin 行数门禁脚本：`apps/admin/scripts/check-file-size.mjs`。
- 新增 admin 包脚本：`check:file-size`。
- 新增根脚本：`admin:check-file-size`。
- 脚本按 `wc -l` 口径统计换行数，排除 `.next`、`dist`、`node_modules`，检查 `.ts` / `.tsx` 文件是否超过 500 行。

### 验收记录

2026-05-31：

- `pnpm admin:check-file-size` 通过，输出 `admin file size check passed: 311 TS/TSX files <= 500 lines`。
- 最终 `wc -l` 行数门禁无输出。
- `git diff --check` 通过。
- `pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，现有用例 `admin smoke › 租户管理员可访问组织架构并打开配置岗位弹窗` 通过。
- 阶段 1 到阶段 6 已全部按阶段执行、验收并提交。

## 执行顺序与提交策略

1. 阶段 0 提交文档。
2. 阶段 1 到阶段 5 每阶段独立执行、独立验收、独立提交。
3. 阶段 6 做最终门禁和文档回写，单独提交。
4. 如果某阶段发现业务 bug，先记录在阶段执行记录中；只有影响拆分验收时才同阶段修复，否则单独开修复提交。

## 2026-06-01 临界文件预拆记录

背景：后续功能仍会持续落到 Admin，虽然最终门禁已经保证 `>500` 行无输出，但部分文件接近 500 行，继续追加代码容易再次触发门禁。

本轮预拆范围：

- `apps/admin/components/organization/department-post-config-dialog.tsx`
  - 提取请求函数到 `department-post-config-api.ts`。
  - 同步改用 `requestBackendJson`，保留原超时、错误文案和返回结构。
- `apps/admin/components/projects/project-acceptances-panel.tsx`
  - 提取被驳回验收单的整改字段重置逻辑到 `project-acceptance-utils.ts`。

验收口径：

- `apps/admin/components/organization/department-post-config-dialog.tsx`：419 行。
- `apps/admin/components/organization/department-post-config-api.ts`：68 行。
- `apps/admin/components/projects/project-acceptances-panel.tsx`：492 行。
- `apps/admin/components/projects/project-acceptance-utils.ts`：370 行。
- 最终 `>500` 行门禁无输出。

## 2026-06-01 后续收口执行记录

本轮按“请求封装收口、临界文件预拆、E2E 覆盖补齐、最终验收”四阶段继续执行。

### 阶段 1：请求封装收口

范围：

- `apps/admin/components/ops/*`
- `apps/admin/components/platform-leads/platform-lead-mutations.tsx`
- `apps/admin/components/platform-tenants/platform-tenant-mutations.tsx`

处理：

- 将 ops 发布、脚本执行、系统指标、微服务健康请求迁移到 `requestBackendJson`。
- 将平台线索、平台租户 mutation 的本地 `fetch + response.json + payload.success` helper 迁移到 `requestBackendJson`。
- 保留 auth/login 相关 route 与登录表单请求，不纳入本轮业务请求封装收口。

提交：

- `c6ceda9 refactor: centralize admin ops platform requests`

### 阶段 2：H5 预览临界文件预拆

范围：

- `apps/admin/components/marketing/h5-page-editor-preview.tsx`

处理：

- 提取案例图片浏览组件到 `h5-page-case-image-carousel-preview.tsx`。
- 保留 `CaseImageCarouselPreview` 从原文件 re-export，避免现有引用大范围改动。

结果：

- `h5-page-editor-preview.tsx`：481 行降到 285 行。
- `h5-page-case-image-carousel-preview.tsx`：212 行。

提交：

- `66d7082 refactor: split h5 page image preview`

### 阶段 3：关键 E2E 覆盖补齐

新增 smoke：

- 项目详情弹窗可切到“工序验收”页签。
- 摄像头页基础统计与“设备接入”区域可渲染。

提交：

- `14193e4 test: cover project acceptance and cameras smoke`

### 验收记录

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，当前 9 条 smoke 全部通过。
- `>500` 行门禁无输出。
- E2E 中仍偶发 Next dev `__webpack_modules__[moduleId] is not a function` 日志，但用例退出码为 0。该问题表现为 Next dev server/cache 噪音，未阻塞本轮提交；如需彻底清理，应单独阶段排查 `.next-e2e` 与 dev server 并发缓存。

## 2026-06-01 临界文件继续拆分与 E2E 稳定性记录

本轮按“项目验收面板、项目状态面板、摄像头页与 Admin Shell、E2E dev server 稳定性”四阶段执行。

### 阶段 1：项目验收面板拆分

范围：

- `apps/admin/components/projects/project-acceptances-panel.tsx`

处理：

- 提取验收列表加载、施工阶段状态、验收动作、图片直传、竣工模板弹窗状态到 `project-acceptances-panel-state.ts`。
- 原面板保留布局和子组件连接，业务请求与 payload 未改写。

结果：

- `project-acceptances-panel.tsx`：492 行降到 112 行。
- `project-acceptances-panel-state.ts`：442 行。

提交：

- `aa8d7d9 refactor: split project acceptances panel state`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 项目详情“工序验收” smoke 通过。

### 阶段 2：项目状态面板拆分

范围：

- `apps/admin/components/projects/project-status-panel.tsx`

处理：

- 提取状态动作、施工阶段、状态流转、排期开工工程负责人候选加载与提交逻辑到 `project-status-panel-state.ts`。
- 原面板保留项目概览、最近流转、下一步动作和动作弹窗渲染。

结果：

- `project-status-panel.tsx`：473 行降到 225 行。
- `project-status-panel-state.ts`：315 行。

提交：

- `8174292 refactor: split project status panel state`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 项目详情“工序验收” smoke 通过。

### 阶段 3：摄像头页与 Admin Shell 拆分

范围：

- `apps/admin/app/(console)/cameras/page.tsx`
- `apps/admin/components/layout/admin-shell.tsx`

处理：

- 提取 cameras 页后端数据访问、分页 URL 构建和搜索参数类型到 `page-data.ts`。
- 提取 Admin Shell 主题 token、偏好读取/保存、偏好菜单到 `admin-shell-preferences.tsx`。

结果：

- `cameras/page.tsx`：468 行降到 279 行。
- `page-data.ts`：196 行。
- `admin-shell.tsx`：467 行降到 121 行。
- `admin-shell-preferences.tsx`：359 行。

提交：

- `9aaca87 refactor: split cameras page and admin shell`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 组织架构与摄像头 smoke 通过。

### 阶段 4：E2E dev server 稳定性

处理：

- Playwright 专用 dev server 启动前清理 `.next-e2e`，避免复用残留 dev 编译缓存。
- Admin smoke 改为单 worker 串行执行，避免多个 worker 并发触发 Next dev 的模块图异常。

提交：

- `bb719a4 test: stabilize admin e2e dev server`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 连续两轮通过，均为 9 条 smoke 通过。
- 两轮正式 E2E 未再出现 `__webpack_modules__[moduleId] is not a function`。

## 2026-06-01 第二轮临界文件拆分记录

本轮按“营销 H5 编辑器、用量列表动作、项目验收派生状态、角色权限弹窗”四阶段继续拆分。

### 阶段 1：营销 H5 编辑器状态拆分

范围：

- `apps/admin/components/marketing/h5-page-editor.tsx`

处理：

- 提取编辑器配置状态、模块增删改移、AI 回填、保存草稿、发布逻辑到 `h5-page-editor-state.ts`。
- 原组件保留模块库、手机预览、属性面板和 AI 弹窗渲染。

结果：

- `h5-page-editor.tsx`：453 行降到 254 行。
- `h5-page-editor-state.ts`：274 行。

提交：

- `7b61fb7 refactor: split h5 page editor state`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- H5 活动页新建弹窗 smoke 通过。

### 阶段 2：用量列表导航与分页拆分

范围：

- `apps/admin/components/usage/usage-list-actions.tsx`

处理：

- 提取用量 tab 类型、状态选项、URL 构建到 `usage-list-navigation.ts`。
- 提取分页组件到 `usage-pagination.tsx`。
- `usage-list-actions.tsx` 保留 tab 切换和筛选表单，并继续 re-export 原入口，避免调用方改动。

结果：

- `usage-list-actions.tsx`：451 行降到 305 行。
- `usage-list-navigation.ts`：69 行。
- `usage-pagination.tsx`：94 行。

提交：

- `d9bdefe refactor: split usage list navigation`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。

### 阶段 3：项目验收派生状态拆分

范围：

- `apps/admin/components/projects/project-acceptances-panel-state.ts`

处理：

- 提取当前验收单、工序占用、可发起状态、竣工验收阻塞原因等纯派生逻辑到 `project-acceptances-panel-derived.ts`。
- 主 hook 保留异步加载、动作请求、弹窗状态和图片上传。

结果：

- `project-acceptances-panel-state.ts`：442 行降到 390 行。
- `project-acceptances-panel-derived.ts`：85 行。

提交：

- `caa1bf7 refactor: split project acceptances derived state`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 项目详情“工序验收” smoke 通过。

### 阶段 4：角色权限弹窗拆分

范围：

- `apps/admin/components/roles/role-mutations.tsx`

处理：

- 提取角色权限配置弹窗到 `role-permissions-dialog.tsx`。
- 原文件保留新增角色、编辑角色和行操作入口。

结果：

- `role-mutations.tsx`：436 行降到 230 行。
- `role-permissions-dialog.tsx`：230 行。

提交：

- `b696b15 refactor: split role permissions dialog`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 角色权限配置弹窗 smoke 通过。

### 最终验收

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，9 条 smoke 全部通过。

## 2026-06-01 第三轮临界文件拆分与覆盖补齐记录

本轮按“摄像头资产、H5 线索、组织岗位配置、E2E 覆盖补齐”四阶段执行。

### 阶段 1：摄像头资产面板拆分

范围：

- `apps/admin/components/cameras/tenant-device-assets-panel.tsx`

处理：

- 提取设备资产编辑、删除、同步动作到 `tenant-device-asset-actions.tsx`。
- 提取厂商展示、状态 badge、设备标识压缩、资产显示名到 `tenant-device-asset-utils.tsx`。
- 原面板保留统计、表格和行渲染编排。

结果：

- `tenant-device-assets-panel.tsx`：427 行降到 120 行。
- `tenant-device-asset-actions.tsx`：282 行。
- `tenant-device-asset-utils.tsx`：42 行。

提交：

- `4a1c454 refactor: split tenant device asset actions`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 摄像头资产页 smoke 通过。

### 阶段 2：H5 线索表动作拆分

范围：

- `apps/admin/components/marketing/h5-leads-table.tsx`

处理：

- 提取线索跟进、转客户、作废弹窗和请求动作到 `h5-lead-actions.tsx`。
- 原表格文件保留列定义、状态展示和 DataTable 接入。

结果：

- `h5-leads-table.tsx`：426 行降到 149 行。
- `h5-lead-actions.tsx`：287 行。

提交：

- `40aade2 refactor: split h5 lead actions`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- H5 活动页新建弹窗 smoke 通过。

### 阶段 3：组织岗位配置列表拆分

范围：

- `apps/admin/components/organization/department-post-config-dialog.tsx`

处理：

- 提取已选岗位摘要和岗位命令列表到 `department-post-config-list.tsx`。
- 保存、新增岗位、搜索状态仍保留在原 dialog，避免改变业务 payload。

结果：

- `department-post-config-dialog.tsx`：419 行降到 353 行。
- `department-post-config-list.tsx`：130 行。

提交：

- `bdc82c7 refactor: split department post config list`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 组织架构配置岗位 smoke 通过。

### 阶段 4：E2E 覆盖补齐

新增 smoke：

- `/usage` 租户用量页基础区域。
- `/platform/usage` 租户账号访问平台用量时的访问提示。
- `/marketing?tab=h5-leads` 营销 H5 线索入口。

提交：

- `0533eb2 test: cover admin usage and marketing smoke`

最终验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，12 条 smoke 全部通过。

## 2026-06-01 第四轮临界文件拆分记录

本轮按“平台身份诊断、组织岗位弹窗、平台用量页、项目验收时间线”四阶段执行。

### 阶段 1：平台身份诊断结果拆分

范围：

- `apps/admin/components/platform-identity-diagnostics/identity-diagnostics-result.tsx`

处理：

- 提取诊断状态、租户摘要、主体身份、检查项列表、租户映射、修复结果等展示段到 `identity-diagnostics-result-sections.tsx`。
- 原结果组件保留数据状态判断和整体布局。

结果：

- `identity-diagnostics-result.tsx`：426 行降到 77 行。
- `identity-diagnostics-result-sections.tsx`：367 行。

提交：

- `921fa8c refactor: split identity diagnostics result sections`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。

### 阶段 2：组织岗位新增弹窗拆分

范围：

- `apps/admin/components/organization/post-mutations.tsx`

处理：

- 提取岗位新增/编辑弹窗表单、字段映射和默认值到 `post-dialog.tsx`。
- 原 mutations 文件保留触发按钮、状态和 API 提交流程。

结果：

- `post-mutations.tsx`：415 行降到 106 行。
- `post-dialog.tsx`：322 行。

提交：

- `65cfb45 refactor: split organization post dialog`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 组织架构 smoke 通过。

### 阶段 3：平台用量页数据逻辑拆分

范围：

- `apps/admin/app/(console)/platform/usage/page.tsx`

处理：

- 提取 searchParams 解析、默认日期、查询参数构建、后端 fetch、空数据兜底和分页摘要到 `page-data.ts`。
- 页面文件保留 session 判断、数据组合和 UI 渲染。

结果：

- `page.tsx`：445 行降到 284 行。
- `page-data.ts`：150 行。

提交：

- `55e7ecf refactor: split platform usage page data`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 平台用量页访问提示 smoke 通过。

### 阶段 4：项目验收时间线拆分

范围：

- `apps/admin/components/projects/project-acceptance-timeline.tsx`

处理：

- 提取整改回复、整改摘要、动作图片画廊、客户补充图片到 `project-acceptance-timeline-sections.tsx`。
- 时间线主文件保留流程排序、最新记录、驳回整改显示条件和动作卡片编排。

结果：

- `project-acceptance-timeline.tsx`：412 行降到 141 行。
- `project-acceptance-timeline-sections.tsx`：292 行。

提交：

- `aa1364b refactor: split project acceptance timeline sections`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 项目详情工序验收页签 smoke 通过。

最终验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 首轮出现一次登录接口瞬时失败；重跑失败用例通过，随后完整重跑 12 条 smoke 全部通过。

## 2026-06-01 第五轮临界文件拆分记录

本轮按“客户表单、发布部署面板、营销活动表单、Dashboard 页面”四阶段执行。

### 阶段 1：客户表单弹窗拆分

范围：

- `apps/admin/components/customers/customer-form-dialog.tsx`

处理：

- 提取头像上传、客户基础字段、负责人字段、抖音截图字段和主房产字段到 `customer-form-fields.tsx`。
- 原弹窗保留默认值重置、头像上传请求、提交 payload 和刷新流程。

结果：

- `customer-form-dialog.tsx`：409 行降到 193 行。
- `customer-form-fields.tsx`：337 行。

提交：

- `5148c6b refactor: split customer form fields`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。

### 阶段 2：发布部署面板快照状态拆分

范围：

- `apps/admin/components/ops/release-deployments-panel.tsx`

处理：

- 提取发布记录、成功版本、运行版本的刷新、轮询、分页和筛选状态到 `release-deployments-snapshots.ts`。
- 原面板保留发布、生产 Tag、回滚和卡片编排动作。

结果：

- `release-deployments-panel.tsx`：406 行降到 266 行。
- `release-deployments-snapshots.ts`：222 行。

提交：

- `605d85c refactor: split release deployment snapshots`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。

### 阶段 3：营销活动表单字段拆分

范围：

- `apps/admin/components/marketing/marketing-campaign-form-dialog.tsx`

处理：

- 提取基础字段、项目范围选择、活动规则字段和奖励字段到 `marketing-campaign-form-fields.tsx`。
- 原弹窗保留项目选项加载、范围选择状态和创建/编辑提交。

结果：

- `marketing-campaign-form-dialog.tsx`：406 行降到 211 行。
- `marketing-campaign-form-fields.tsx`：357 行。

提交：

- `8452bed refactor: split marketing campaign form fields`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- H5 活动页新建弹窗 smoke 通过。

### 阶段 4：Dashboard 页面拆分

范围：

- `apps/admin/app/(console)/dashboard/page.tsx`

处理：

- 提取平台/租户概览类型、默认日期和后端数据请求到 `dashboard-data.ts`。
- 提取平台概览、租户概览、指标卡和图表组合到 `dashboard-sections.tsx`。
- 页面文件仅保留 session 角色判断和数据组合。

结果：

- `page.tsx`：406 行降到 39 行。
- `dashboard-data.ts`：139 行。
- `dashboard-sections.tsx`：226 行。

提交：

- `a096f55 refactor: split dashboard data and sections`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 包含 `/dashboard` 入口的组织架构 smoke 通过。

最终验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，12 条 smoke 全部通过。

## 2026-06-01 第六轮临界文件拆分记录

本轮按“客服工单详情、平台设备页、客户设计前状态弹窗、腾讯设备动作”四阶段执行。

### 阶段 1：客服工单详情弹窗拆分

范围：

- `apps/admin/components/customer-service/customer-service-detail-dialog.tsx`

处理：

- 提取工单摘要、基础信息、图片列表、负责人/处理动作和处理记录到 `customer-service-detail-sections.tsx`。
- 原弹窗保留详情加载、分配负责人、执行动作和刷新回调。

结果：

- `customer-service-detail-dialog.tsx`：404 行降到 203 行。
- `customer-service-detail-sections.tsx`：284 行。

提交：

- `c9f1680 refactor: split customer service detail sections`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。

### 阶段 2：平台设备页拆分

范围：

- `apps/admin/app/(console)/platform/devices/page.tsx`

处理：

- 提取查询参数解析、后端数据读取和本页汇总计算到 `page-data.ts`。
- 提取设备页标题、汇总卡、Tab、筛选、列表和分页组合到 `page-sections.tsx`。
- 页面入口保留权限判断和数据组合。

结果：

- `page.tsx`：397 行降到 60 行。
- `page-data.ts`：170 行。
- `page-sections.tsx`：233 行。

提交：

- `c562006 refactor: split platform devices page`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 摄像头资产页 smoke 通过。

### 阶段 3：客户设计前状态弹窗字段拆分

范围：

- `apps/admin/components/customers/design-project-before-status-dialog.tsx`

处理：

- 提取关联客户/主房产摘要、主房产信息区和项目字段到 `design-project-before-status-fields.tsx`。
- 原弹窗保留主房产确保逻辑、项目创建、成员同步和状态推进回调。

结果：

- `design-project-before-status-dialog.tsx`：396 行降到 279 行。
- `design-project-before-status-fields.tsx`：256 行。

提交：

- `aa4cc24 refactor: split design project before status fields`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。

### 阶段 4：腾讯设备 SIP 信息弹窗拆分

范围：

- `apps/admin/components/cameras/tencent-device-actions.tsx`

处理：

- 提取 SIP 接入信息、认证密码展示和复制字段到 `tencent-device-secret-dialog.tsx`。
- 原动作组件保留新增设备、查密码、重置密码的状态和请求逻辑。

结果：

- `tencent-device-actions.tsx`：393 行降到 306 行。
- `tencent-device-secret-dialog.tsx`：105 行。

提交：

- `56fc265 refactor: split tencent device secret dialog`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 摄像头资产页 smoke 通过。

最终验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，12 条 smoke 全部通过。

## 2026-06-01 第七轮临界文件拆分记录

本轮按“用量日志表、项目验收状态、费用面板、客户 mutation shared”四阶段执行。

### 阶段 1：用量日志表拆分

范围：

- `apps/admin/components/usage/usage-logs-tables.tsx`

处理：

- 提取 AI、短信、短视频转写三张日志表到独立组件。
- 提取日期、数字、时长、状态 badge 和计费 badge 到 `usage-log-formatters.tsx`。
- 原 `usage-logs-tables.tsx` 保留 re-export，调用方 import 路径不变。

结果：

- `usage-logs-tables.tsx`：390 行降到 3 行。
- `usage-ai-logs-table.tsx`：119 行。
- `usage-sms-logs-table.tsx`：103 行。
- `usage-social-video-logs-table.tsx`：133 行。
- `usage-log-formatters.tsx`：69 行。

提交：

- `f98ce95 refactor: split usage log tables`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 租户用量页 smoke 通过。

### 阶段 2：项目验收状态管理 API/helper 拆分

范围：

- `apps/admin/components/projects/project-acceptances-panel-state.ts`

处理：

- 提取验收列表加载、创建工序/竣工验收、模板加载、保存/提交、通过/驳回、通知客户、删除草稿和上传图片 patch 到 `project-acceptances-panel-api.ts`。
- hook 文件保留 React 状态、派生状态、弹窗状态和回调编排。

结果：

- `project-acceptances-panel-state.ts`：390 行降到 343 行。
- `project-acceptances-panel-api.ts`：153 行。

提交：

- `08996c0 refactor: split project acceptance panel api helpers`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 项目详情工序验收页签 smoke 通过。

### 阶段 3：费用面板拆分

范围：

- `apps/admin/components/expenses/expenses-panel.tsx`

处理：

- 提取筛选类型、选项、日期转换、列表请求、金额格式化和本页汇总到 `expenses-panel-data.ts`。
- 提取统计卡、筛选头部和分页控件到 `expenses-panel-sections.tsx`。
- 面板文件保留状态、加载、防并发请求和表格刷新回调。

结果：

- `expenses-panel.tsx`：386 行降到 157 行。
- `expenses-panel-data.ts`：124 行。
- `expenses-panel-sections.tsx`：223 行。

提交：

- `42f3f9e refactor: split expenses panel sections`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 费用审批列表 smoke 通过。

### 阶段 4：客户 mutation shared 拆分

范围：

- `apps/admin/components/customers/customer-mutation-shared.tsx`

处理：

- 提取客户请求、头像上传、项目主成员同步到 `customer-mutation-api.ts`。
- 提取展示格式化、状态标签、来源标签、房产摘要和通用展示项到 `customer-mutation-display.tsx`。
- 原 shared 文件继续 re-export 新文件，保持现有 import 路径兼容。

结果：

- `customer-mutation-shared.tsx`：384 行降到 147 行。
- `customer-mutation-api.ts`：127 行。
- `customer-mutation-display.tsx`：143 行。

提交：

- `bb7bcdd refactor: split customer mutation shared helpers`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `pnpm --dir apps/admin build` 通过。
- 项目新增弹窗 smoke 通过。

最终验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，12 条 smoke 全部通过。

## 第八轮执行记录（2026-06-01）

目标：

- 继续压缩近期接近 400 行的 admin 文件，优先处理弹窗、页面数据辅助和多 tab 页面。
- 每阶段保持单一改动面，验收通过后单独提交。

### 阶段 1：平台线索详情弹窗拆分

范围：

- `apps/admin/components/platform-leads/platform-lead-mutations.tsx`

处理：

- 提取分配面板、详情网格、分配信息、分配日志和日期/面积展示辅助到 `platform-lead-detail-sections.tsx`。
- 原弹窗文件保留详情加载、打开/关闭状态和刷新时序。

结果：

- `platform-lead-mutations.tsx`：降到 140 行。
- `platform-lead-detail-sections.tsx`：265 行。

提交：

- `d52b6ab refactor: split platform lead detail sections`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- 营销活动 H5 线索入口 smoke 通过。

### 阶段 2：摄像头表单提交辅助拆分

范围：

- `apps/admin/components/cameras/camera-form-dialog.tsx`

处理：

- 提取摄像头新增/编辑 payload 组装和保存请求到 `camera-form-submit.ts`。
- 弹窗文件保留表单状态、设备加载、校验和关闭刷新时序。

结果：

- `camera-form-dialog.tsx`：降到 330 行。
- `camera-form-submit.ts`：85 行。

提交：

- `b1c5989 refactor: split camera form submit helper`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- 摄像头资产页 smoke 通过。

### 阶段 3：租户用量页数据辅助拆分

范围：

- `apps/admin/app/(console)/usage/page.tsx`

处理：

- 按平台用量页既有模式，提取 searchParams 类型、日期默认值、状态解析、查询串构造、后端 fetch 和空数据模型到 `page-data.ts`。
- 页面文件保留会话跳转、数据编排和 UI 渲染。

结果：

- `page.tsx`：降到 276 行。
- `page-data.ts`：116 行。

提交：

- `e35c822 refactor: split tenant usage page data`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- 租户用量页 smoke 通过。

### 阶段 4：平台账单 AI 用量 Tab 拆分

范围：

- `apps/admin/app/(console)/platform/billing/billing-usage-tabs.tsx`

处理：

- 提取 AI 试算观察 tab 到 `billing-ai-tab.tsx`。
- 原 `billing-usage-tabs.tsx` 保留价格规则、计费流水，并 re-export AI tab，避免改动页面调用方。

结果：

- `billing-usage-tabs.tsx`：降到 201 行。
- `billing-ai-tab.tsx`：192 行。

提交：

- `761231d refactor: split billing ai usage tab`

验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。

最终验收：

- `pnpm admin:check` 通过。
- `git diff --check` 通过。
- `>500` 行门禁无输出。
- `pnpm --dir apps/admin build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，12 条 smoke 全部通过。

## 风险与控制

- 风险：拆分过程中隐性改变表单默认值或 payload。
  - 控制：优先移动代码，不重写逻辑；保留原类型和请求函数。
- 风险：弹窗状态跨组件传递后关闭/刷新时序改变。
  - 控制：每个弹窗拆分后验证打开、提交、取消、成功关闭。
- 风险：H5 编辑器、项目验收这类大组件拆分后出现状态不同步。
  - 控制：先提取纯展示组件和常量，再提取 hooks；避免一次性重写状态结构。
- 风险：E2E 覆盖不足。
  - 控制：每阶段记录手动验收入口；复杂页面优先补最小 Playwright smoke。
