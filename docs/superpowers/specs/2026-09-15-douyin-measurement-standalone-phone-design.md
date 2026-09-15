# 抖音量房普通手机号授权设计

日期：2026-09-15。

## 目标

免费量房页复用客户登录页的抖音官方 `getPhoneNumber` 能力。用户点击提交后授权手机号，客户端把抖音返回的一次性 code 交给既有后端换号与预约提交链路。该流程不依赖抖音线索组件 ID。

## 交互

- 租户开启“抖音手机号快捷留资”后，量房页不显示手机号和短信验证码输入框，主按钮显示“使用抖音手机号提交”。
- 按钮使用 `open-type="getPhoneNumber"` 和 `bindgetphonenumber`，与客户登录页一致。
- 用户拒绝授权或抖音未返回 code 时，页面展开手机号与短信验证码表单并显示可恢复提示。
- 用户也可以主动切换到短信验证码；短信仍是完整兜底路径。
- 表单不再声明 `conversion-target` 或 `clue-component-id`。

## 配置与数据

- 保留租户级 `phone_capture_mode=sms|douyin_phone` 开关，管理端不再要求或展示线索组件 ID。
- `douyin_phone` 运行配置只包含 `cases`、`sites`、`sms_lead`、`douyin_phone` 和 `phone_capture_mode`。
- 新 migration 移除“官方手机号模式必须关联线索组件 ID”的数据库约束，清除运行配置中的 `clue_component_id`，并将配置 RPC 改为无需组件 ID 的签名。
- 数据库列暂时保留为历史兼容字段，不参与运行和响应，避免本次引入破坏性删列。

## 安全与验证

- 后端继续通过抖音开放平台用一次性 code 获取手机号；客户端不接收解密密钥，不提交明文手机号到官方授权分支。
- 预约提交继续使用现有幂等键、隐私同意、临时手机号验证记录和原子 RPC。
- 用 RED/GREEN 覆盖 Domain 运行配置、客户端 bootstrap、量房模板、Admin 配置请求、API schema/repository、migration 契约；最后运行受影响测试、各包类型检查和 migration 静态核验。

## 回滚

回滚时先把已开启的安装实例切回短信模式，再恢复旧 RPC 与约束。历史 `clue_component_id` 列仍保留，因此已有组件 ID 不会因本次迁移丢失；本次之后在无组件 ID 条件下开启的实例不能直接恢复旧模式。
