# 品牌技术支持文案原样返回设计

日期：2026-07-28

## 背景

`GET /branding/effective` 当前根据 `display_name` 自动生成
`support_text = ${display_name}提供技术支持`。这会在租户明确输入的公司名称后
追加固定文案，使最终展示内容偏离租户输入。

## 决策

保留现有 `support_text` 响应字段以兼容已接入客户端，但其值必须原样等于当前
有效品牌的 `display_name`，不再追加、删除或改写任何文本。

平台已发布品牌、租户已发布品牌和受控平台回退品牌统一遵守这一规则。

## 边界

- 不修改 `display_name` 的保存、发布和校验规则。
- 不新增独立技术支持文案字段。
- 不修改数据库结构或已有品牌资料。
- 不修改权益、Logo、租户隔离和有效品牌回退逻辑。
- 不删除 `support_text`，避免客户端契约发生破坏性变化。
- 不修改 orange 仓库；小程序继续读取现有字段即可。

## 数据流

有效品牌解析仍先确定 `display_name`，随后构造响应：

```text
support_text = display_name
```

## 验证

- 契约单测证明 `buildSupportText("晴天装饰") === "晴天装饰"`。
- 平台、租户和受控回退的有效品牌测试均验证
  `support_text === display_name`。
- 品牌路由测试保持字段存在，并验证不包含系统追加文案。
- TypeScript、API 构建和文件大小检查通过。
- dev 部署后分别请求匿名和有权益租户的 `/branding/effective`，
  验证响应原样返回品牌名称。
