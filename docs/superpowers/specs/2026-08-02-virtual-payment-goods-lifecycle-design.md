# 微信虚拟商品上传发布闭环设计

## 背景与根因

平台当前仅通过微信 `query_upload_goods` 和 `query_publish_goods` 查询最近一次任务。微信返回 `status=0` 时代表没有可供校验的任务，返回 `status=1` 才代表任务处理中；现有实现把二者合并成同一个 `BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING`，因此后台错误地提示“仍在处理中”。同时后台没有启动上传和发布任务的入口，反复点击校验无法让状态前进。

本次目标是在系统配置的支付配置中补齐清晰、可审计、必须人工确认的三段式流程：上传商品、发布商品、校验映射。普通校验仍只查询微信状态并更新本地校验结论，不得隐式触发任何微信写操作。

## 方案比较

### 方案 A：校验时自动上传和发布

操作最少，但一次“校验”会产生外部写操作，失败位置和审计语义不清晰，也可能因重试重复提交。否决。

### 方案 B：保存本地任务表并由后台队列驱动

可提供更复杂的重试和历史任务，但微信接口只暴露每个环境的最近单商品批任务，当前仅管理一个品牌权益商品。额外任务表和队列不能提供真正的微信侧 exactly-once，反而增加状态对账成本。暂不采用。

### 方案 C：显式三段式动作与微信状态恢复（采用）

后台提供“上传商品到微信”“发布商品”“校验映射”三个独立动作。服务端每次写操作前先查询微信最新任务：已处理中时直接返回处理中，当前版本已成功时直接返回已完成，只有无任务、失败或与当前版本不一致时才启动新任务。所有微信写操作均要求超管在确认框中明确确认。

## 数据模型

在 `platform_virtual_payment_products` 新增可空字段 `item_url`，用于保存微信商品图片的稳定公网 HTTPS URL。历史映射允许暂时为空，避免迁移时伪造图片；新的保存请求必须提交合法 URL，上传动作在字段为空时返回明确的本地配置错误。

约束：

- 仅接受 `https://`。
- URL 最大 2048 字符。
- 路径必须以 `.png`、`.jpg` 或 `.jpeg` 结尾，可带查询参数。
- `item_url` 属于微信商品敏感字段；变化后映射自动回到待校验并清空 `validated_at`。
- 微信商品 ID 必须满足官方规则：1 至 20 个字符，只能包含字母、数字、下划线和连字符。
- 微信商品名称取平台权益商品名称，上传前校验为 1 至 20 个字符。
- 微信商品备注取 `purchase_notes`，上传前校验为 1 至 1024 个字符。
- 微信商品价格取映射的 `expected_amount_fen`，并继续要求与平台商品统一售价一致。

数据库变更只通过新的 `supabase/migrations/` migration 完成。migration 同步更新管理 RPC 的允许字段、输入校验、敏感字段判断、查询快照和写入逻辑。回滚时先把购买模式切到维护态并停止写操作，再恢复旧 RPC、移除 URL 相关约束和列；不会删除订单或权益事实。

## 服务边界

### 微信网关

扩展现有 `WechatVirtualPaymentGatewayPort`：

- `startUploadGoods` 调用 `/xpay/start_upload_goods`。
- `startPublishGoods` 调用 `/xpay/start_publish_goods`。
- 查询上传结果保留 `remark` 与 `itemUrl`，使校验能核对完整上传载荷。

签名、超时、响应大小限制、请求 ID 规范化和上游错误包装沿用现有网关。网关返回值不得包含 access token 或 AppKey。

### 商品生命周期服务

新增一个只负责微信商品生命周期的服务，依赖管理快照、加密 AppKey 读取、access token provider、网关和审计服务：

- `getStatus(environment)`：只读查询上传与发布最新任务，生成安全状态快照。
- `startUpload(environment, version)`：校验本地数据和乐观版本，执行上传前状态检查，再显式启动上传。
- `startPublish(environment, version)`：要求当前版本上传已完整成功，再执行发布前状态检查并显式启动发布。

状态快照为两个阶段的判别联合：`not_started | processing | succeeded | failed | mismatch`，并返回 `next_action`、安全的微信 Request-ID 和建议轮询毫秒数。响应不包含密钥、access token、微信原始 errmsg 或未白名单化的上游字段。

启动接口返回 `accepted | already_processing | already_succeeded`。当微信返回批任务正在运行的官方错误码时，服务重新查询并收敛为 `already_processing`，避免网络重试造成模糊失败。

所有方法要求平台超管上下文和 `platform.payment.config.manage` 权限。上传和发布分别记录审计动作，元数据只保存环境、映射版本、商品 ID、结果和安全 Request-ID。

### 现有校验服务

现有校验继续按顺序只读查询微信上传和发布任务，并持久化本地 `pending | valid | invalid`：

- 上传无任务：`BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_MISSING`。
- 上传处理中：`BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_PENDING`。
- 发布无任务：`BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_MISSING`。
- 发布处理中：`BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_PENDING`。
- 上传完整载荷不一致或失败：保留上传不一致错误。
- 发布商品不一致或失败：保留发布不一致错误。

校验成功必须同时确认商品 ID、名称、价格、备注、图片 URL 和发布状态与当前本地版本一致。

## HTTP 契约

沿用统一路径前缀：

- `GET /platform/payment/wechat-virtual/branding-entitlement/:environment/goods-status`
- `POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/upload`
- `POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/publish`
- `POST /platform/payment/wechat-virtual/branding-entitlement/:environment/validate`（保持现有路径）

两个写接口 body 均为严格对象 `{ "version": number }`。状态接口只允许空 query。controller 只负责鉴权上下文、Zod 校验、调用 service 和 `ResponseHandler.success`；领域校验、微信编排与错误分类全部位于 service/gateway。

## Admin 交互

在每个沙箱/生产映射卡中增加“微信商品流程”区域，使用横向三步状态而不是再嵌套一层大 Card：

1. 上传商品：显示未上传、处理中、已上传、失败或不一致。
2. 发布商品：只有当前上传完整成功后可执行。
3. 校验映射：只有当前发布成功后可执行。

进入环境页或映射版本变化时自动执行一次只读状态查询；处理中采用有上限轮询，2 秒一次、最多 15 次。超时后停止轮询并显示“刷新微信状态”，不自动提交写操作。

“上传商品到微信”和“发布商品”均使用现有 shadcn `AlertDialog`：确认文案明确环境、商品 ID 和价格，并提示这是微信侧写操作。生产环境使用更强的风险文案。按钮执行期间显示 Spinner，禁止重复点击。

映射表单新增“微信商品图片 URL”，说明必须是长期可访问的 JPG/PNG 公网 HTTPS 地址。界面准确区分“暂无任务”和“任务处理中”，不再使用统一的处理中提示。页面加载骨架同步增加商品流程占位。

## 错误与恢复

- 本地版本冲突要求刷新，不调用微信。
- 本地字段不满足微信约束时返回 409 稳定业务错误，不调用微信。
- 微信超时或未知响应不自动重试写请求；先重新查询状态，由操作者决定是否再次提交。
- 状态查询失败不改变映射有效性；显式校验仍按照已确认/未确认规则保存结果。
- 上传成功、发布未开始时，页面只开放发布动作。
- 任一映射敏感字段变化后，旧状态可能仍能查询到，但会标记 `mismatch`，必须重新上传、发布和校验。
- OCR、普通微信支付商户号、平台自营实物商城和小程序仓库不在本次变更范围。

## 验证与验收

- gateway 契约测试验证两个官方路径、`pay_sig`、环境值、单商品 body 和安全响应归一化。
- service 测试覆盖无任务、处理中、已成功、失败、不一致、版本冲突、上传前置校验、发布前置校验、并发任务错误收敛和审计元数据。
- validation 测试覆盖四个精确的缺失/处理中错误码及完整上传载荷核验。
- migration 契约测试覆盖新列、约束、RPC 白名单、敏感字段失效和 service-role 边界。
- controller/schema 测试覆盖三个新路由、严格 body/query 和统一响应包装。
- Admin 契约/纯函数测试覆盖图片 URL、三步状态、确认框、轮询上限、按钮门禁、安全错误映射和骨架同步。
- 完成 API/Admin 类型检查、相关 Bun 测试、生产构建、文件大小检查和 migration 状态检查。
- 开发环境只执行 migration 和只读状态 smoke；不自动调用真实上传/发布。最终真实验收由超管在后台依次确认沙箱上传、发布、校验，再按同样流程验收生产。

## 官方依据

- [启动批量上传道具](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_start_upload_goods.html)
- [启动批量发布道具](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_start_publish_goods.html)
- [查询批量上传道具任务](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_upload_goods.html)
- [查询批量发布道具任务](https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_publish_goods.html)
