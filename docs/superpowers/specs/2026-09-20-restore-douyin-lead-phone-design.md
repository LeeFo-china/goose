# 恢复抖音免费量房手机号授权设计

## 背景

抖音小程序 `0.1.40` 已审核通过。此前审核问题来自客户项目登录没有形成完整闭环，
并非免费量房页使用抖音官方手机号授权。当前实现为了提审同时关闭了免费量房快捷
留资：小程序移除了授权入口，API 对新版 bootstrap 强制返回短信模式，租户配置接口
拒绝开启，生产安装也被 migration 统一切回短信模式。

## 目标

从 `0.1.41` 起恢复免费量房页的“获取抖音绑定手机号”流程，并保留手填手机号加短信
验证码作为拒绝授权、能力不可用和运营关闭时的兜底。客户项目登录继续使用独立的
客户认证接口，两条业务链路不得共享登录结果或混淆页面文案。

## 兼容策略

- `legacy_0_1_10` bootstrap 契约继续强制返回 `douyin_phone=false` 和
  `phone_capture_mode=sms`，保证旧线上包只走短信流程。
- `runtime` 契约按安装的 `runtime_config.features` 返回真实配置，新版小程序据此决定
  是否展示抖音手机号授权入口。
- 免费量房短信接口、短信验证码字段和提交协议继续保留，不移除旧能力。

## 数据流

1. 小程序加载 bootstrap，读取 `douyin_phone` 和 `phone_capture_mode`。
2. 开启时展示“获取抖音绑定手机号”。用户触发 `getPhoneNumber` 后，仅把平台返回的
   临时 code 交给现有免费量房提交接口，客户端不保存或日志输出完整手机号。
3. 服务端通过现有官方手机号交换流程取得号码，并调用
   `submit_douyin_measurement_appointment_with_douyin_phone` 完成幂等留资。
4. 用户拒绝授权或授权失败时停留在表单，显示可理解的提示，并可改用手填手机号和
   短信验证码提交。
5. 客户项目登录仍调用独立的 customer-auth 接口，不读取免费量房提交结果。

## 配置与数据库

- 恢复租户 Admin 的“抖音官方手机号快捷留资”开关，并保留乐观锁
  `expected_updated_at`。
- 新增 migration，恢复五参数 `update_douyin_miniapp_lead_capture_config` RPC 对
  `enabled=true/false` 的支持；不修改已经执行的 migration。
- migration 将当前 `active` 且 `installation_kind='merchant'` 的安装切换为
  `douyin_phone`，同时保留 `runtime_config` 中无关字段。
- 回滚时可调用同一 RPC 关闭单个安装；紧急整体回滚可用后续 migration 将 active
  merchant 安装切回短信模式，并恢复禁止开启的 RPC 实现。

## 错误处理与安全

- 用户拒绝授权、平台未返回 code、平台换号失败均不得伪造手机号或绕过校验。
- 配置写入继续校验租户、权限、当前 active 安装、AppID 和乐观锁版本。
- API 错误继续通过 `error-factory.ts` 包装。
- 日志、测试记录和文档不得包含 token、官方临时 code 或完整手机号。

## 验收

- 新版 bootstrap 可返回真实的抖音手机号功能配置，旧版契约仍为短信模式。
- Admin 可以开启或关闭单个 active 安装，过期版本返回 409。
- 免费量房授权成功时不要求短信验证码；拒绝或失败后可使用短信兜底。
- 重复点击和重试沿用既有 Idempotency-Key，不产生重复线索。
- 小程序测试、API 测试、Admin 测试、类型检查和构建通过。
