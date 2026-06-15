# 客户侧项目详情 workflow timeline bootstrap 对接说明

日期：2026-06-15

## 背景

客户侧项目详情页必须从客户自助接口读取完整 workflow 顺序：

```http
GET /customer/projects/:id/detail-bootstrap
```

小程序不再使用以下来源兜底生成 timeline：

- `/workflow-subjects/project/:id/state`
- `GET /customer/projects`
- `construction_stages`
- `next_stage`
- 本地固定工序顺序
- 当前节点单点状态

原因是客户侧详情必须严格展示后端 workflow runtime 绑定的 graph 顺序，不能在
前端合成伪造的单节点 timeline。

## 后端已调整

gooes 已调整 customer detail bootstrap 的 workflow 加载策略：

- `workflow_progress` 不再走 1200ms optional module timeout。
- `workflow_progress` 仍计入 `workflow_progress_ms`。
- 只有真实异常才降级为 `source = "unavailable"`，并写入
  `partial_errors.module = "workflow_progress"`。
- 正常慢查询不会再被 optional timeout 截断。
- `projectWorkflowProgressService` 内部并行读取：
  - `workflow_subject_states`
  - running `workflow_instances`
  - 已发布 graph 的 definition/version

## 接口契约

### 请求

```http
GET /customer/projects/:id/detail-bootstrap?log_page_size=10&include_acceptances=true&include_stages=false&include_campaigns=true
```

认证：客户态 token。

### 响应关键字段

```ts
type CustomerProjectDetailBootstrapPayload = {
  project: Project;
  workflow_progress: {
    source: "workflow_runtime" | "missing_runtime" | "unavailable";
    instance_id: string | null;
    instance_status: string | null;
    current_node_key: string | null;
    current_node_title: string | null;
    current_node_type: string | null;
    current_business_kind: string | null;
    current_stage_code: string | null;
    current_gate: {
      type: "payment_collection";
      payment_type: string;
      payment_label: string;
      blocked_stage_code: string | null;
      blocked_stage_label: string | null;
    } | null;
    timeline_nodes: Array<{
      node_key: string;
      node_title: string;
      node_type: string | null;
      business_kind: string | null;
      status: "done" | "current" | "pending" | "blocked";
      assignee_employee_id?: string;
      assignee_employee_name?: string | null;
      assignee_employee?: {
        id: string;
        name: string | null;
        avatar: string | null;
      };
    }>;
    pending_task_count: number;
  };
  partial_errors: Array<{
    module: string;
    code: string;
    message: string;
  }>;
};
```

## timeline 规则

后端返回的 `workflow_progress.timeline_nodes` 必须满足：

1. 按项目实际 running workflow instance 绑定的 published graph 顺序生成。
2. 从 start 节点出发按 edge 顺序遍历。
3. 过滤 start/end 技术节点。
4. 已完成 runtime 节点返回 `status = "done"`。
5. 当前 runtime 节点返回 `status = "current"`。
6. 后续节点返回 `status = "pending"`。
7. 当前节点必须能且只能匹配一个 `timeline_nodes[].node_key`。

小程序端只展示后端返回的 `timeline_nodes`，不再本地补齐。

## 小程序对接要求

### 1. 只信任 detail-bootstrap 的 workflow_progress

项目详情页读取：

```text
payload.workflow_progress.timeline_nodes
```

或兼容：

```text
payload.project.workflow_progress.timeline_nodes
```

没有完整 `timeline_nodes` 时，不要合成单个“当前节点”小圆点。

### 2. 不再使用员工态 workflow state 兜底

客户 token 下不要调用：

```http
GET /workflow-subjects/project/:id/state
```

该接口是员工/租户权限上下文，不是客户侧可靠接口。

### 3. 不再用客户项目列表兜底

不要用：

```http
GET /customer/projects
```

里的 `project.workflow_state` 生成详情页完整 timeline。列表数据只适合展示摘要，
不代表完整 workflow 顺序。

### 4. payment_collection 展示

当当前节点是收款节点时：

```text
workflow_progress.current_business_kind = "payment_collection"
workflow_progress.current_gate.type = "payment_collection"
```

小程序应展示收款 gate 信息，例如 `payment_label = "中期进度款"`。

如果当前 timeline node 里有：

```text
assignee_employee_name
```

可展示：

```text
正在等待财务 xxx 审核
```

客户侧只展示状态，不提交收款 action。

## 验收条件

准备一个已有 running workflow runtime 的项目。

请求：

```http
GET /customer/projects/:id/detail-bootstrap?log_page_size=10&include_acceptances=true&include_stages=false&include_campaigns=true
```

验收：

- `workflow_progress.source === "workflow_runtime"`
- `workflow_progress.timeline_nodes.length > 1`
- `timeline_nodes` 中有且只有一个 `status === "current"`
- 当前节点与员工侧同项目当前节点一致
- `partial_errors` 不包含 `module = "workflow_progress"`
- 客户侧“施工进度”展示完整 workflow 顺序，不展示前端合成的单节点 timeline

## 当前 gooes smoke 结果

项目：

```text
2d710a84-1045-4750-8dfd-51a0f463a4db
```

服务层 `projectWorkflowProgressService`：

```json
{
  "elapsed_ms": 2864,
  "source": "workflow_runtime",
  "current_node_key": "payment_stage_2",
  "timeline_count": 10,
  "current_count": 1
}
```

客户 bootstrap workflow loader：

```json
{
  "elapsed_ms": 2490,
  "workflow_progress_ms": 2490,
  "source": "workflow_runtime",
  "current_node_key": "payment_stage_2",
  "timeline_count": 10,
  "current_count": 1,
  "partial_errors": []
}
```

说明：

- 同路径不再因为 1200ms optional timeout 返回 `unavailable`。
- `timeline_nodes` 可返回完整节点序列。
- 当前节点是 `payment_stage_2 / 中期进度款`。

## 注意事项

文档中另一个示例项目：

```text
3718dc44-0212-4f3b-b1fd-feea982af0a4
```

在当前 Supabase 环境未查到项目记录，因此本次使用
`2d710a84-1045-4750-8dfd-51a0f463a4db` 验证同一代码路径。

如果线上仍出现 `workflow_progress.source = "unavailable"`，后端应优先检查真实
异常，而不是前端兜底：

- 是否存在 running `workflow_instances`。
- graph snapshot 是否完整。
- runtime nodes 是否可读取。
- `partial_errors` 中 `workflow_progress` 的具体错误码和 message。
