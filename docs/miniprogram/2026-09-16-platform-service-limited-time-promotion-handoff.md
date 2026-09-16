# 平台技术服务限时活动：小程序交接契约

日期：2026-09-16

适用仓库：`gooes` 后端 / `orange` 小程序

状态：Gooes 已新增服务商品有效价计算和创建订单时的价格快照；Orange 本次保持未改，客户端适配由小程序团队修改。开发环境 migration、真机验收和真实支付验收尚未完成，均为发布 gate，本文不将它们标记为已完成。

## 1. Ownership 与边界

- Gooes 负责根据数据库时钟判断活动是否生效，返回有效商品价格，并在创建订单事务中重新计算价格、冻结 `order.amount_fen` 和商品快照。活动适用精确区间为 `[starts_at, ends_at)`。
- Orange 负责套餐页、下单确认、活动展示、倒计时校准、页面主动刷新和已知 active 活动的到期刷新。Orange 仓库本次未改动；以下客户端工作均由小程序团队修改。
- 客户端不得自行计算折扣，不得向创建订单接口提交活动价、折扣率、活动 ID 或活动版本。后端不会信任客户端展示价格。
- 旧客户端继续只读取 `amount_fen` 即可兼容：活动期它是后端有效价，无活动时它是日常价。现有创建订单 endpoint 和 request body 不变。

## 2. Orange 现状与改动位置

本交接基于对 Orange 当前源码的只读检查：

| 路径 | 当前行为 | 由小程序团队修改 |
| --- | --- | --- |
| `src/types/api/platform_service.d.ts` | `PlatformServiceProduct` 只有旧价格字段；`PlatformServiceProductsPayload` 尚无 `server_time` | 增加本文第 4 节的有效价和可空 `promotion` 类型；给列表 payload 增加 `server_time` |
| `src/services/platform_service.ts` | `listProducts(1, 20)` 已调用 `GET /billing/service-products`；创建订单 request 已符合现有契约 | endpoint 和创建订单 request 保持不变；沿用现有会话和 `RequestOptions` |
| `src/packageEmployees/pages/platformServicePaymentSmoke/usePlatformServicePaymentSmoke.ts` | `useDidShow` 加载商品；确认文案和创建订单使用所选商品的 `amount_fen`；409 stale terms 已刷新商品 | 页面首次进入、`onShow`/后台返回和下单前刷新；对已返回的 active 活动按 `server_time`、`ends_at` 安排一次到期刷新；创建响应后以订单快照金额为最终；重试复用幂等键 |
| `src/packageEmployees/pages/platformServicePaymentSmoke/ServiceProductList.tsx` | 用 `amount_fen` 展示应付价，用 `list_amount_fen` 和 `price_rate_basis_points` 判断旧折扣展示 | 继续以 `amount_fen` 为应付价；按第 5 节处理日常价、划线价及可选活动内容 |
| `src/packageEmployees/pages/platformServicePaymentSmoke/ServiceProductTermsPopup.tsx` | 条款弹层展示 `amount_fen` | 保持应付金额取 `amount_fen`，活动文案只作展示 |
| `src/packageEmployees/pages/platformServicePaymentSmoke/index.tsx` | 套餐选择和下单确认都读取 `selectedProduct.amount_fen` | 保持该取值；补充首次进入、`onShow`、下单前及 active 到期刷新，并确认创建响应金额 |
| `src/packageEmployees/pages/platformServicePaymentSmoke/ServiceOrderResultCard.tsx` | 已明确“订单金额和版本以后端快照为准”，展示 `order.amount_fen` | 保持现有订单快照语义，不用最新商品活动价覆盖订单金额 |
| `src/packageEmployees/pages/platformServicePaymentSmoke/index.scss` | 现有套餐价格与划线价样式 | 如展示 badge、摘要或倒计时，在这里补充样式 |
| `src/packageEmployees/pages/platformServicePaymentSmoke/model.ts` | 已有分转元、折扣率格式化和稳定错误码映射 | 增加基于 `server_time` 的时间校准/活动展示纯函数；只为已返回的 active 活动计算倒计时和到期刷新 |
| `tests/platform-service-product-card-selection.test.ts` | 只覆盖套餐卡选择及点击传播 | 补充有效价、活动可空、active 到期刷新、开始/停止后主动刷新及三档套餐一致性；可按现有测试组织方式新增专门测试文件 |

## 3. 商品列表接口

```http
GET /billing/service-products?page=1&pageSize=20
Authorization: Bearer <现有租户会话 token>
```

- 继续使用 Orange 现有登录会话和 `AuthService.ensureSessionReady`；读取商品需要现有 `billing.service_order.create` 权限。
- 默认 `page=1&pageSize=20`，`pageSize` 最大为 `100`。
- 金额单位均为分。
- 成功响应仍使用现有 `{ "data": ..., "message": "success" }` 包装。

以下是字段结构精确、标识与内容已脱敏的活动期示例。UUID、活动文案、时间和条款正文仅用于说明类型；金额和折扣示例表达 `platform_service_1y` 的 9800 元日常价、2 折后 1960 元有效价：

```json
{
  "data": {
    "list": [
      {
        "id": "<masked-product-id>",
        "product_id": "<masked-product-id>",
        "product_version_id": "<masked-product-version-id>",
        "code": "platform_service_1y",
        "title": "平台部署及年度技术服务（1年）",
        "term_years": 1,
        "pricing_version": 1,
        "list_amount_fen": 980000,
        "base_amount_fen": 980000,
        "effective_amount_fen": 196000,
        "amount_fen": 196000,
        "base_price_rate_basis_points": 10000,
        "price_rate_basis_points": 2000,
        "service_scope": [
          "客户专属系统环境部署",
          "服务器基础配置与安全基线配置",
          "首次操作培训及实施指导",
          "1年年度运维与技术支持"
        ],
        "terms_version": 1,
        "terms_content": "<完整条款正文已脱敏>",
        "promotion": {
          "id": "<masked-promotion-id>",
          "version_id": "<masked-promotion-version-id>",
          "version": 1,
          "name": "<活动名称已脱敏>",
          "badge_text": "<活动 badge 已脱敏>",
          "title": "<活动标题已脱敏>",
          "summary": "<活动摘要已脱敏>",
          "rules_text": "<活动规则已脱敏>",
          "discount_rate_basis_points": 2000,
          "starts_at": "2026-09-20T00:00:00.000Z",
          "ends_at": "2026-09-27T00:00:00.000Z",
          "base_amount_fen": 980000,
          "effective_amount_fen": 196000
        },
        "status": "enabled",
        "published_version_id": "<masked-product-version-id>"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 3,
      "totalPages": 1
    },
    "server_time": "2026-09-21T08:00:00.000Z"
  },
  "message": "success"
}
```

没有生效活动时，`promotion` 为 `null`，`price_rate_basis_points` 为 `10000`，且 `amount_fen === effective_amount_fen === base_amount_fen`。旧字段 `amount_fen` 始终保留。scheduled 活动也返回 `promotion: null`，不会向客户端暴露未来活动的 `starts_at`。

## 4. 字段语义

| 字段 | 语义 | 客户端用法 |
| --- | --- | --- |
| `list_amount_fen` | 商品版本标价 | 只用于商品现有“原价/标价”语义；是否划线仍按产品设计规则处理 |
| `base_amount_fen` | 当前已发布商品版本的日常售价，活动计算基数 | 可作为活动期日常价对照；不得据此自行计算活动价 |
| `effective_amount_fen` | 当前后端计算出的最终有效价 | 与 `amount_fen` 相等，便于新客户端明确理解 |
| `amount_fen` | 兼容字段，也是当前应付/下单确认价 | 所有新旧客户端都必须以它展示应付金额和下单前确认金额 |
| `base_price_rate_basis_points` | 日常价基准，当前为 `10000` | 展示辅助字段 |
| `price_rate_basis_points` | 当前有效费率；无活动为 `10000`，示例 `2000` 表示日常价的 20% | 仅展示，不参与客户端重算 |
| `promotion` | 当前活动快照；无有效活动时为 `null` | badge、标题、摘要、规则和倒计时均为可选增强，不影响购买主流程 |
| `server_time` | 后端数据库计算本次有效价时的权威时间 | 计算本地时钟偏移和倒计时；不得直接以设备时间决定价格是否有效 |

`promotion.starts_at` 包含在有效区间内，`promotion.ends_at` 不包含在有效区间内，即精确遵守 `[start, end)`。列表中的活动信息是展示快照，不是创建订单的价格授权。

## 5. UI 行为

1. 套餐卡、条款弹层和下单确认始终以商品 `amount_fen` 显示应付金额。
2. `list_amount_fen` 继续表达商品标价；`base_amount_fen` 表达日常售价。活动期需要划线展示日常价时使用 `base_amount_fen`，商品原有标价展示仍按既有产品语义使用 `list_amount_fen`，不要混成一个字段。
3. `promotion.badge_text`、`title`、`summary`、`rules_text` 和倒计时均可选。`promotion === null` 时页面必须能正常购买，不保留过期活动文案。
4. 客户端不得用 `base_amount_fen * price_rate_basis_points / 10000` 重算，不得向订单 request 增加 campaign price、promotion ID 或 promotion version。
5. 页面首次进入、每次 `onShow`（包括从后台返回）以及下单确认前重新调用商品列表；刷新结果才是新的展示和确认依据。
6. 收到 active `promotion` 时，记录 `server_time` 与设备当前时间的偏移，以校准展示倒计时，并在页面仍可见时按已知 `ends_at` 安排一次到期刷新；页面进入后台后取消或忽略该定时任务，返回时依靠 `onShow` 刷新。
7. scheduled 活动返回 `promotion: null`，客户端不知道未来 `starts_at`；提前 stop 也没有推送或订阅通知。因此客户端不能在前台精确感知活动开始或提前停止，只能在下一次页面进入、`onShow`、下单前刷新或其他主动刷新时发现变化。若产品决定增加轮询，只能在页面可见期间按产品策略设置间隔；轮询不是接口必需能力，也不能宣称精确实时。
8. 下单前刷新后，以最新所选商品的 `amount_fen` 展示确认。创建订单后立即用 create response 的 `order.amount_fen` 和返回 `product` 快照替换列表展示值；这是该订单的最终冻结金额。若创建响应金额与提交前展示不同，应在调起微信支付前让用户看到并确认冻结金额，不得在客户端重算。
9. 活动结束或停止不会改写已创建订单。活动期创建的 pending 订单继续显示和支付冻结的 `order.amount_fen`；继续支付、支付窗口过期、关闭或更换套餐均沿用现有订单逻辑和 `available_actions`，不得按最新商品价重算。

## 6. 创建订单与调用顺序

创建订单继续使用现有接口和 request：

```http
POST /billing/service-orders
Authorization: Bearer <现有租户会话 token>
Content-Type: application/json

{
  "product_code": "platform_service_1y",
  "terms_version": 1,
  "terms_accepted": true,
  "idempotency_key": "<client-generated-uuid>"
}
```

若从试用转正式服务，继续按现有逻辑可选提交 `source_trial_id`。请求中没有金额、折扣率、活动 ID、活动版本、OpenID 或支付签名字段。

推荐调用顺序：

1. 用现有会话恢复流程确保 employee session 就绪。
2. 页面首次进入或 `onShow` 时调用 `GET /billing/service-products?page=1&pageSize=20`，保存 `server_time` 校准值并展示 `amount_fen`。
3. 用户选择套餐并查看当前条款；进入最终下单确认前再次拉取商品，使用刷新后的 `amount_fen` 和条款版本让用户确认。
4. 生成一次 `idempotency_key` 后调用现有 `POST /billing/service-orders`。网络结果不确定时复用同一个 key 和完全相同的业务意图；后端返回同一订单并以 `idempotent: true` 标识幂等命中。
5. 以后端 create response 的 `order.amount_fen`、返回 `product` 快照和 `payment_request` 为准。活动在此后结束也不重算该订单。
6. 调起现有微信支付；客户端支付完成后仍按现有轮询/刷新订单详情判断后端支付状态。
7. pending 订单的继续支付继续调用现有 `/billing/service-orders/:id/payment-request`，金额取订单快照；是否可继续以 `available_actions.continue_payment` 和现有支付过期逻辑为准。

## 7. 失败与恢复

| 场景 | 客户端处理 |
| --- | --- |
| `401` | 走 Orange 现有会话恢复/静默登录流程；恢复后重新拉商品。不要记录或回传 token |
| 商品分页或网络失败 | GET 可按现有策略重试；保持加载/失败态，不把上次展示缓存当成权威价格 |
| 创建订单网络结果不确定 | 使用同一个 `idempotency_key` 重试同一 request，接受返回的同一订单；不得生成新 key 造成重复订单 |
| `409 SERVICE_TERMS_VERSION_STALE` | 清除条款确认，刷新商品和条款，让用户重新确认后再提交；Orange 现有 hook 已有该分支 |
| `404 SERVICE_PRODUCT_NOT_FOUND` | 商品已停用或不存在；刷新套餐列表、清除当前选择并提示重新选择 |
| 活动被提前 stop | 接口无推送；在下一次页面进入、`onShow`、下单前刷新或可选的页面可见期轮询时发现，并恢复后端返回的日常价和 `promotion: null` |
| 活动到达 exact end | 对已知 active 活动可按校准后的 `ends_at` 安排一次到期刷新；若页面不在前台，则在下次 `onShow` 刷新后恢复日常价 |
| 活动到达 exact start | scheduled 响应没有未来 `starts_at`，不能自动安排精确开始刷新；在边界后的下一次主动刷新或重新进入页面后获取活动价 |
| 创建成功后活动结束 | 使用 create response / order snapshot 的冻结金额，不重建、不改价 |
| pending 订单到支付窗口结束 | 沿用现有 `available_actions`、订单刷新、关闭/更换套餐逻辑；不要把活动结束误当成订单过期 |

本地持久化可以保存页面恢复所需数据，但商品展示价格和活动状态只能作为临时缓存；页面首次进入、`onShow`/后台返回和每次下单确认前必须刷新，不能把缓存价格当成权威事实。

## 8. 验收矩阵

以下场景需同时覆盖 `platform_service_1y`、`platform_service_2y`、`platform_service_3y`，确认三档套餐的 `amount_fen`、活动展示和下单快照规则一致：

| 场景 | 预期 |
| --- | --- |
| 无活动 | `promotion === null`；`amount_fen === effective_amount_fen === base_amount_fen`；仍可购买 |
| scheduled | 活动尚未到 `[start, end)`；商品返回日常价、`promotion === null`，客户端拿不到未来 `starts_at` |
| exact start | 在边界后主动刷新或重新进入页面，验证后端返回活动 `amount_fen`；不要求客户端无信息地精确实时发现 |
| exact end | 在边界后执行已安排的 active 到期刷新，或重新进入页面后刷新，验证恢复日常价和 `promotion: null` |
| stopped | 提前停止后主动刷新、触发 `onShow` 或重新进入页面，验证恢复日常价并清掉 badge、规则和倒计时；不要求无推送实时发现 |
| `401` | 现有会话恢复成功后重新拉商品；失败时进入登录/无权限提示，不泄露凭证 |
| stale terms `409` | 清除确认，刷新产品和条款，用户重新确认后才能下单 |
| idempotent retry | 网络结果不确定时同 key 重试，接受同一 order；不产生第二张订单 |
| 活动期创建 pending，之后活动到期 | 商品列表恢复日常价，但原 pending 订单继续显示和支付冻结的活动金额；订单过期/继续支付仍走现有逻辑 |
| 创建跨活动边界 | create response / order snapshot 覆盖提交前展示；支付前显示最终冻结金额，不做客户端折扣计算 |
| 旧客户端 | 只读取 `amount_fen` 仍能得到正确应付价并用原 request 创建订单 |
| 真机 | 首次进入、前后台切换和下单前会刷新；active 倒计时按 `server_time` 校准；微信支付和订单轮询使用订单冻结金额 |

## 9. 安全回传

联调或缺陷回传不得包含 token、支付签名、`payment_request` 的任何字段、OpenID、用户信息、完整订单号、订单 ID 或其他订单敏感信息。允许回传的最小信息为：

- 脱敏后的活动 ID、活动版本 ID、活动 `version`、展示状态和时间；
- HTTP 状态、稳定错误码和 Request-ID；
- 脱敏订单号，例如 `TSO2026****ABCD`；
- 三档套餐 code、非敏感金额字段及 `promotion` 是否为空。

商品列表响应本身不提供活动 `status` 字段；如联调记录 scheduled/active/stopped/ended，这是测试场景或管理端状态标签，不要给客户端响应虚构 `promotion.status`。

## 10. 发布 gate

- [ ] 将 `20260916170000_create_platform_service_promotions.sql` 应用到 dev，并用 `supabase migration list` 确认 Local/Remote 对齐。
- [ ] 在 dev 分别验证无活动、scheduled，以及 exact start、exact end、stopped 后主动刷新/重新进入页面时的三档套餐价格。
- [ ] Orange 按第 2 节完成客户端类型、页面、刷新和测试适配。
- [ ] 完成开发版真机前后台切换、倒计时、会话恢复和 stale terms 验收。
- [ ] 完成至少一笔受控真实支付，核对创建响应、订单详情和继续支付均使用同一冻结金额，并按第 9 节只留脱敏证据。

上述 gate 当前均未在本任务中执行或验证，不能据本文宣布 dev 已部署、真机已通过或真实支付已完成。
