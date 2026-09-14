# 客户私有图片上传：生产配置与双端真机验收门禁

日期：2026-09-13。本文只记录脱敏、可复查的检查结果；**上传端到端与双端真机尚未验收**，不代表开放 AI 生图。未上传家庭照片、未记录会话、签名 URL、密钥或私有对象路径。

## 当前证据

| 门禁 | 检查结果 | 结论 |
| --- | --- | --- |
| 生产后端 | GitHub migration run `34750922886`、deploy run `34751197781`、独立 verify run `34751406801` 均为 success，目标 SHA 均为 `aea829524365ae4862ff6b91601adeee9d6a0f53`。生产无会话 POST 微信、抖音各自的 `/renderings/uploads:intent` 均返回 401。 | 只能证明已发布、未匿名开放；没有证明有效会话、COS 或图片链路。 |
| 后端本地合同 | `apps/api` 私有上传相关 6 个测试文件：65 pass、0 fail。 | 替身/注入测试，不是生产 COS smoke。 |
| 抖音本地代码 | `apps/douyin-mini` `bun run check`：360 pass、0 fail，TypeScript `--noEmit` 通过。上传改动仍为 main 工作区未提交文件；工程 AppID 为 `tt0d647bd99301341b01`。 | 不能当作体验版或正式版已发布。 |
| 微信当前代码（只读） | `orange/src/services/visitor_rendering_uploads.ts`、`src/packageVisitor/pages/rendering-upload/` 和 `src/app.config.ts` 已有私有上传 service、页面和路由；orange 工作区未改动。 | 此处只核对代码存在，不宣称微信体验版、真机或生产已通过。先前交接文档“微信尚未接入”的快照已过时。 |
| 微信不确定 PUT 恢复（只读发现） | `orange/src/packageVisitor/pages/rendering-upload/index.tsx:77-93` 依次 create intent、await PUT、complete；`src/services/visitor_rendering_uploads.ts:117-149` 把网络异常归为 COS 失败。PUT 未返回成功时页面不会用同一 intent 调 complete，重新提交会新建 intent。房间照成功而可选户型图失败后，再次提交也会为房间照新建 intent。 | 与上传合同的“PUT 结果未知时用同一 ID complete 核实、禁止盲目覆盖/无限重发”不一致，属于微信团队在真机验收前需修复的客户端恢复问题；本轮严格未修改 orange。 |
| 抖音选图隐私 | 在开放平台切到与本地工程一致的 AppID 后，基础设置弹出“检测到你的小程序未进行隐私协议配置”。此前同参数 `tt.chooseImage` 返回 `api scope is not declared in the privacy agreement`，发生在 intent 前。 | 配置问题已定位；应用所有者须据实声明相册用途、审阅并生成隐私协议，然后重新真机验证。此处没有接受协议或更改平台设置。 |
| 抖音 request 域名 | 开发者工具 4.5.5 工程详情：域名校验未关闭；request 合法域名仅 `api-dev.goodcms.cn`，没有 COS；本地开发配置对应 COS host 为 `windwill-1259348056.cos.ap-nanjing.myqcloud.com`。 | 开发模板的签名 COS PUT 尚不能通过合法域名验收。这里的 host 来自本地开发配置，不足以证明生产 COS bucket/region。 |
| 本地开发配置指向的 COS 桶 | 使用项目已安装 COS SDK 2.15.4 和本地现有凭据只读调用 `getBucketAcl/getBucketCors/getBucketPolicy`：桶 ACL `private`；CORS 1 条规则含 PUT、允许请求头 `*`，来源含 `https://servicewechat.com` 和 `https://servicewechat.weixin.qq.com`，未列抖音来源；bucket policy 查询 404（无可读取策略）。另以 OPTIONS 预检：微信 `https://servicewechat.com`、PUT 及四个请求头返回 200 与相应 Access-Control-Allow-*；模拟抖音来源 `https://tmaservice.developer.toutiao.com` 返回 403。未输出凭据或策略正文。 | 仅证明**本地配置指向的桶**当前设置。抖音原生 `tt.request` 是否发送该 Origin 尚未真机观察，不能单凭模拟 OPTIONS 宣称其必失败；也不证明生产实际指向同一桶或私有对象匿名不可读。 |
| 生产 COS | 未取得生产 bucket policy、对象 ACL/策略冲突、CORS 及合法域名的权威读数；未以有效客户会话取得生产上传意图。 | 未验证私有性、预检、必传头、禁止覆盖和完整 PUT。不能开放给真实客户。 |
| 真机 | 抖音 iOS/Android、微信 iOS/Android 的端到端 `intent → 原始字节 PUT → complete` 均缺脱敏现场证据。 | 不可用模拟器、静态检查或成功发布代替。 |

抖音使用 `tt.request` 发送原始 `ArrayBuffer`，因此 COS 主机应放在 **request** 合法域名，不是 upload 域名；开发者工具关闭“跳过域名校验”才有验收意义。依据：[抖音网络说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/network/network)、[抖音隐私协议配置](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/basic-capacities/privacy-agreement)。COS 的 CORS 需要明确允许所用方法和请求头；仅把主机加入平台白名单不能替代服务端存储策略与真机请求验证。依据：[腾讯云 CORS 文档](https://cloud.tencent.com/document/product/436/13318)。

## 继续执行顺序与验收记录

1. **先确定目标 AppID/环境。** 本地 gooes 工程是模板 AppID `tt0d647bd99301341b01`，浏览器中另有已上线“好店智装云” AppID `ttd033a68e4e56ccd301`。不得把一个应用的隐私协议或域名配置当成另一个应用的验收。核对目标体验版的 AppID、API 环境、签名 URL 的 COS host，生产值须从生产配置/真实意图读取，不以本地 `.env` 推断。
2. **应用所有者完成平台设置。** 对目标 AppID，据实声明相册/必要时相机的隐私用途，审阅并生成协议；将实际 COS host 加入 request 合法域名。不要关闭隐私或域名校验绕过；完成后重新读取平台生效状态。
3. **只读核对 COS 安全配置。** 逐项查看 bucket/object ACL 与 bucket policy、`private/customer-rendering-inputs/` 前缀的匿名读取边界、CORS 允许源/PUT/`Content-Type`、`Content-Length`、`x-cos-acl`、`x-cos-forbid-overwrite`，以及禁止覆盖和旧位置访问。对象声明 `private` 不替代策略核查；若存在匿名读策略，要实际以无签名请求验证私有对象不可读。
4. **双端各在 iOS/Android 真机验收。** 用非家庭合成静态 JPEG/PNG/WebP 和真实会话、测试装修公司：合法 `intent` 200、原始字节 PUT 成功、`complete` 返回 `pending_review`；记录 request host、HTTP 状态、四个必传头是否到达、传输字节数是否精确、无业务 Bearer/非 multipart、对象无签名不可读。复核 401、微信未选公司 409、422、处理中同 ID 重试和 complete 重放同 file_id；只记录脱敏状态与布尔结果。
5. **关闭生图入口。** `pending_review` 不是审核通过。即使上传通过，在内容审核、原子频控、任务/预算、方舟 Worker 和私有结果链路完成前，不能开启 AI 生成。

当前 repo 可写范围为 gooes；微信代码由 orange 团队独立修改、构建和发布。本轮未修改 orange、云平台设置或生产数据。

**微信团队交接补充：** 在 `orange/src/packageVisitor/pages/rendering-upload/index.tsx` 保留每个 purpose 的待确认 intent ID 与已确认 `file_id`；PUT 返回不确定时先用同 ID complete 核实，处理中只退避重试 complete，明确不存在/过期时才重新选图并签发新 intent。可选户型图失败不能导致已确认房间照重复上传。用模拟“PUT 实际落桶但客户端超时”“房间照已确认、户型图失败”“离页返回继续确认”覆盖状态恢复，之后再做真机测试。具体请求/响应和错误码仍以[上传接口合同](../../integration/customer-rendering-private-inputs-api.md)为准。
