# 平台技术服务试用跟进人选择器设计

## 目标

将平台技术服务试用中的“跟进人员工 ID”输入改为业务人员可直接操作的平台人员选择器。用户通过姓名、脱敏手机号和角色识别人选，UUID 只作为 API 内部值使用。

本次覆盖四个入口：

1. 主动开通试用；
2. 审批试用申请；
3. 分配或改派平台跟进人；
4. 试用列表按跟进人筛选。

## 方案比较

### 方案 A：复用 `/platform/operators` 并加载前 100 人

开发量最小，但存在两个不可接受的问题：候选超过 100 人时被截断；试用管理权限与 `platform.operator.read` 不一致，有权管理试用的人可能无法加载候选。

### 方案 B：新增试用模块专用候选接口（采用）

新增分页、远程搜索的 assignee-candidates 接口，由试用模块按 `platform.service_trial.manage` 授权。接口只返回 active 平台人员的最小必要字段，避免扩大平台人员目录权限。前端抽取单一选择器供四个入口复用。

### 方案 C：给所有试用管理人员追加 `platform.operator.read`

可直接复用人员目录，但会扩大权限含义和数据暴露范围。跟进人选择并不等同于读取完整平台人员目录，因此不采用。

## API 与分层

新增：

`GET /platform/billing/service-trials/assignee-candidates`

查询参数：

- `page`：默认 1；
- `pageSize`：默认 20，最大 100；
- `keyword`：可选，最多 80 字符，按姓名或手机号搜索；
- `includeEmployeeId`：可选 UUID，仅用于回显当前历史负责人。

权限：

- 必须是有效平台员工；
- 必须具备 `platform.service_trial.manage`；
- 不要求 `platform.operator.read`；
- controller 只做 HTTP、Zod 校验、调用 service 和 `ResponseHandler.success`；
- service 做权限编排和视图转换；
- repository 查询 Supabase。

返回：

```ts
{
  list: Array<{
    id: string;
    name: string | null;
    phone_masked: string | null;
    status: "active" | "suspended" | "leaved" | "pending";
    roles: Array<{ code: string; name: string | null }>;
    selectable: boolean;
    historical: boolean;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

普通候选只包含 active、tenant_id 为 NULL 且至少拥有一个 active 平台角色的员工。`includeEmployeeId` 指向的当前负责人即使已停用，也可以额外返回为 `historical=true, selectable=false`，用于可读回显，不能重新选择。手机号始终脱敏，不返回完整手机号。

查询必须限定必要列、使用 `.range()` 分页、exact count，并批量读取角色，避免 N+1。关键词为空时不附加搜索条件。

## 前端交互

新增复用组件 `PlatformServiceTrialAssigneeCombobox`：

- 打开后加载第一页 active 候选；
- 输入姓名或手机号后 250ms 防抖并重新请求第一页；
- 选项主行显示姓名，次行显示脱敏手机号和角色；
- 当前值在触发器中显示可读标签，不显示 UUID；
- 加载、空结果、请求失败均在控件内就地展示；
- `allowClear=true` 时显示“取消当前分配”；
- guided 试用时必选，不显示清空动作；
- 已停用历史负责人只用于回显，并标注“历史负责人/已停用”。

接入规则：

- 主动开通与审批共用 approval fields 中的选择器；
- 分配弹窗使用同一选择器，并显示“当前负责人 → 新负责人”或“将取消当前分配”的确认摘要；
- 列表筛选使用同一选择器的单选模式，选择后 URL 仍保存 `trialAssigneeEmployeeId=<uuid>`；重载时通过 `includeEmployeeId` 恢复可读标签；
- 页面、标签、帮助文案不出现“员工 ID”“UUID”等数据库术语。

## 错误与安全

- API 参数错误使用 `Errors.fromZod`；
- repository 错误使用 `Errors.dbError`，不向客户端返回 Supabase 原始错误；
- 候选加载失败时禁止提交尚未确认的值，但保留已有选择和用户输入的搜索词；
- 提交仍使用现有 assign/grant/review RPC，数据库继续验证员工、角色、状态和并发版本；选择器不是安全边界；
- 不修改 Orange 仓库，不变更小程序契约；
- 本功能不需要数据库 schema 或 migration。

## 测试与验收

### API

- schema 覆盖分页默认值、pageSize 上限、keyword 长度和 includeEmployeeId UUID；
- repository 覆盖必要列、active 平台员工、分页搜索、exact count、角色批量查询和历史负责人；
- service 覆盖 `platform.service_trial.manage` 权限、手机号脱敏、历史人员不可选和错误脱敏；
- controller 覆盖真实路由注册、request-aware 身份、Zod 失败前不调用 service。

### Admin

- 选择器覆盖防抖搜索、姓名/手机号/角色展示、选择、清空、guided 必选、历史负责人和失败状态；
- 源码契约验证四个入口不再出现手填员工 ID；
- 筛选 URL 仍传 UUID，但 UI 只显示人员标签；
- Admin typecheck、build、file-size、diff check 全部通过；
- 在开发后台进行桌面宽度浏览器 smoke，验证开通、审批、改派、筛选四处控件。

## 非目标

- 不重构平台人员管理模块；
- 不改变试用分配 RPC 签名或数据库事实；
- 不自动按负载推荐跟进人；
- 不增加多选、批量分配或新依赖；
- 不把完整手机号暴露给试用管理页面。
