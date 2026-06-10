# 流程收款节点设计

## 背景

Admin 流程编排已经支持业务节点、施工节点、工序节点、审批确认节点和运行时推进。当前节点库里存在一个业务节点“定金”，同时财务模块已有 `payments` 表和收款类型 `deposit`、`stage_1`、`stage_2`、`stage_3`、`add_on`、`refund`。

这会造成两个问题：

- “定金”既像业务流转节点，又像财务收款动作，租户配置流程时容易混淆。
- 阶段款、尾款、增项款没有统一的流程闸门节点，无法表达“款项已入账后才能进入下一工序”。

因此需要新增一个收款节点，把收钱相关流程统一到财务语义里。业务节点只表达客户或项目阶段，收款节点表达项目款项确认和流程放行。

## 目标

- Admin 节点库新增“收款节点”。
- 收款节点可以拖入画布，插在任意两个节点之间。
- 收款节点属性可选择收款类型，例如意向定金、开工首付款、中期进度款、工程尾款、后期增项款。
- 项目流程运行时，收款节点必须检查项目下对应款项已入账，满足后才能推进到下一节点。
- 从节点库移除旧的业务节点“定金”，让收款动作统一走收款节点。
- 保留历史流程兼容性，不破坏已经保存或发布过的 `business_kind = deposit` 节点。

## 非目标

- 第一版不自动生成收款记录。
- 第一版不做客户小程序支付入口。
- 第一版不做自动催款、短信催收或账单通知。
- 第一版不删除 domain 中已有的 `deposit` 业务枚举，避免历史流程版本打不开。
- 第一版不把退款支出作为可选择的收款闸门类型。

## 产品行为

收款节点是流程闸门节点。它不代表“有人点了确认”，而代表系统检查财务数据后决定是否允许流程继续。

典型用法：

1. 租户在施工主流程里把“收款节点”插在“水电”和“瓦工”之间。
2. 收款节点属性选择“中期进度款”。
3. 项目运行到水电节点，水电完成后进入收款节点。
4. 如果项目下没有 `type = stage_2` 且 `status = confirmed` 的收款记录，点击推进时返回阻塞提示。
5. 财务创建或审核收款记录，并把状态置为“已入账”。
6. 用户再次推进收款节点，流程进入瓦工节点。

“已收到款”的系统含义必须是 `payments.status = confirmed`。`pending`、`rejected`、`refunded` 都不能放行。

## 节点属性

收款节点第一版支持以下属性：

- `payment_type`：必填，允许 `deposit`、`stage_1`、`stage_2`、`stage_3`、`add_on`。
- `min_amount`：可选，最低已入账金额。为空时只要求存在对应已入账收款记录。
- `block_message`：可选，未满足时展示的阻塞提示。

默认值：

- `payment_type = deposit`
- `min_amount = null`
- `block_message = null`

如果配置了 `min_amount`，运行时需要汇总该项目下同一 `payment_type` 的已入账金额，累计金额大于等于 `min_amount` 才能放行。

## 节点模型

新增业务语义：

- `business_kind = payment_collection`
- `node_type = confirmation`

这里选择复用 `confirmation` 节点类型，而不是新增数据库 `node_type = payment`，原因是当前数据库对 `node_type` 有 check constraint。第一版只需要表达“确认型闸门”，不需要扩展底层节点大类。财务语义由 `business_kind` 和 `config.payment_type` 承载。

后续如果财务节点变成一个大类，例如收款、退款、开票、结算、付款审批，可以再引入新的 `finance` 节点类型，并通过 migration 修改数据库约束。

## Admin 设计

节点库调整：

- 新增分组“财务节点”。
- 新增 preset “收款节点”。
- 从“业务流转”分组移除旧的“定金” preset。

属性面板调整：

- 当 `business_kind = payment_collection` 时显示收款节点配置。
- 收款类型使用 select，选项来自 `PaymentTypeConfig`，但过滤掉 `refund`。
- 最低金额使用数字输入，允许为空。
- 阻塞提示使用短文本输入。

画布行为：

- 用户可以把收款节点插在水电和瓦工之间，也可以插在签约、开工、竣工验收等任意位置。
- 节点标题默认随收款类型变化，例如“中期进度款”。
- 用户仍然可以手动编辑标题，但属性里保留真实的 `payment_type`。

## API 和运行时

API schema 新增收款节点 config 校验：

- `payment_type` 必须是允许的收款类型。
- `min_amount` 必须为非负数，允许为空。
- `block_message` 最长 200 字。

运行时校验放在 `assertRuntimeNodeCompletionAllowed` 中：

- 仅对 `business_kind = payment_collection` 的当前节点生效。
- 仅对 `subject_type = project` 的流程实例生效。
- 读取当前实例绑定的项目 ID。
- 查询 `payments`，限定 `project_id`、`type`、`status = confirmed`。
- 未配置 `min_amount` 时，存在至少一条匹配记录即可放行。
- 配置 `min_amount` 时，汇总匹配记录的 `amount`，金额达标才放行。
- 不满足条件时返回 409 业务错误。

错误码新增：

- `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`

默认错误文案：

- 未入账时：`请先确认收款后再推进流程`
- 金额不足时：`已入账金额不足，当前已入账 X 元，要求至少 Y 元`

如果节点配置了 `block_message`，优先使用配置文案，同时在错误详情中返回实际校验结果。

## 数据访问和性能

第一版不新增收款表，不改 payments 主结构。

需要新增或确认索引：

- `payments(project_id, type, status)`

如果现有 migration 中没有等价索引，需要通过新的 Supabase migration 添加。运行时查询必须限定字段，只读取 `id` 和 `amount`，并避免跨项目或跨租户全表扫描。

收款记录本身仍通过现有 payments CRUD 创建和审核。收款节点只做读取校验，不直接写 payments。

## 兼容性

为了避免破坏历史数据：

- `WORKFLOW_BUSINESS_KIND_VALUES` 继续保留 `deposit`。
- API 继续接受历史流程里的 `business_kind = deposit`。
- 已发布版本快照中的旧定金节点继续可读、可运行。
- 节点库不再展示旧“定金”业务 preset。

后续可以提供一次显式迁移工具，把旧定金业务节点转换为 `payment_collection + payment_type = deposit`。该迁移不属于第一版范围。

## 验证

实现完成后需要验证：

- Admin 类型检查通过。
- API 类型检查通过。
- Supabase migration 应用后，`supabase migration list` 显示 Local 和 Remote 对齐。
- 节点库显示“收款节点”，不再显示业务“定金”节点。
- 收款节点属性面板可以选择收款类型、填写最低金额和阻塞提示。
- 保存并发布包含收款节点的流程成功。
- 项目运行到收款节点时，没有已入账收款会被 409 阻塞。
- 创建对应 `confirmed` 收款后，收款节点可以推进到下一个节点。
- 配置最低金额时，金额不足会被阻塞，金额达标后放行。

## 后续迭代

- 在收款节点上增加“自动创建待收款记录”选项。
- 在项目详情提供收款节点旁的快捷“新增收款”入口。
- 在客户小程序展示待付款项并支持上传付款凭证。
- 支持收款节点自动通知财务或客户。
- 支持多笔分期、百分比金额、按合同金额计算应收金额。
