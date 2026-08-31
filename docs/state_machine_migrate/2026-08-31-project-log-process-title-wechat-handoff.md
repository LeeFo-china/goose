# 微信小程序施工日志工序标题对接说明

日期：2026-08-31

## 目标

项目详情的施工日志时间线中，每条记录必须展示该日志发生时的具体施工工序，
不能重复使用模块级文案“施工进度”作为日志标题。

本文说明 gooes 后端与微信小程序 orange 的对接边界。本文只写入 gooes 仓库，
`/Users/leefo/Public/work/orange` 仅作为只读参考，由微信小程序团队自行修改和发布。

## 业务口径

施工日志标题按以下优先级展示：

```text
日志工序名称 node_name > 标准阶段名称 stage_label > “施工记录”
```

示例：

| 接口数据 | 页面标题 |
| --- | --- |
| `node_name=强弱电开槽验收`，`stage_label=水电` | 强弱电开槽验收 |
| `node_name=null`，`stage_label=瓦工` | 瓦工 |
| `node_name=null`，`stage_label=null` | 施工记录 |

明确禁止：

- 不展示 `plumbing_electrical`、`tiling` 等内部编码。
- 不使用“施工进度”作为每条日志的兜底标题。
- 不根据项目当前 workflow 节点重写历史日志标题。日志必须保留创建时的工序快照。
- 不从图片内容、日期或项目当前状态猜测历史工序。

## 当前后端契约

### 公开项目日志

微信访客项目详情使用分页接口：

```http
GET /front/projects/:projectId/logs?page=1&pageSize=10
```

`page` 默认 `1`，`pageSize` 默认 `10`、最大 `100`。响应结构：

```json
{
  "data": {
    "list": [
      {
        "id": "uuid",
        "project_id": "uuid",
        "stage_code": "plumbing_electrical",
        "stage_label": "水电",
        "node_name": "强弱电开槽验收",
        "content": "厨房和卫生间水电点位已复核。",
        "images": ["https://cdn.example.com/project-log/a.jpg"],
        "created_at": "2026-08-31T06:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

后端当前已经根据 `stage_code` 输出标准中文 `stage_label`；端上无需维护一套重复的
阶段编码文案。

### 员工项目日志

员工项目详情继续使用：

```http
GET /project-logs/projects?project_id=:projectId&page=1&pageSize=20
POST /project-logs
```

创建请求保持兼容：

```json
{
  "project_id": "uuid",
  "stage_code": "plumbing_electrical",
  "node_name": "强弱电开槽验收",
  "content": "厨房和卫生间水电点位已复核。",
  "images": ["project-log/tenant/project/a.jpg"]
}
```

`stage_code`、`content` 必填，`node_name` 当前仍为可选字段。

## 后端整改责任

gooes 后续实现时应保持现有接口兼容，并补齐以下行为：

1. 创建施工日志时，如果客户端没有提交 `node_name`，后端从当前 workflow 工序节点
   读取展示名称并写入 `project_logs.node_name`，形成不可随当前流程变化的历史快照。
2. 如果无法获得具体 workflow 工序名称，保留 `node_name=null`，查询时继续返回由
   `stage_code` 转换得到的 `stage_label`。
3. 不为了修复标题强制回填无法可靠关联工序的历史数据。
4. 不改变现有分页、权限、公开范围和图片隐私规则。

上述“自动写入工序快照”是目标行为，不应在后端上线前被微信端假设为已存在。

## 微信小程序改造要求

### 统一标题解析

orange 当前公共帮助函数优先使用 `stage_label`，会遮盖更具体的 `node_name`。
应统一调整为：

```ts
const getProjectLogDisplayTitle = (log: ProjectLogDisplaySource) =>
  trimText(log.node_name) ||
  getProjectLogStageLabel(log.stage_code, log.stage_label) ||
  '施工记录';
```

兼容原则：

- 新后端：优先显示后端自动快照的具体工序。
- 旧日志：`node_name` 为空时显示接口返回的 `stage_label`。
- 滚动发布期间：接口缺少 `stage_label` 时，可继续用现有标准阶段字典转换
  `stage_code`，但不得直接显示编码。

### 只读影响范围

根据 orange 当前代码，微信小程序团队至少需要检查：

| 文件 | 对接要求 |
| --- | --- |
| `src/services/project_log_helpers.ts` | 调整统一标题优先级和最终兜底文案 |
| `src/services/project_log_types.ts` | 保持 `stage_code/stage_label/node_name` 可空类型兼容 |
| `src/packageVisitor/pages/visitor-project-detail/components/ProjectLogTimeline.tsx` | 验证访客项目时间线使用统一帮助函数 |
| `src/packageCustomerPortal/pages/customer-home/index.tsx` | 修改页面内独立的标题解析，避免仍然阶段优先 |
| 客户项目详情、分享页、员工项目详情 | 回归所有调用 `getProjectLogDisplayTitle` 的页面 |

共享帮助函数调整会影响多个页面，微信端不要只在访客项目详情组件里硬编码修复。

### 日志创建页

微信端在后端自动快照能力上线前，创建日志时仍应在已有 workflow 元数据可用的情况下，
把当前工序显示名称传入 `node_name`。后端能力上线后，该字段可以继续传递，也可以省略；
后端负责最终兜底。

工序名称属于流程上下文，不应增加为员工必须手工填写的字段。员工填写的内容应聚焦
当日施工情况、现场问题和图片。

## 推荐发布顺序

1. gooes 后端先上线自动快照和现有响应兼容逻辑。
2. 微信小程序调整共享标题帮助函数并完成回归。
3. 联调开发环境的公开项目、客户项目和员工项目日志。
4. 微信小程序发布新版本。
5. 抽查历史日志：允许显示“水电”“瓦工”等标准阶段，不允许再显示内部编码或重复的
   “施工进度”。

微信端提前发布也不会阻断现有接口；在后端自动快照上线前，缺少 `node_name` 的历史日志
会按 `stage_label` 正常降级。

## 联调与验收清单

| 场景 | 期望结果 |
| --- | --- |
| 日志同时有 `node_name` 和 `stage_label` | 显示具体 `node_name` |
| 日志没有 `node_name`，有 `stage_label` | 显示标准阶段名称 |
| 两者都没有 | 显示“施工记录” |
| `stage_code=plumbing_electrical` | 页面不出现英文编码 |
| 同一项目存在多个不同工序日志 | 每条记录保留各自创建时的工序标题 |
| workflow 已推进到下一节点 | 历史日志标题不随当前节点变化 |
| 日志列表超过一页 | 按接口分页加载，不请求无上限全量数据 |
| 访客项目详情 | 不暴露客户姓名、电话、门牌号或内部员工信息 |
| 客户首页、客户项目详情、分享页、员工项目详情 | 标题规则一致 |

## 错误与兼容处理

- 列表请求失败：沿用现有重试/保留已加载内容交互，不用“施工进度”伪造记录。
- 单条记录字段异常：跳过无效内部编码，依次执行 `node_name`、`stage_label`、
  “施工记录”的安全降级。
- `node_name` 只做展示文本处理，不作为 workflow 动作、阶段判断或权限判断依据。
- workflow 操作继续严格使用 `timeline_nodes[].actions` 和后端 action 契约，标题整改不改变
  流程推进逻辑。

## 双方责任

| 团队 | 责任 |
| --- | --- |
| gooes 后端 | 自动快照工序名称、稳定返回标准阶段文案、保持分页和隐私边界 |
| 微信小程序 orange | 调整共享标题优先级、覆盖独立帮助函数、完成多入口回归并发布 |

