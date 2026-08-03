# 抖音装修小程序开发环境全链路联调设计

**日期：** 2026-07-20

**状态：** 已确认，待实施计划

**范围：** Gooes 开发 API、原生抖音小程序、抖音服务商回调、模板开发安装、测试商户授权、短信留资、模板上传与测试二维码

## 1. 背景与目标

装修行业原生抖音小程序模板、第三方小程序授权服务、租户内容、营销留资和单商户发布接口已经在
`feature/douyin-decoration-miniapp` 分支实现。开发数据库的抖音 migration 已对齐，但当前外部开发环境尚未形成可验证的真实链路。

本轮目标是在不提交审核、不正式发布的前提下，完成以下真实闭环：

```text
服务商加密 Ticket
  -> 组件凭证
  -> 模板开发安装
  -> tt.login / Gooes 会话
  -> 装企内容与营销事件
  -> 测试商户授权和租户绑定
  -> 短信验证与直属线索
  -> 模板库代码提交到测试商户
  -> 测试版二维码与真机验收
```

本设计不以“接口能返回 200”代替全链路完成；每个外部步骤都要有可追溯但不含敏感值的证据。

## 2. 当前状态与缺口

### 2.1 已具备

- `apps/douyin-mini` 已包含原生 TypeScript、TTML、TTSS 页面、登录、Bootstrap、内容、短信、留资和事件客户端。
- Gooes API 已实现普通小程序会话/内容/营销接口、服务商回调、安装管理和单商户发布接口。
- 开发数据库已有可用装修公司、服务商资料、服务区域、公开案例和公开工地。
- 开发数据库已包含抖音基础、营销、授权事件、安装管理和发布相关 migration。
- 运维手册与 Smoke 清单已经定义凭证、租户隔离、发布状态和安全边界。

### 2.2 阻断缺口

1. `apps/douyin-mini/src/config/index.ts` 当前固定请求生产地址 `https://api.goodcms.cn`，开发版不能安全联调。
2. `https://api-dev.goodcms.cn` 尚未运行本分支的抖音 API；探测回调和会话入口仍由普通鉴权返回 401。
3. 开发数据库没有 `douyin_third_party_components` 组件记录；现有数据库 RPC 支持在首个 Ticket 事件申领时幂等建立组件，但服务层在进入 RPC 前提前要求组件存在，尚未形成启动闭环。
4. 开发数据库没有模板开发安装，也没有已授权测试商户安装。
5. 服务商控制台中的回调、模板小程序、授权测试小程序和模板库状态仍需在已登录会话中核验。
6. 真短信闭环需要专用测试手机号及可读取验证码的测试人员。

## 3. 方案比较

### 3.1 采用：分阶段真实联调

先完成静态门禁和开发环境隔离，再依次打通部署、Ticket、模板开发安装、测试商户授权、营销留资和模板测试版本。每一阶段只有在前一阶段证据通过后才继续。

优点：故障定位边界清楚；真实覆盖抖音身份、加密回调和模板交付；可复用现有 Smoke 清单；不会把生产域名或正式发布混入开发验证。

### 3.2 未采用：仅接口脚本联调

接口脚本适合验证 Gooes 契约，但不能证明真实 `tt.login`、开放平台 Ticket、商户授权、模板上传和真机行为，不能作为本轮完成标准。

### 3.3 未采用：IDE 优先的纯人工联调

直接从 IDE 开始会把 API 部署、环境路由、组件注册、租户数据和客户端问题混在一起，证据不稳定，也不利于后续模板升级复测。

## 4. 关键设计决策

### 4.1 术语与测试对象映射

本文统一使用以下术语：`development` 为抖音测试版运行环境，`preview` 为 IDE/扫码预览环境，`production` 为线上版运行环境；“测试版本”特指商户 AppID 下由 upload 产生、尚未提审的代码版本；“测试二维码”特指该商户测试版本的体验二维码。

进入真实联调前必须登记以下对象，只记录 AppID 尾号，不在文档中记录 secret：

| 角色 | AppID / 安装类型 | 租户 | deployment key | 用途 |
| --- | --- | --- | --- | --- |
| 第三方组件 | Component AppID | 不绑定租户 | 不适用 | Ticket、组件 token、商户授权 |
| 模板开发小程序 | Template AppID / `template_development` | 隔离测试租户 | 无 | IDE 预览、普通 code2session、隔离租户内容/留资 |
| 授权测试商户 | Authorizer AppID / `merchant` | 主测试租户 | 服务端生成且唯一 | 授权 code2session、主租户内容/留资、模板 upload/test-qr |

两个租户都必须是明确获批、没有真实客户影响的开发测试租户，并具有可区分的品牌、案例和工地。不能仅因租户状态为 active 就使用；执行记录要包含 tenant UUID、允许产生的数据类型、测试数据前缀和清理/保留策略。

模板开发会话不使用 deployment key。服务端以请求中的 AppID 查询 `authorizer_appid` 唯一约束命中的安装，再要求它同时满足配置中的 Template AppID、`template_development` 类型和 active 状态；模板 code2session 使用 Template AppID 与服务端 Template AppSecret。创建 RPC 对同一 Template AppID 幂等，任何既有安装的组件、租户、类型或状态冲突都失败关闭，因此同一 Template AppID 不能同时解析到多个可用安装。

### 4.2 小程序 API 环境路由

小程序使用 `tt.getEnvInfoSync().microapp.envType` 选择固定 API Origin：

| 抖音环境 | API Origin |
| --- | --- |
| `development` | `https://api-dev.goodcms.cn` |
| `preview` | `https://api-dev.goodcms.cn` |
| `production` | `https://api.goodcms.cn` |

抖音官方把上述值分别定义为测试版、预览版和线上版：
<https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/foundation/env/get-env-info-sync>

实现遵循以下边界：

- 未识别环境、缺少环境信息或不支持 `getEnvInfoSync` 时失败关闭，不默认访问生产 API。
- API Origin 不从启动参数、`ext.json`、租户配置或远端响应读取。
- `deployment_key` 继续是商户实例标识，只允许来自服务端生成的商户构建扩展配置。
- `envType` 只决定网络环境，不参与租户或身份鉴权。

### 4.3 首个组件由可信 Ticket 建立

当前服务先要求组件记录存在，再处理 Ticket，导致空环境无法启动。新行为只对首个合法 Ticket 开放组件建立能力：

1. 校验回调时间窗口。
2. 使用服务端配置的消息 Token 校验签名。
3. 使用 EncodingAESKey 解密消息。
4. 校验解密结果属于配置中的 Component AppID。
5. 仅当事件是包含 Ticket 的 `PUSH` 时，跳过服务层的预注册查询，进入现有 `claim_douyin_authorization_event` RPC。
6. RPC 使用 `INSERT ... ON CONFLICT DO NOTHING` 幂等建立当前 Component AppID，再检查状态；若已有记录为 disabled，拒绝处理且不得自动启用。
7. 通过现有授权事件账本和凭证信封逻辑加密保存 Ticket，返回纯文本 `success`。

普通 `AUTHORIZED`、`UPDATE_AUTHORIZED`、`UNAUTHORIZED` 或未知事件仍要求组件已经 active，不能借普通事件注册组件。

回调外层必须符合严格 JSON schema：`Nonce`、十位 Unix 秒 `TimeStamp`、非空 `Encrypt` 和 40 位小写十六进制 `MsgSignature`；允许时间偏差为五分钟。解密后的 Ticket 必须非空且不超过 4 KiB。Ticket 事件幂等键由服务端 HMAC 覆盖固定域、Component AppID、事件名、发生时间和 Ticket，不保存可逆 Ticket。两个并发合法首 Ticket 最终只能存在一条组件记录；disabled、错误 AppID、过期、签名错误、解密失败和空 Ticket 均不得产生组件或事件写入。成功响应正文精确为小写 `success`，不附加 JSON 包装；响应头使用 `text/plain`。

组件记录属于从可信提供方事件产生的运行时状态，由现有 migration 管理的 SECURITY DEFINER RPC 建立，不通过人工远端 DML 初始化。本轮不新增第二套注册写路径；数据库结构、约束、RLS、RPC 或静态初始化数据如需改变，仍必须使用 migration。

抖音官方说明开放平台约每十分钟推送一次 Ticket、Ticket 有效期三小时、成功响应必须是纯文本 `success`：
<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/component-ticket>

### 4.4 开发 API 部署

沿用项目已有开发环境部署机制，把当前分支的指定完整 Git SHA 部署到 `api-dev.goodcms.cn`，不新建第二套部署架构。执行记录必须在部署前固定 Git SHA、Supabase project ref、部署服务名、API 域名以及 Component、Template、Authorizer AppID 尾号；部署日志或版本证据必须证明远端运行该 SHA。部署环境必须具备现有 Supabase/JWT 配置和九项抖音配置：

- `DOUYIN_COMPONENT_APP_ID`
- `DOUYIN_COMPONENT_APP_SECRET`
- `DOUYIN_COMPONENT_MESSAGE_TOKEN`
- `DOUYIN_COMPONENT_MESSAGE_AES_KEY`
- `DOUYIN_TEMPLATE_APP_ID`
- `DOUYIN_TEMPLATE_APP_SECRET`
- `DOUYIN_CREDENTIAL_KEYS_JSON`
- `DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION`
- `DOUYIN_SUBJECT_HASH_KEY`

所有值只进入受控部署环境，不写入代码、文档、测试输出或聊天记录。部署后先验证配置错误不泄露值，再验证回调路由绕过普通后台鉴权。

### 4.5 安装与测试数据只能走业务入口

- 模板开发安装通过 `POST /platform/douyin-miniapps/template-development` 创建。
- 测试商户安装只由可信授权回调产生，初始状态为 `merchant / authorized_unbound`。
- 商户安装通过 `POST /platform/douyin-miniapps/:id/bind` 绑定装修公司并生成 `deployment_key`。
- 停用、启用、配置更新和 deployment key 轮换只能使用已有平台管理接口。
- 不通过远端 SQL Editor、service role 临时脚本或手工表编辑创建/修改安装。

选择两个内容可区分的 active 装修公司租户：测试商户安装绑定主租户，模板开发安装绑定隔离租户。两类安装都完成会话、内容和留资验证，从而用两个独立服务端会话证明案例、工地、手机号去重和线索归属不会串租户。测试数据标识只保存在受控验收记录中。

### 4.6 服务商控制台配置

开发联调使用以下 HTTPS 地址：

| 控制台用途 | URL |
| --- | --- |
| 授权事件接收 | `https://api-dev.goodcms.cn/douyin-thirdparty/events/authorization` |
| 消息、事件与 Ticket 接收 | `https://api-dev.goodcms.cn/douyin-thirdparty/events/message` |

控制台 Token 和 EncodingAESKey 必须与开发 API 环境一致。配置路径、授权测试小程序和模板小程序要求以抖音官方文档为准：
<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/template/establish>

保存控制台配置、添加测试小程序、授权、IDE 上传、加入模板库、商户上传和生成二维码都是外部状态变更。执行时要在动作前核对目标应用/AppID 尾号；仅操作已明确授权的测试对象。

### 4.7 外部变更授权门禁

只读代码、数据库、控制台状态核验不需要重复确认。以下动作必须在动作发生前获得用户针对本次具体目标的明确肯定授权：

- 修改开发部署环境变量并部署 API；
- 执行任何远端 migration；
- 保存回调地址、添加模板小程序或授权测试小程序；
- 发起或确认测试商户授权；
- 创建、绑定、disable、enable 或轮换安装；
- 向真实号码发送测试短信及创建测试线索；
- IDE 上传、加入模板库、商户 upload 和生成 test-qr。

每次授权说明必须包含环境、完整 Git SHA、目标 AppID 尾号、涉及的租户/安装 ID、预期副作用和恢复/保留方式。某一动作的授权不能自动扩展到后续动作；提审和正式发布始终不在本轮授权范围。

### 4.8 模板开发与商户测试版本

模板交付顺序固定为：

1. 在抖音 IDE 导入 `apps/douyin-mini`，使用模板开发 AppID 完成预览和真机检查。
2. 经静态门禁和真实功能验证后上传模板开发代码。
3. 在服务商平台把本次代码加入模板库，记录数字 `template_id`。
4. 测试商户完成授权和租户绑定后，用新的严格 SemVer 调用单商户 upload API。
5. 服务端只生成包含该安装 `deployment_key` 的扩展配置，客户端不能覆盖。
6. 生成该测试版本的二维码并完成 Android、iOS 真机检查。

商户交付版本使用新的严格 SemVer，不能与同一安装既有发布记录重复。执行记录固定 `Git SHA -> template_id -> template_version -> release UUID -> test-qr` 的一一对应关系。本文的 `uploaded`、`testing` 是 Gooes 发布记录状态，不是审核或线上状态。

抖音官方模板代开发流程要求先把模板小程序代码加入模板库，再使用模板 ID 为授权商户提交代码：
<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/DevelopingCode>

本轮不调用 `submit-audit`、`publish`，不点击控制台的提交审核或正式发布按钮。

## 5. 分阶段执行与门禁

### 阶段 0：静态基线

- 固定工作树、完整 Git SHA、Supabase project ref、部署服务、API 域名和三个 AppID 尾号。
- 确认部署权限、控制台操作者、开发配置责任人、专用测试手机号持有人、验证码读取者及 Android/iOS 真机执行人；缺少某项时不得进入依赖它的阶段。
- 确认两个专用开发测试租户、各自测试数据范围和收尾策略。
- 运行小程序/API 类型检查、构建、聚焦测试和稳定根测试。
- 增加环境路由与首个 Ticket 组件注册的失败测试，再实现最小改动。
- 扫描生产域名回退、租户选择器、原始凭证和调试日志。
- 若实施发现任何表结构、索引、约束、RLS/policy、函数、触发器、枚举或静态初始化数据变化，必须先创建并审阅 migration。应用前列出待执行 migration 文件、目标 project ref、影响范围与回滚方案，保存 `supabase migration list` 目标证据，并取得用户针对本次数据库变更的明确肯定授权；未授权不得执行 `supabase db push`、远端 migration apply 或等价操作。应用后再次验证 Local/Remote 对齐。若没有数据库变化，执行记录明确写“无 migration”。

### 阶段 1：开发 API

- 配置受控开发环境变量并部署当前提交。
- 验证健康检查、普通 API 和抖音路由版本。
- 验证无效回调按安全错误码失败、不会被后台鉴权抢先返回 401。

### 阶段 2：Ticket 与组件凭证

- 只读核对服务商应用、模板小程序和测试小程序状态。
- 经动作时确认后保存两个开发回调地址。
- 接收首个真实 Ticket，确认组件 active、Ticket 仅以凭证信封存储。
- 验证组件访问凭证可获取/刷新，日志不包含 Ticket 或 token。

### 阶段 3：模板开发安装与真实会话

- 通过平台管理 API 创建模板开发安装并绑定隔离测试租户配置。
- IDE 预览完成 `tt.login -> code2session -> Gooes JWT`。
- 验证 Bootstrap、公司资料、案例、工地、分页、空态和营销事件。

### 阶段 4：测试商户授权与隔离

- 测试商户授权第三方应用，验证安装进入 `authorized_unbound`。
- 通过管理 API 绑定主测试租户，验证正确/错误 AppID 和 deployment key。
- 对比模板开发安装的隔离租户会话，验证两边内容不能串租户。
- 执行一次 disable/enable 失效检查；不主动演练真实撤销授权，除非另行确认测试对象可以重新授权。

### 阶段 5：短信留资

- 分别在测试商户和模板开发安装中使用同一专用测试手机号，验证发送限流、错误码、过期/消费边界。
- 提交正确验证码，验证直属线索进入主测试租户。
- 验证主租户内幂等与 24 小时去重，并验证隔离租户可独立形成自己的测试线索。
- 证据只记录掩码手机号、线索 UUID、事件 UUID 和时间。

### 阶段 6：模板与二维码

- 记录 API/小程序 Commit、模板版本和门禁输出。
- 经动作时确认后执行 IDE 上传并加入模板库。
- 经动作时确认后对单个测试商户执行 upload 和 test-qr。
- 完成 Android、iOS 真机检查；停在 `uploaded/testing`。

### 阶段 7：收尾与保留

- 保留开发 API 的必要安全配置、组件凭证信封、模板库版本和脱敏执行证据。
- 根据动作前批准的策略保留或停用两个测试安装；不得直接删除或手工修改数据库状态。
- 对测试短信、营销事件和线索标记测试前缀并按开发环境数据策略清理或保留。
- 核对测试商户授权、回调地址和测试二维码的后续用途；需要解除或修改时再次取得具体授权。
- 明确记录不可逆或需重新授权的外部对象，不把“无法自动回滚”写成已恢复。

## 6. 失败处理与恢复

- 任一请求误连生产 API：立即停止联调，修复环境选择后重新构建；不得在生产继续试验。
- 回调持续非 200：检查 HTTPS、WAF、原始请求体透传、Token/AES Key 和开发 API Commit，不记录原始密文。
- 合法 Ticket 无法落库：停止授权和上传，检查组件 active 状态与凭证信封配置；禁止手工补 Ticket。
- 商户授权成功但安装缺失：保存脱敏 `log_id` 和时间，先查授权事件账本，再决定安全重放；禁止手工插入安装。
- 短信或线索归属异常：立即停止发送及后续模板步骤，按租户隔离缺陷处理；若动作前已经单独批准该故障条件下停用指定安装，则执行停用，否则先取得针对该安装的明确授权后停用。
- provider 成功但本地发布记录不确定：遵循运维手册的两分钟租约与精确版本对账，不重复调用外部 mutator。
- 测试版本问题：保留上一稳定模板 ID，修复后使用新 SemVer 重新 upload；不改数据库发布状态。

## 7. 证据与验收

验收记录以 `docs/operations/douyin-miniapp-template-smoke-checklist.md` 为基础，复制为一次性执行记录或在受控工单中逐项填写。仓库和聊天中不得保存真实秘密、完整手机号、验证码、Ticket、OpenID、access/refresh token 或 provider 原始响应。

本轮完成必须同时满足：

1. 开发/预览版只请求 `api-dev.goodcms.cn`，线上版只请求 `api.goodcms.cn`，未知环境失败关闭。
2. `api-dev.goodcms.cn` 运行目标提交，抖音回调没有普通后台鉴权阻断。
3. 真实 Ticket 成功建立 active 组件并以加密信封保存，禁用组件不能被自动复活。
4. 模板开发安装完成真实登录、Bootstrap、内容、分页和事件验证。
5. 测试商户授权、租户绑定、deployment key 和跨租户隔离通过。
6. 专用测试手机号完成短信和直属线索闭环，幂等与去重符合契约。
7. 已验证代码进入模板库，单个测试商户生成测试版本和体验二维码。
8. Android、iOS 真机关键路径均已通过。若任一设备尚未验收，本轮只能标记为“待用户验收”；前七项通过时最多标记为“已具备真机验收条件”，不得标记为“全链路完成”。
9. 没有调用提审或正式发布接口，没有改变 orange 仓库。

## 8. 预期代码与文档影响

- 修改 `apps/douyin-mini/src/config/index.ts`，增加严格环境到 API Origin 的映射。
- 修改/增加小程序配置测试，覆盖三个官方环境值和未知环境失败关闭。
- 调整 `apps/api/src/services/douyin-miniapp/authorization-events.ts`，让可信 Ticket 复用现有事件申领 RPC 完成首次组件注册，其他事件仍先检查 active 组件。
- 增加回调服务与 migration contract 测试，覆盖首建路径、并发幂等、disabled 和普通事件拒绝。
- 更新运维手册和 Smoke 清单中的开发环境路由、首建组件和本轮“停在测试版”边界。
- 不新增第三方依赖；不修改 orange；如无数据库结构变化，不新增 migration。
