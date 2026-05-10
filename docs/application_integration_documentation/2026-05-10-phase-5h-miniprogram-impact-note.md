# 阶段 5H 小程序影响说明：多租户隔离验收

日期：2026-05-10

## 结论

本阶段不需要微信小程序端改代码。

## 原因

阶段 5H 新增的是后端/API 层隔离验收脚本：

```bash
bun run seed:tenant:phase5h
bun run verify:tenant:phase5h
```

它用于验证租户账号不能看到其它租户或默认租户数据，不改变小程序端接口协议。

## 小程序相关验证点

虽然不需要改代码，但上线前建议用小程序相关 token 或真实链路补充验证：

- 客户登录后只能看到自己所属租户项目。
- 客户不能通过项目 ID 访问其它租户项目。
- 员工端只能看到当前租户客户、项目、费用、验收、摄像头。
- 员工端不能访问 `/platform/*`。
- H5 web-view 使用 tenant slug 时，页面只落到目标租户。

## 验收建议

小程序前端拿到测试账号后，可以配合后端执行：

```bash
API_BASE_URL=<后端地址> \
TENANT_VERIFY_TOKEN=<小程序员工端 token 或对应登录态 token> \
TENANT_FORBIDDEN_IDS=<其它租户资源ID> \
bun run verify:tenant:phase5h
```

如果小程序 token 和 admin token 格式不同，需要先确认后端 `authorizationService` 能否识别该 token。

后端本轮已构造 A/B 租户数据完成严格模式验收：`27 passed, 0 failed, 0 skipped`。
