# 租户短信通道模式改造方案

## 1. 背景

当前租户短信配置只支持覆盖部分字段，例如短信签名和少量模板 Code。这个设计适合“平台统一短信网关，租户只自定义签名/模板”的轻量模式，但不适合标准 SaaS 场景。

如果租户自己申请了阿里云或腾讯云短信服务，就需要完整覆盖自己的短信通道配置。否则会出现半继承、半自定义的问题，既不安全，也不利于排查。

## 2. 目标

租户短信配置改成明确的通道模式：

1. `platform`：继承平台短信通道，租户 0 覆盖。
2. `tenant_aliyun`：租户使用自有阿里云短信通道。
3. `tenant_tencent`：租户使用自有腾讯云短信通道。

## 3. 核心原则

### 3.1 继承平台就是 0 覆盖

租户选择继承平台时：

- 不展示平台 AccessKey / Secret。
- 不展示平台签名。
- 不展示平台模板 Code。
- 不允许租户覆盖任何短信字段。
- 发送短信时全部读取平台配置。

租户后台只展示：

```text
当前使用平台统一短信通道
短信发送由平台统一维护
```

### 3.2 自有通道必须完整配置

租户选择自有阿里云或腾讯云时：

- 不再回退平台配置。
- 必须完整填写当前通道所需字段。
- 缺少字段时后端直接报错。

这样可以保证一条短信只来自一个明确通道，避免混合配置导致问题难以定位。

## 4. 配置项设计

### 4.1 模式配置

```text
SMS_CHANNEL_MODE
```

可选值：

```text
platform
tenant_aliyun
tenant_tencent
```

### 4.2 阿里云自有通道

```text
ALIBABA_CLOUD_ACCESS_KEY_ID
ALIBABA_CLOUD_ACCESS_KEY_SECRET
ALIYUN_SMS_SIGN_NAME
ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER
ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE
ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN
ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE
PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS
```

### 4.3 腾讯云自有通道

```text
TENCENT_SMS_SECRET_ID
TENCENT_SMS_SECRET_KEY
TENCENT_SMS_REGION
TENCENT_SMS_ENDPOINT
TENCENT_SMS_SDK_APP_ID
TENCENT_SMS_SIGN_NAME
TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER
TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE
TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN
TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE
PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS
```

## 5. 后端发送规则

```ts
if (!tenantId) {
  usePlatformSmsProvider();
}

const mode = getTenantSetting("SMS_CHANNEL_MODE");

if (!mode || mode === "platform") {
  usePlatformSmsProvider();
}

if (mode === "tenant_aliyun") {
  useTenantAliyunConfigStrictly();
}

if (mode === "tenant_tencent") {
  useTenantTencentConfigStrictly();
}
```

## 6. Admin 交互规则

### 6.1 平台超管

平台超管可维护平台短信通道，包括：

- 平台 `SMS_PROVIDER`
- 平台阿里云配置
- 平台腾讯云配置
- 平台短信模板

### 6.2 租户管理员

租户管理员先看到一个独立的“短信通道” Card，只负责选择模式：

- 继承平台短信通道
- 自有阿里云短信通道
- 自有腾讯云短信通道

当选择 `platform`：

- 下方只展示说明 Card：当前使用平台统一短信通道。
- 隐藏所有平台配置细节。
- 不展示平台生效值。
- 不展示平台模板 Code。
- 不展示参数配置 Card。

当选择 `tenant_aliyun`：

- 立即在下方渲染“阿里云短信参数” Card。
- 展示阿里云完整配置项。
- 所有关键配置必须租户自己填写。
- Card 顶部显示配置完整度，例如“未配置 3”。

当选择 `tenant_tencent`：

- 立即在下方渲染“腾讯云短信参数” Card。
- 展示腾讯云完整配置项。
- 所有关键配置必须租户自己填写。
- Card 顶部显示配置完整度，例如“未配置 3”。

模式切换后前端应立即更新下方 Card，不等待页面刷新。保存完成后再刷新服务端数据，保证最新配置状态和缺失数量准确。

为支持即时渲染，后端在租户上下文下可以返回阿里云和腾讯云的可配置字段字典，但这些字段必须只包含租户自己的 `stored_value/effective_value`，不能把平台生效值透传给租户。前端根据当前选中的 `SMS_CHANNEL_MODE` 决定展示哪一组字段。

## 7. MVP 执行清单

1. 新增 `SMS_CHANNEL_MODE` 配置项。
2. 新增腾讯云短信配置项。
3. 调整租户设置列表：
   - `platform` 模式只返回 `SMS_CHANNEL_MODE`。
   - 自有通道模式只返回对应通道配置。
   - 租户侧不返回平台生效值。
4. 调整短信发送服务：
   - 平台继承走平台配置。
   - 自有阿里云严格读取租户配置。
   - 自有腾讯云严格读取租户配置。
5. 补 Supabase migration 插入新增平台配置字典。
6. 更新 admin 设置页文案。
7. 租户短信配置页改成“通道选择 Card + 参数配置 Card”的结构：
   - `platform`：只显示说明 Card。
   - `tenant_aliyun`：显示阿里云参数 Card。
   - `tenant_tencent`：显示腾讯云参数 Card。

## 8. 验收标准

- 租户继承平台时，后台不显示平台密钥、签名、模板 Code。
- 租户继承平台时，下方不出现参数配置表单。
- 租户继承平台时，短信发送仍使用平台配置。
- 租户切换到自有阿里云后，下方立即出现阿里云短信参数 Card。
- 租户选择自有阿里云时，缺任意关键配置发送失败并提示租户配置不完整。
- 租户切换到自有腾讯云后，下方立即出现腾讯云短信参数 Card。
- 租户选择自有腾讯云时，缺任意关键配置发送失败并提示租户配置不完整。
- 平台超管仍可维护平台短信通道配置。
