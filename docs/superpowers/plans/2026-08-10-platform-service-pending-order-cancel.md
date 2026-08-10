# 平台技术服务待支付订单取消实施计划

1. 先补取消请求 schema、路由和订单 action 的失败测试。
2. 增加取消预占与最终关闭 migration、RPC 契约测试，覆盖租户隔离、版本、幂等和预支付竞态。
3. 实现独立 cancellation repository/service，先预占取消权，再复用现有微信查单、关单和支付确认能力。
4. 接入 tenant service/controller，并补齐成功、重复、已支付、微信状态不确定测试。
5. 更新共享数据库类型与小程序交接文档。
6. 运行最小测试、API typecheck、构建和文件大小检查；在 Colima 隔离空库完整应用 migration 并执行 RPC smoke，dev 发布另行执行。
