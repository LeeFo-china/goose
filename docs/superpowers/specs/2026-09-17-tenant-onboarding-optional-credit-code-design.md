# 装企入驻统一社会信用代码选填设计

## 目标

与小程序契约保持一致：装企入驻申请的 `unified_social_credit_code` 可以不传、传 `null` 或空字符串；有值时仍执行统一大写、18 位格式校验和重复主体检查。

## 方案

API 在 Zod 边界把缺省、`null` 和去除首尾空白后的空字符串统一为 `null`，非空值继续交给现有信用代码 schema 大写并校验。服务层和持久化层只处理 `string | null`，仅在值非空时查询开放申请和现有租户的重复主体。

`tenant_onboarding_applications.unified_social_credit_code` 通过前向 migration 删除 `NOT NULL`。现有开放申请唯一索引和租户唯一索引都允许多个 `NULL`；审批 RPC 的比较和租户插入也能透传 `NULL`，无需引入临时占位值。

申请详情的运行时解析、共享记录类型和后台 DTO 改为可空。后台详情明确显示“未填写”，避免用空白或连字符掩盖业务含义。

## 数据流

1. 小程序提交申请。
2. 请求 schema 将缺省、`null`、`""`、纯空白归一为 `null`；非空代码归一为大写。
3. 服务仅对非空代码执行重复查询，创建 RPC 收到规范化后的 `string | null`。
4. 数据库将未填写值保存为 `NULL`。
5. 查询端按 nullable 解析，后台显示“未填写”。
6. 审批时 `NULL` 继续写入允许为空的租户字段，不阻塞租户创建。

## 兼容性与回滚

已有非空信用代码不改值，现有重复检查和唯一索引语义保持不变。回滚代码不会破坏数据，但回滚数据库约束前必须先确认不存在 `NULL` 申请；若存在，需先补齐或删除对应草稿/申请后再恢复 `NOT NULL`。

## 验证

- schema 覆盖缺省、`null`、空字符串、纯空白、合法小写值和非法非空值。
- service 覆盖空值跳过查重并以 `NULL` 创建，有值继续查重。
- repository parser 覆盖申请与审核详情中的 `NULL`。
- migration 契约检查字段可空，索引仍只约束非空主体。
- API 定向测试、API typecheck/build、Admin check/build 和 migration 状态检查。
