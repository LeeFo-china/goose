# 状态机整改验收测试方案

日期：2026-05-21

## 通用验收命令

每个代码阶段完成后必须执行：

```bash
bun run api:typecheck
bun run api:build
bun run check:permission-boundaries
pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit
git diff --check
```

## 客户状态机验收

### 成功流转

- `potential -> following` 使用 `start_following` 成功。
- `following -> arrived` 使用 `mark_arrived` 成功。
- `arrived -> designing` 前先创建/确认项目，项目成功后使用 `start_design` 成功。
- `dormant -> following` 使用 `reactivate` 成功。

### 非法流转

- `potential -> designing` 失败。
- `arrived -> designing` 但客户缺少主房产时失败。
- `invalid -> following` 失败。
- 未传必填 `reason` 的 `mark_invalid` / `mark_dormant` 失败。
- 客户侧不再接受下定或客户签约动作。

### 日志和兼容

- 成功流转后 `customer_status_transition_logs` 写入一条记录。
- `PATCH /customers/:id` 不传 `status` 时保持现有行为。
- `PATCH /customers/:id` 传 `status` 时不得绕过状态机。
- 客户列表筛选、客户详情、小程序客户登录不受影响。

## 项目状态机验收

### 成功流转

- `designing -> proposal_confirmed` 使用 `confirm_proposal` 成功。
- `proposal_confirmed -> signed` 使用 `sign_contract` 且 `signed_amount > 0` 成功。
- `signed -> design_finalized` 使用 `finalize_design` 成功。
- `design_finalized -> pending_start` 使用 `schedule_construction` 成功，且必须先确认开工日期。
- `pending_start -> started` 使用 `start_project` 成功。
- `started -> constructing` 使用 `start_construction` 成功。
- `constructing -> acceptance` 使用 `start_acceptance` 成功。

### 非法流转

- `designing -> signed` 失败，必须先确认方案。
- `proposal_confirmed -> signed` 但没有 `signed_amount` 失败。
- `design_finalized -> pending_start` 但没有 `start_date` 失败。
- `invalid -> constructing` 失败。
- 直接传未知 action 失败。

### 日志和副作用

- 成功流转后 `project_status_transition_logs` 写入一条记录。
- 日志包含 `project_id / from_status / to_status / action / operator_employee_id / reason / metadata / created_at`。
- 状态变化后公开项目缓存失效。
- 状态变化后首页项目列表缓存失效。

## 项目写操作限制验收

- `invalid` 项目不能新增施工日志。
- `on_hold` 项目不能新增施工日志。
- `acceptance` 项目不能新增施工日志。
- `invalid` 项目不能新增摄像头。
- `acceptance` 项目不能新增摄像头。
- `on_hold` 项目恢复后回到暂停前状态。
- 首页统计、任务中心、公开项目列表不出现作废项目。

## 客户项目联动验收

- 客户点击 `start_design` 后，端侧先完成项目创建/确认。
- 项目创建/确认失败时，不得调用客户 `start_design`，客户仍保持 `arrived`。
- 项目创建/确认成功后，客户执行 `start_design` 成功并进入 `designing`。
- 项目处于 `designing` 时不能直接签约，必须先执行 `confirm_proposal`。
- 项目签约成功后项目进入 `signed`。
- 项目签约成功后客户仍保持 `designing`。
- 多项目客户中，一个项目 `invalid` 不得自动把客户改为 `invalid`。

## 端侧动作化验收

- Admin 项目详情只展示当前状态可执行动作。
- Admin 客户详情只展示当前状态可执行动作。
- 小程序员工端执行非法动作返回 400。
- 无权限员工执行状态动作返回 403。
- 状态流转日志可在客户 / 项目详情查看。
- `GET /projects/:id/status-actions` 返回当前项目状态和合法动作。
- `GET /customers/:id/status-actions` 返回当前客户状态和合法动作。
- `GET /projects/:id/status-transitions` 支持分页返回项目状态流转日志。
- `GET /customers/:id/status-transitions` 支持分页返回客户状态流转日志。
