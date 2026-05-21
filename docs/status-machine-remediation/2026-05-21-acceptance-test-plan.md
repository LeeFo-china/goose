# 状态机整改验收测试方案

日期：2026-05-21

## 通用验收命令

每个代码阶段完成后必须执行：

```bash
bun run api:typecheck
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 阶段 1：项目状态机验收

### 成功流转

- `lead -> measure` 使用 `start_measure` 成功。
- `measure -> negotiating` 使用 `start_negotiation` 成功。
- `negotiating -> designing` 使用 `start_design` 成功。
- `designing -> signed` 使用 `sign_contract` 且 `signed_amount > 0` 成功。
- `signed -> constructing` 使用 `start_construction` 成功。

### 非法流转

- `lead -> completed` 失败，返回 400。
- `lead -> signed` 且没有 `signed_amount` 失败，返回 400。
- `invalid -> measure` 失败，返回 400。
- 直接传未知 action 失败，返回 400。

### 旧接口兼容

- `PATCH /projects/:id` 不传 `status` 时保持现有更新行为。
- `PATCH /projects/:id` 传 `status` 时不得绕过状态机。
- 非法 `status` 变更返回明确中文错误。

### 日志和副作用

- 成功流转后 `project_status_transition_logs` 写入一条记录。
- 日志包含 `project_id / from_status / to_status / action / operator_employee_id / reason / metadata / created_at`。
- 状态变化后公开项目缓存失效。
- 状态变化后首页项目列表缓存失效。

## 阶段 2：项目副作用验收

- `invalid` 项目不能新增施工日志。
- `invalid` 项目不能新增摄像头。
- `completed` 项目按业务规则禁止新增施工日志，或只允许售后日志。
- `on_hold` 项目恢复后回到暂停前状态。
- `acceptance` 状态可触发验收流程。
- 首页统计、任务中心、公开项目列表不出现作废项目。

## 阶段 3：客户状态机验收

### 成功流转

- `potential -> following` 使用 `start_following` 成功。
- `following -> arrived` 使用 `mark_arrived` 成功。
- `arrived -> designing` 使用 `start_design` 成功，并同步创建或复用项目。
- `designing -> ordered` 使用 `place_order` 成功。
- `ordered -> contracted` 使用 `sign_contract` 成功。
- `dormant -> following` 使用 `reactivate` 成功。

### 非法流转

- `potential -> contracted` 失败。
- `invalid -> following` 失败。
- `contracted -> invalid` 默认失败，除非业务确认独立动作。
- 未传必填 `reason` 的 `mark_invalid` / `mark_dormant` 失败。

### 日志和兼容

- 成功流转后 `customer_status_transition_logs` 写入一条记录。
- `PATCH /customers/:id` 不传 `status` 时保持现有行为。
- `PATCH /customers/:id` 传 `status` 时不得绕过状态机。
- 客户列表筛选、客户详情、小程序客户登录不受影响。

## 阶段 4：客户项目联动验收

- 项目 `sign_contract` 成功后，客户可同步为 `contracted`。
- 客户已是 `contracted` 时，项目签约不重复写无意义客户状态日志。
- 多项目客户中，一个项目 `invalid` 不得自动把客户改为 `invalid`。
- 关联客户处于 `potential / dormant / invalid` 时，项目签约返回 400，提示先推进客户状态。
- 客户 `sign_contract` 如后续要求项目关联，未传项目信息时返回 400；当前阶段暂不强制。

## 阶段 5：端侧动作化验收

- Admin 项目详情只展示当前状态可执行动作。
- Admin 客户详情只展示当前状态可执行动作。
- 小程序员工端执行非法动作返回 400。
- 无权限员工执行状态动作返回 403。
- 状态流转日志可在客户 / 项目详情查看。
- `GET /projects/:id/status-actions` 返回当前项目状态和合法动作。
- `GET /customers/:id/status-actions` 返回当前客户状态和合法动作。
- `GET /projects/:id/status-transitions` 支持分页返回项目状态流转日志。
- `GET /customers/:id/status-transitions` 支持分页返回客户状态流转日志。
