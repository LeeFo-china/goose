# Phase 5D 小程序对接文档：租户停用提示

日期：2026-05-10

## 1. 变化摘要

租户被平台停用后，小程序客户态业务接口会返回：

```text
403 TENANT_NOT_AVAILABLE
```

## 2. 需要处理的接口

重点包括：

- `/auth/me/customer-context`
- `/customer/profile`
- `/customer/projects`
- `/customer/projects/:id`
- `/customer/projects/:id/logs`
- `/customer/project-acceptances`
- `/customer/project-acceptances/:id`
- 验收短信票据校验和详情访问

## 3. 推荐交互

收到 `TENANT_NOT_AVAILABLE` 后展示统一停用态：

```text
服务已暂停
装修公司服务暂不可用，请联系装修公司或平台客服。
```

按钮建议：

- 返回首页
- 联系客服

## 4. 登录态影响

客户登录时：

- 手机号匹配装修公司时，只返回 active 租户。
- 如果客户只有停用租户身份，则会进入平台访客态或无可选装修公司状态。
- 如果短信验收链接所属租户已停用，访问会返回 `TENANT_NOT_AVAILABLE`。

## 5. H5 说明

5D 暂不强制关闭 H5 活动页。

小程序 web-view 如果加载 H5 公开页，不需要在本阶段做额外处理。后续如果后端增加 H5 停用策略，再补充对接。
