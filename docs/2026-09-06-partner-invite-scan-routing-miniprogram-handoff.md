# 城市合伙人专属码：扫码入驻路由修复交接

日期：2026-09-06。接收方：orange 微信小程序团队；配合方：gooes 后端团队。

本次仅在 gooes 落交接文档，没有修改 orange、后端代码、生产配置或业务数据，没有提交、推送或发布修复。本文是修复要求与核查证据，不是上线完成记录。

## 1. 要解决什么

用户扫描城市合伙人专属小程序码，应保留邀请码并进入“服务商申请”流程；不能因为已有游客或员工会话而只进入默认首页，也不能把“申请一家新服务商”默认为“给当前员工所属公司绑定合伙人”。

已收到两组现场反馈：

- 游客微信扫码后停在“访客首页”，没有进入入驻申请页。
- 已登录员工微信（反馈账号尾号 5725）扫码后进入员工首页。
- 18:25 的游客 vConsole 截图显示 `authState=platform_visitor_ready`、`hasToken=true`、`sessionRestoreSource=storage`、`willAttachAuthorization=true`，以及访客首页 `onShow/onRouteDone/onReady`。

日志仅证明客户端恢复了游客会话并展示访客首页，不证明 token 已通过服务端验证、邀请码被成功识别或某次跳转失败。截图选中 Info，不能据此认定没有 Warn/Error。页面定位失败提示也不能直接认定为本次扫码失败的根因。

## 2. 已确认代码问题与证据边界

核对基线：gooes `c92ee54b`，orange HEAD `1e8d763`。orange 有现存工作区改动，以下依据当时实际读取的源文件，不等于确认了真机正在运行的发布包版本。

### 2.1 扫码导航与访客入口转发没有统一协调

- [orange app.ts](../../orange/src/app.ts)：`capturePartnerInviteCode` 保存邀请码，然后 `setTimeout(..., 0)` 调用 `navigateTo` 打开入驻页；`useLaunch` 和 `useDidShow` 都会调用它，没有同一扫码事件的导航去重。
- [访客入口](../../orange/src/pages/visitor/index.tsx)：固定调用 `useSubpackageRedirect`，目标是 `/packageVisitor/pages/visitor-home/index`。
- [分包转发 hook](../../orange/src/utils/hooks/useSubpackageRedirect.ts)：在 `useLoad` 中无条件 `redirectTo`；会透传 query，但不依据邀请码改变目标。
- [访客首页](../../orange/src/packageVisitor/pages/visitor-home/index.tsx)：没有继续消费 `pendingPartnerInviteCode` 的逻辑。

因此，即便邀请码已识别并保存，仍有入驻页导航与访客首页转发竞争；参数透传不等于目标页执行了邀请码路由。

### 2.2 默认身份导航没有优先处理扫码意图

访客首页调用 `AuthService.ensureSessionReady('visitor:home')`，非游客结果会进入 `dispatchByAuthMode`。已有会话可直接被恢复，不会因为调用处写着 visitor 就自动切换为游客。

[auth_navigation.ts](../../orange/src/services/auth_navigation.ts) 中：

- 员工：等待 `bindPendingPartnerInviteCodeForTenant()`，再进入员工导航。
- 客户：校验客户资料后进入客户导航。
- 合伙人：直接 `reLaunch` 合伙人看板。

这些分支都没有优先保留“本次扫码要申请服务商”的目标。

### 2.3 员工路径存在归因副作用

[partner_onboarding_binding.ts](../../orange/src/services/partner_onboarding_binding.ts) 在员工有租户上下文且存在待处理邀请码时，调用 `POST /partner-onboarding/tenant-binding`，成功后清除待处理码。

这属于“绑定现有租户”，不是“提交新服务商申请”。目前没有查询该员工所属租户的实际绑定记录，不能声称本次已经发生绑定，更不能直接解绑。后端团队应先只读核对绑定记录、时间和来源；任何纠正归属需单独确认。

### 2.4 当前邀请码表单仍走旧入驻提交

[useTenantOnboardingController.ts](../../orange/src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingController.ts) 中，`local_services` 分支调用新申请接口，邀请码分支仍调用 `PartnerOnboardingService.createTenantApplication`，并设置旧的入驻成功状态。

因此，“正确打开页面”和“提交后进入平台审核”需要分别验收。不能只改文案、直接给 URL 加 `source=local_services` 或只把旧 URL 换成新 URL：这会丢失邀请码归因或缺少新接口的申请资料及身份上下文。

### 2.5 已做验证与尚缺证据

已从 orange 实际源文件读取、在 gooes 的隔离内存环境执行扫码捕获和身份导航函数，模拟导航、认证等依赖，不访问网络、不运行 orange 构建、不修改其文件：

- 员工、customer、customer_portal、合伙人四种模式：扫码导航之后，默认身份导航仍会发出；员工分支会调用模拟绑定函数。
- 同时模拟 launch/show：同一个码排入两次入驻导航。
- 调换访客入口回调与 App 定时回调的执行顺序，可得到“最后请求打开访客首页”或“最后请求打开入驻页”两种导航序列；邀请码都已保存。

这验证了代码层缺少协调与去重，不是真机生命周期、导航完成顺序或微信底层行为的复现。游客本次现场究竟是导航竞争、邀请码未解析、包版本不符，还是其他原因，仍须结合实际参数及完整日志确认。

## 3. 后端生成码契约与环境核对

[platform-partner-invite-qrcode.ts](../apps/api/src/services/platform-partner-invite-qrcode.ts) 读取：

- `WECHAT_PARTNER_ONBOARDING_PAGE`：代码默认 `pages/visitor/index`。
- `WECHAT_MINIPROGRAM_ENV_VERSION`：代码默认 `release`。
- `WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH`：代码默认 true。

[邀请码工具](../apps/api/src/services/platform-partner-invite-code-utils.ts) 将规范化邀请码本身放入 scene，示例 `CP-REPRO123`，不是 `scene=partner-onboarding`。小程序码 scene 最长 32 字符；以现有后端生成函数校验为准。orange 当前支持直接参数 `partnerInviteCode/invite_code/inviteCode`，或 `query.scene` 中的原始/URL 编码 `CP-...` 码。

生产以上配置实际值、问题二维码的生成时间和目标包版本尚未核对。后端配合读取非敏感配置；不能把代码默认值写成生产事实。若变更二维码目标页，须先验证该页面已在目标版本发布，并检查新码和存量码；不能假设改配置会重写已保存或已分发图片。

## 4. 小程序团队修复范围

### A. 先统一扫码导航

现有可复用目标为 `/packageVisitor/pages/tenant-onboarding/index?code=CP-REPRO123`（合成邀请码示例）。该页仍须完成 C 节的新申请适配；进入这个 URL 本身不代表平台审核链路已对齐。

1. 复用现有邀请码解析，记录待处理的“申请服务商”意图。识别原始 scene、URL 编码 scene 和已支持的直接参数；无效码给出明确提示。
2. App 生命周期、访客壳页、默认身份分流共用同一个路由决策。有效扫码意图优先于默认首页；不能三个位置各自导航。
3. 同一扫码冷启动的 launch/show 只消费一次导航；热启动扫描同码不叠加页面，扫描新码能更新目标。禁止仅凭一个永久布尔锁阻断以后的扫码。
4. 到达并确认目标页接收邀请码后标记路由已消费；导航失败仍可重试。路由消费与提交成功后清理业务邀请码是两件事。
5. 有邀请码但缺少定位时，完成服务区域选择后回到同一申请流程，不丢码、不永久停在游客首页。不能把合伙人运营区县直接伪造成访客定位上下文或用户确认的服务区域。
6. 正常非扫码启动、公司分享码 `share_token`、员工工作台、客户首页和合伙人看板行为保持不变。

### B. 区分申请与现有租户绑定

- 扫码申请流程不得自动调用 `bindPendingPartnerInviteCodeForTenant` 给当前公司归因；不要全局删除其他已确认归因场景，需按本次扫码意图区分。
- 已登录员工、客户或合伙人应看到明确的申请入口/身份提示，不直接回首页。新申请 API 需要 visitor session，不能拿员工 token 强行提交，也不能伪造 visitor_id 或扩大后端权限。
- orange 已有 `AuthIdentityService.switchToVisitor()`（`POST /auth/switch/visitor`）。复用身份切换流程前先核对适用身份及会话更新逻辑；对用户说明将以访客身份申请并确认，再切换、清理身份相关业务缓存，并在同一微信身份下保留本次扫码意图继续流程。
- 不静默清空或替换用户正在使用的员工身份。确认切换前取消可返回原页面；若已经切到访客，返回员工业务必须通过现有身份恢复/切换流程，不能直接携带访客 token 回到员工页。主动换账号、解绑或切换微信身份时清除旧意图，不把上一个账号的申请或迟到响应带入新会话。
- `select_tenant` 等中间状态能否直接调用访客切换接口尚未验证；若不支持，应保留扫码意图并完成系统已有的身份选择/登录步骤，不能猜测接口能力。

### C. 对齐平台审核申请契约

业务目标是“提交资料 → 平台审核 → 审核通过后创建服务商”，不是旧直接开通。复用现有新申请表单能力，邀请码分支必须保留 `source_channel=partner_invite` 与 `invite_code`。

| 用途 | 接口与认证 | 关键约束 |
|---|---|---|
| 解析邀请码 | `GET /partner-onboarding/invite-codes/:code`，公开接口 | 返回 `data.invite_code/partner/onboarding`；无效、过期或合伙人不可用时展示错误，不能静默跳首页 |
| 切换访客 | `POST /auth/switch/visitor`，当前合法会话 | 由现有身份模块更新会话后再请求访客接口；不输出 token |
| 读取服务区域 | `GET /visitor/location-context`，visitor Bearer | 缺有效上下文时引导选区并保留申请意图 |
| 申请验证码 | `POST /tenant-onboarding/applications/send-code`，visitor Bearer | 请求 `{phone}`；发送有频率限制，不自动重复发送 |
| 提交申请 | `POST /tenant-onboarding/applications`，visitor Bearer | 请求头 `Idempotency-Key` 必填，最长 120 字符；成功 HTTP 202，业务数据在 `data` |
| 我的申请 | `GET /tenant-onboarding/applications/mine`，visitor Bearer | `page=1&pageSize=20`，pageSize 最大 100 |
| 申请详情 | `GET /tenant-onboarding/applications/:id`，visitor Bearer | 按当前访客归属读取，不跨身份复用缓存 |

新提交体必须按 [后端 schema](../apps/api/src/schema/tenant-onboarding.ts) 和 orange `TenantOnboardingApplicationInput` 组装，包括企业名称、统一社会信用代码、私有营业执照 file ID、管理员姓名/手机号/验证码、`visitor_context_id`、公司地址、服务区县、隐私及入驻条款版本与同意标记。邀请码来源额外提交 `source_channel=partner_invite`、`invite_code`；普通本地服务来源不能携带邀请码。不得由小程序传 tenant_id 或 partner_id 决定归属。

字段与完整上传/申请示例复用 [已有服务商联调文档](./miniprogram/2026-07-15-local-service-provider-onboarding-handoff.md) 和 [完整业务交接](./2026-07-14-local-service-provider-onboarding-miniprogram-handoff.md)。本次不另造协议。

同一提交结果未知时保留相同请求体和幂等键，使用现有错误码规则处理；明确成功后只刷新/进入进度页，不重复 POST。HTTP 202 只表示申请已提交，不展示“已开通”。401/403 不绕过身份或权限；码失效、归属冲突、资料校验失败等显示明确原因，保留可恢复输入。

旧 `/partner-onboarding/tenant-applications*` 是兼容链路，不是新平台审核流程的替代接口。本次不要删除后端旧接口；客户端迁移应独立验证完整资料、身份与返回结构。

## 5. 建议检查/修改文件

以下路径均相对 orange，需由小程序团队在自己的任务中修改：

- `src/app.ts`、`src/utils/partner_invite_code.ts`：提取统一解析及扫码意图处理、去重。
- `src/pages/visitor/index.tsx`、`src/utils/hooks/useSubpackageRedirect.ts`：入口决策协调；通用 hook 的其他调用方不可受影响。
- `src/packageVisitor/pages/visitor-home/index.tsx`、`src/services/auth_navigation.ts`：默认首页分流尊重扫码意图。
- `src/services/partner_onboarding_binding.ts`：隔离现有公司归因与新申请。
- `src/store/auth.ts`、`src/services/auth_identity.ts`、现有身份切换页面：意图与会话生命周期。
- `src/packageVisitor/pages/tenant-onboarding/hooks/useTenantOnboardingController.ts` 及相邻表单/导航/幂等模块、`src/services/tenant_onboarding.ts`：新申请契约与进度闭环。

不要求新增框架或依赖，不通过增加固定延迟、吞掉导航异常、清空所有登录缓存来掩盖竞争。

## 6. 验收与生产检查清单

先跑 orange 现有最小静态检查和定向测试，再做微信构建及真机验证。不要在 gooes 任务中代执行会改写 orange 的命令。

| 场景 | 必须观察到的结果 |
|---|---|
| 游客冷启动扫码 | 只进入一次申请流程；不被访客分包转发覆盖 |
| 已打开小程序后扫码 | 从其他页面进入申请流程；同码无叠页，新码能重新进入 |
| 已登录员工扫码 | 明确进入申请/身份确认流程，不直接跳工作台、不自动绑定现有公司 |
| 客户、合伙人、选租户身份扫码 | 申请意图不丢失；必要身份确认后继续；不伪造会话 |
| 有效 scene / 编码 scene / 直接参数 | 解析到同一个邀请码，并由目标页确认接收 |
| 缺失、无效、过期码 | 无码走普通入口；无效邀请有明确错误，不冒充申请成功 |
| 定位失败、未选区 | 可选区后继续同一申请，保留邀请码 |
| 导航失败/网络慢/切后台 | 可重试，无重复跳转、无重复提交、迟到响应不覆盖新意图 |
| 正常启动与 share_token 公司分享 | 既有身份首页与分享流程不受影响 |
| 新邀请码申请提交 | visitor session、partner_invite 与邀请码齐全，HTTP 202 后显示待审核进度 |
| 重复点击/提交超时 | 复用同一提交意图与幂等键，无重复申请 |
| 取消/账号切换/不同微信身份 | 不残留旧身份申请上下文，不执行隐式公司绑定 |
| 新码及存量码、release/trial | 分别记录实际 landing path、包版本、scene 解析及最终目标 |

真机日志仅保留必要字段：入口 path、scene 是否存在/是否解析成功、authMode、扫码意图阶段、导航来源/目标/结果、脱敏 requestId。不要打印 token、Cookie、短信码、完整客户信息或上传签名 URL；区分生命周期的数值 scene 与二维码 `query.scene`。游客现场需查看 All/Warn/Error，而不只是 Info。

后端配合项：只读确认生产码配置和邀请码可用性；只读确认反馈员工的现有租户是否被绑定及时间来源。查到异常也不在本次文档任务中直接解绑、调整归属或变更生产配置。

知识库查询本次返回 502，文档以仓库源码和用户截图为依据；没有上传知识库。完成修复后应补记录小程序提交/包版本、目标环境、真机日志及验收结果，才能宣称问题解决。

## 7. 可直接发给小程序团队

> 请按《2026-09-06-partner-invite-scan-routing-miniprogram-handoff.md》修复城市合伙人专属码扫码入驻。现场有两种表现：游客扫码留在访客首页，已登录员工扫码进入员工首页。代码核查发现 App 扫码导航、访客分包转发和身份默认导航没有统一协调，launch/show 还可能重复跳转；员工路径另有自动绑定当前公司的副作用。请先核对实际二维码参数及真机导航日志，再统一为“有效邀请码优先进入服务商申请”，去重且不丢码、不自动绑定现有公司。申请提交要走 visitor 身份的新平台审核接口，保留 partner_invite + invite_code；必要身份切换先向用户确认。请覆盖游客/员工冷启动、热启动、无定位、无效码及正常首页回归，并提供真机证据。文档只是交接，尚未修复或发布；生产配置和任何归属变更需另行确认。
