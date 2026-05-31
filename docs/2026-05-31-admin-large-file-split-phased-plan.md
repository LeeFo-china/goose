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
    "admin:check-file-size": "..."
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

## 执行顺序与提交策略

1. 阶段 0 提交文档。
2. 阶段 1 到阶段 5 每阶段独立执行、独立验收、独立提交。
3. 阶段 6 做最终门禁和文档回写，单独提交。
4. 如果某阶段发现业务 bug，先记录在阶段执行记录中；只有影响拆分验收时才同阶段修复，否则单独开修复提交。

## 风险与控制

- 风险：拆分过程中隐性改变表单默认值或 payload。
  - 控制：优先移动代码，不重写逻辑；保留原类型和请求函数。
- 风险：弹窗状态跨组件传递后关闭/刷新时序改变。
  - 控制：每个弹窗拆分后验证打开、提交、取消、成功关闭。
- 风险：H5 编辑器、项目验收这类大组件拆分后出现状态不同步。
  - 控制：先提取纯展示组件和常量，再提取 hooks；避免一次性重写状态结构。
- 风险：E2E 覆盖不足。
  - 控制：每阶段记录手动验收入口；复杂页面优先补最小 Playwright smoke。
