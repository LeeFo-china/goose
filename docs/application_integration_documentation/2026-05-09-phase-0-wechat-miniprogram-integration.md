# 阶段 0 微信小程序对接文档：多租户规划与防护

日期：2026-05-09

## 阶段结论

阶段 0 不要求微信小程序改代码。当前阶段只确认后续多租户登录态和客户入口规则。

## 后续小程序核心变化

客户登录后，后端可能返回三种模式：

```text
customer_portal
select_tenant
platform_visitor
```

### 1. 命中单一租户

```json
{
  "mode": "customer_portal",
  "tenant": {
    "id": "tenant-id",
    "name": "某某装饰"
  },
  "customer_id": "customer-id"
}
```

小程序进入该租户客户项目页。

### 2. 命中多个租户

```json
{
  "mode": "select_tenant",
  "tenants": [
    {
      "tenant_id": "tenant-a",
      "tenant_name": "A装饰",
      "customer_id": "customer-a",
      "project_count": 1,
      "latest_project_name": "绿城花园装修"
    }
  ]
}
```

小程序展示公司选择页。选择后调用：

```http
POST /customer/auth/select-tenant
```

### 3. 未归属任何租户

```json
{
  "mode": "platform_visitor"
}
```

小程序进入平台访客态，只展示装修需求提交和公开内容。

## 员工拓客直绑定

员工分享小程序码或 H5 链接时，后续会使用：

```text
share_token
```

小程序需要在扫码进入时保存该参数，并在客户登录/注册时传给后端。

该链路直接绑定到分享员工所属租户，不进入平台分配。

## 阶段 0 待产品确认

- [ ] 平台访客态首页如何展示。
- [ ] 装修需求表单字段。
- [ ] 多公司选择页展示哪些字段。
- [ ] “我的”页是否需要“切换装修公司”。
- [ ] 员工分享码是否长期有效。

## 当前不需要改动

- 不改现有登录接口。
- 不改客户项目页。
- 不改施工日志页。
- 不改工序验收页。
- 不改 H5 web-view 链路。

