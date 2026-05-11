# 手机号免验证码登录测试开关

日期：2026-05-11

## 1. 背景

测试阶段没有足够多真实手机号接收短信验证码，后台和小程序登录调试成本较高。

本次增加一个测试开关，允许只输入手机号完成身份匹配和登录，不校验短信验证码。

## 2. 开关

环境变量：

```bash
AUTH_PHONE_LOGIN_WITHOUT_CODE=true
```

开启值：

- `true`
- `1`
- `yes`

未配置或其它值时，仍按原逻辑校验短信验证码。

## 3. 影响范围

开启后：

- Admin 后台 `/admin/auth/login`：
  - 只校验手机号是否绑定有效员工。
  - 不查询 `sms_verification_codes`。
  - 不要求 `code`。
- 微信小程序 `/auth/verify-role`：
  - 只校验手机号是否匹配对应身份。
  - 不查询 `sms_verification_codes`。
  - 不要求 `code`。

不影响：

- 微信 `code -> openid` 的基础登录。
- 员工/客户身份绑定规则。
- 租户状态校验。
- 已有验证码发送接口。

## 4. 上线规则

生产正式发布前必须关闭：

```bash
AUTH_PHONE_LOGIN_WITHOUT_CODE=false
```

或删除该环境变量。

## 5. 前端对接

Admin 登录页已允许验证码为空提交。

小程序端测试阶段可以在绑定员工/客户身份时不传 `code`，或传空字符串：

```json
{
  "phone": "18638374738",
  "target_role": "customer",
  "code": ""
}
```

正式发布后，仍需恢复原交互：

1. 先发送验证码。
2. 用户填写验证码。
3. 调 `/auth/verify-role` 完成身份绑定。
