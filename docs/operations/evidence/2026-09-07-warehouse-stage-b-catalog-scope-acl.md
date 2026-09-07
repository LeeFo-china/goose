# Stage B：目录外仓隔离与补充 RPC ACL

本次收紧既有 `scripts/fixtures/warehouse-stage-b/draft-destination.sql`，未新增生产代码、
权限或 migration。根代理单夹具运行通过、exit 0：

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/draft-destination.sql
```

## 修正的证据缺口

旧跨租户目录测试的第二租户没有开启采购，断言接受 `WAREHOUSE_PROCUREMENT_NOT_ENABLED`
或 `WAREHOUSE_NOT_FOUND`；前一个门禁可以提前返回，不能独立证明外仓不可见。

现为第二租户增加自己的仓库、员工和开启的采购设置，先验证其查询自己的仓库成功，再双向
查询对方仓库，只接受精确 `WAREHOUSE_NOT_FOUND`。原关闭门禁、目的地互斥、项目兼容和
停用仓库场景保留。此处是新增验收证据，不是发现并修复生产租户隔离漏洞。

## 授权补验

实际数据库 `has_function_privilege` 另检查此前夹具未覆盖的入口：

- `create_tenant_warehouse`、`update_tenant_warehouse`、`confirm_supplier_purchase_order_fulfillment`、`create_supplier_purchase_order_receipt`：anon/authenticated 不可执行，service_role 可执行。
- 默认仓库触发器辅助函数 `ensure_default_tenant_warehouse()`：anon/authenticated/service_role 均不可直接执行。

只在既有无网络隔离 runner 执行，合成数据和临时对象末尾回滚；不改已有本地/远端业务数据。
这不证明员工 HTTP 权限、同用户切租户或全部采购批次写入隔离。完整开发库升级、真实接口
联调和最终合并仍需单独验收。

独立规格与质量审查均通过，两个审查者分别独立运行该夹具、exit 0。根代理在此候选上另跑
全 21 个夹具通过，30 个外层计划、11 个真实 RPC 计划及 11 个 RPC 元数据记录的数量与
JSON 解析检查通过。本记录仍不是 Stage B 放行单。
