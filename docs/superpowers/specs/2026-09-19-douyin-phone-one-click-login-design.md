# 抖音手机号快捷登录闭环设计

## 背景与根因

抖音开放平台已经为小程序“好店智装云”开通“获取手机号”能力，但 0.1.39
提审仍因“手机号授权一键登录功能无法使用”被拒。平台能力状态与代码链路的核查结果表明，
问题不在授权弹窗本身，而在能力的使用场景和登录闭环：

- 免费量房页把 `getPhoneNumber` 用于表单手机号快捷填写。抖音官方手机号 FAQ
  明确说明该能力不支持普通表单填写场景，审核也会按“手机号快捷登录”核验。
- 客户项目登录页虽然能取得手机号，但后端在手机号没有关联客户项目时返回
  `CUSTOMER_CONTEXT_MISSING`，客户端因此没有建立任何登录态。审核人员使用未预置的手机号时，
  会看到登录失败，而不是一个完整的登录成功状态。
- 客户登录首屏缺少默认不勾选的《隐私政策与用户协议》确认，也没有清晰可见的退出登录入口，
  与抖音账号登录规范要求不完整。

“获取抖音授权手机号”是平台开放能力，“手机号授权一键登录”是该能力在当前小程序中的产品用途。
底层都通过 `open-type="getPhoneNumber"` 取得一次性凭证。本设计只在客户账号登录场景保留该能力，
并把无项目手机号纳入成功登录闭环。

参考文档：

- [账号登录规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/management/specification/account-login-standard)
- [手机号常见问题](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/platform-capabilities/abtain-mobile-number/user-phone-number-faq)
- [版本审核常见问题](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/operation/version-review/faq)

## 目标

1. 免费量房只使用用户手输手机号加短信验证码，不再出现抖音手机号授权按钮。
2. 客户项目登录保留“抖音手机号快捷登录”，授权成功后无论是否关联项目，都建立可恢复的登录态。
3. 已关联一个项目、关联多个客户身份和未关联项目三条路径都有明确、可完成的结果。
4. 登录前由用户主动勾选隐私政策与用户协议；登录后随时可以退出。
5. 无项目登录态不能访问任何客户项目数据，不能因为登录成功而放宽客户身份校验。
6. 短信验证码作为其他手机号登录方式，与抖音手机号快捷登录使用相同的身份解析结果。

## 非目标

- 不恢复装修生图、AI 效果图上传或生成能力。
- 不自动创建 CRM 客户、项目或租户成员关系。
- 不修改 `/Users/leefo/Public/work/orange`。
- 不新增第三方依赖，也不改变抖音官方手机号解密、公私钥或会话交换协议。
- 不把无项目访客会话升级为客户会话，也不允许它调用客户项目接口。

## 产品流程

### 免费量房

免费量房页始终展示可编辑手机号、获取短信验证码和验证码输入框。页面不展示
“获取抖音绑定手机号”，也不触发 `getPhoneNumber`。现有量房表单、隐私确认、提交结果和流量归因保持不变。

运行时配置统一为：

```json
{
  "sms_lead": true,
  "douyin_phone": false,
  "phone_capture_mode": "sms"
}
```

后台不再提供将免费量房切回抖音手机号取号的开关。旧版本客户端仍由运行时配置收到短信模式，
避免线上旧包继续进入不符合审核场景的取号流程。

### 客户项目登录

登录首屏顺序如下：

1. 页面说明“使用装修公司预留的手机号登录并查找项目”。
2. 默认未勾选《隐私政策与用户协议》。协议链接打开现有隐私页。
3. 主按钮文案为“抖音手机号快捷登录”，继续使用 `open-type="getPhoneNumber"`。
4. “使用其他手机号登录”展开手机号和短信验证码表单。
5. 未勾选协议时不发起手机号授权、不发送短信、不提交验证码，并就地提示先阅读并同意协议。

授权或短信验证成功后按候选客户数量分流：

| 候选客户数 | 结果 |
| --- | --- |
| 0 | 创建或复用抖音用户身份，签发受限访客登录态，在当前页展示“登录成功，暂未关联装修项目”空状态 |
| 1 | 保持现有客户绑定与客户令牌签发，进入客户项目列表 |
| 多个 | 保持现有装修公司/客户身份选择，选择后进入项目列表 |

无项目空状态展示已登录手机号的脱敏值，提供“申请免费量房”和“退出登录”。它不再提示授权失败，
也不引导用户用同一手机号重复授权。退出登录清除本地会话并回到未登录首屏。

客户项目列表页增加可发现的“退出登录”入口。退出只清除当前小程序的客户/访客会话，
不影响抖音账号本身。

## 后端设计

### 认证结果协议

现有 `authenticated` 结果中的 `auth` 扩展为判别联合类型：

```ts
type DouyinCustomerAuth =
  | {
      mode: "customer";
      has_customer_profile: true;
      token: string;
      user_id: string;
      roles: string[];
      verified_phone: string;
      tenant: { id: string; name: string | null; slug: string | null };
      customer: { id: string; name: string | null; phone: string | null };
    }
  | {
      mode: "platform_visitor";
      has_customer_profile: false;
      token: string;
      user_id: string;
      visitor_id: string;
      roles: ["visitor"];
      verified_phone: string;
      phone_masked: string;
      tenant: null;
      customer: null;
    };
```

响应继续使用 `{ status: "authenticated", auth }`，已关联客户和多候选协议不变。
客户端必须以 `mode`/`has_customer_profile` 分流，不能通过字段是否为空推断身份。

### 无项目访客会话

`DouyinCustomerAuthService.authenticateByPhone` 在候选数为零时不再抛出
`CUSTOMER_CONTEXT_MISSING`，而是：

1. 通过现有 `resolveAuthUserId` 创建或复用平台用户。
2. 通过现有用户身份 gateway 同步 `douyin_mini` OAuth 身份。
3. 使用独立的 `signDouyinVisitorSessionToken` 签发短时访客令牌。
4. 返回 `platform_visitor` 登录结果。

抖音访客令牌使用现有 `visitor_session` 类型并带有以下受约束声明：

- `login_channel: "douyin"`
- `roles: ["visitor"]`
- `openid` 和 `subject_hash` 使用当前抖音会话的不可逆主体哈希
- `visitor_id` 使用已解析的平台用户 ID
- `tenant_id`、`douyin_installation_id`、`douyin_app_id`
- `verified_phone`

新签发函数与现有微信 `signVisitorSessionToken` 分离，避免改变微信令牌行为。
令牌沿用访客会话有效期。通用 JWT 校验增加抖音访客声明校验，拒绝缺少租户、安装、App ID、
主体哈希或已验证手机号的伪造/不完整令牌。

鉴权插件继续把 `visitor_session` 限制在访客白名单路由。它不得通过客户项目身份断言，
也不得访问客户自助项目接口。无项目页面不调用客户项目 API；只有 `mode: "customer"`
才进入项目列表并使用客户 API。

### 短信登录一致性

`verifySms` 和 `authorizePhone` 继续汇入同一个 `authenticateByPhone`。因此无项目手机号通过短信验证后，
也得到相同的 `platform_visitor` 结果，不再回到 `CUSTOMER_CONTEXT_MISSING` 错误。

所有新业务错误继续通过 `error-factory.ts` 创建；不直接抛出 `Error`，不吞掉平台或数据库异常。
日志只记录请求 ID、分流结果和内部用户 ID，不记录明文手机号、手机号授权凭证或完整 JWT。

## 小程序状态设计

`CustomerAuthResult` 改为客户与平台访客的判别联合。客户会话本地存储在现有 token、过期时间之外增加：

- `mode: "customer" | "platform_visitor"`
- `phoneMasked?: string`

读取旧版存储记录时，没有 `mode` 的会话按 `customer` 处理，保证升级兼容。写入访客结果后，
客户登录页可在重进页面时恢复无项目空状态。`CustomerSessionManager` 提供读取当前模式和统一清除方法；
不在页面内直接操作存储键。

会话管理器明确区分两个查询：`isAuthenticated()` 表示客户或访客已经完成手机号登录，
`hasCustomerProfile()` 只在模式为 `customer` 时为真。主页“我的项目”入口只有在
`hasCustomerProfile()` 为真时直达项目列表；已登录访客仍进入客户登录页，并在那里恢复无项目空状态。
客户项目页在发起列表请求前也检查客户模式，避免访客令牌产生一次可预防的 401 请求。

页面分流规则：

- `customer`：进入客户项目列表。
- `platform_visitor`：留在客户登录页并切换为登录成功空状态。
- 会话过期或客户 API 返回 401：沿用现有清理逻辑，回到未登录状态。
- 用户退出：清理会话，重置候选、错误、短信倒计时和表单状态。

现有 `privacy-consent` 组件增加明确的登录用途文案模式，量房页默认文案保持不变。
客户登录页不自行复制一套协议组件。

## 免费量房配置收敛

新增 migration 完成两件事：

1. 把所有抖音小程序安装的 `runtime_config.features.douyin_phone` 设为 `false`，
   `phone_capture_mode` 设为 `sms`，保留 `cases`、`sites` 和其他既有配置。
2. 更新数据库配置 RPC，使后续请求不能重新启用免费量房抖音取号模式；关闭短信模式仍保持幂等。

API 服务和租户后台同步移除“免费量房抖音手机号”启用操作。服务端保留旧版量房抖音凭证解析与提交代码，
只作为旧客户端兼容路径；运行时开关关闭后不能被正常调用。这样既能立即约束旧体验版，也避免在本次审核修复中
扩大到历史 RPC 删除。

该 migration 是可逆的配置收敛，不删除列或历史数据。回滚时必须通过新的 migration 恢复 RPC 行为，
并仅对明确需要恢复的 installation 设置 `douyin_phone=true`；不能批量假设所有安装在变更前都启用了该能力。
发布后用 `supabase migration list` 验证本地与远端一致。

## 错误和边界场景

- 用户拒绝抖音授权：保留在登录页，提示可重试或使用其他手机号，不建立会话。
- 平台未返回授权凭证：显示明确的授权未完成提示，不误报“未关联项目”。
- 换号接口、网络或密钥异常：显示“抖音手机号服务暂时异常，请稍后重试”，服务端保留可追踪错误码。
- 手机号无项目：属于登录成功结果，展示空状态，不显示红色错误。
- 多候选选择过期或冲突：保留现有稳定错误处理，要求重新验证手机号。
- 访客令牌调用客户项目接口：返回 401/403 并清除无效客户 API 会话，不能降级绕过客户绑定。
- 用户协议未勾选：客户端不发起授权或短信请求，就地显示协议错误。

## 验证策略

遵循现有 Bun 测试方式，先补失败测试再实现：

### API

- 抖音手机号授权在零候选时返回 `platform_visitor`，同步身份并签发受限令牌。
- 短信验证在零候选时返回同样的访客结果。
- 单候选、多候选、选择候选和重新绑定流程保持原行为。
- 抖音访客令牌包含必需声明、有效期受限，缺少或篡改声明时校验失败。
- 抖音访客令牌不能通过客户项目路由鉴权。
- 新 migration 合同覆盖配置统一为短信模式、RPC 禁止重新启用和权限声明。

### 抖音小程序

- 免费量房模板不再含 `open-type="getPhoneNumber"`，手机号和验证码可正常输入、发送和提交。
- 客户登录未勾选协议时不触发授权、短信发送或验证码提交。
- 拒绝授权、平台异常、零候选、单候选和多候选分别呈现正确状态。
- 零候选保存访客模式，页面重进后恢复登录成功空状态；免费量房 CTA 和退出登录可用。
- 只有客户模式会跳转项目列表；访客模式不会请求客户项目接口。
- 旧版无 `mode` 的本地客户会话仍可读取。
- 客户项目页退出登录后清除会话并返回登录页。

### 最小发布检查

- 运行受影响 API 单元测试、抖音小程序单元测试和两个工作区的 TypeScript 检查。
- 构建抖音小程序并静态扫描：免费量房无手机号授权按钮，客户登录只有一个手机号授权入口，
  页面无装修生图或 AI 效果图交互。
- 在开发/体验版分别用“有关联项目手机号”和“无关联项目个人手机号”真机验证。
- 生产 migration 执行前确认清单，执行后核对 Local/Remote 对齐和 bootstrap 返回短信模式。

## 发布顺序与验收

1. 合入后端访客登录闭环、JWT 校验、客户端状态与免费量房收敛代码。
2. 在开发环境应用 migration，完成 API 与真机 smoke。
3. 发布 API，再应用生产 migration，验证旧线上包的免费量房立即切换到短信模式。
4. 构建并上传新的抖音模板版本 `0.1.40`，生成体验版测试码。
5. 用个人抖音号验证授权成功后的无项目登录空状态、协议默认未勾选和退出登录。
6. 提交 `0.1.40` 审核，备注：手机号能力仅用于客户账号快捷登录；无关联项目手机号也可完成登录并进入空状态；
   免费量房使用手输手机号和短信验证码。

验收完成的判定是：审核人员使用任意可授权手机号，都能在同意协议后得到明确的登录成功结果；
有项目时进入项目列表，无项目时进入受限空状态；免费量房页完全不调用手机号快捷登录能力。
