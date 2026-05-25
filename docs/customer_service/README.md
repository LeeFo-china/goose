# 客服能力方案

## 文档索引

- [客户问题提交与客服电话方案](./2026-05-24-customer-service-plan.md)
- [分阶段执行计划](./2026-05-24-customer-service-execution-plan.md)
- [Admin 对接文档](./admin/2026-05-24-customer-service-admin-integration.md)
- [微信小程序对接文档](./wechat/2026-05-24-customer-service-wechat-integration.md)

## 当前状态

状态：阶段 1 后端最小闭环已落地，阶段 3 Admin 第一版已落地，待微信小程序对接。

当前已完成：

- 总方案文档。
- 分阶段执行计划。
- Admin 对接文档。
- 微信小程序对接文档。
- `@gooes/domain` 客服问题分类、状态、动作常量。
- Supabase 客服问题表和操作日志表 migration。
- API 客户侧创建/列表/详情接口。
- API Admin 列表/详情/分配/状态动作接口。
- `customer_service` 图片上传场景。
- 租户客服系统设置项。
- Admin `/customer-service` 客服问题列表、筛选、详情、分配和状态动作。

下一步：

- 阶段 2：微信小程序客服入口、拨号、提交问题、我的问题列表对接。
- 阶段 4：任务中心和通知增强。
