# Stage B：财务写入跨租户 ID 隔离

新增 `scripts/fixtures/warehouse-stage-b/tenant-payment-isolation.sql`，在已有真实采购收货
应付上验证跨租户金融写入。没有修改生产 SQL、API、权限或数据库配置。

## 本地执行

根代理执行以下 3 个夹具，全部通过、exit 0。仅使用新建无网络、无挂载的隔离 PostgreSQL
容器和合成数据，退出后自动清理；已有本地库只读提供结构/授权元数据，不读业务行或写远端。

```bash
bun scripts/verify-warehouse-stage-b-database.ts \
  scripts/fixtures/warehouse-stage-b/receipt-cross-order-concurrency.sql \
  scripts/fixtures/warehouse-stage-b/receipt-weighted-cost.sql \
  scripts/fixtures/warehouse-stage-b/tenant-payment-isolation.sql
```

## 实际覆盖

- 两个独立租户各选择真实收货产生、无需发票且金额足够的 AP，通过正式草稿保存、提交、独立员工审批及付款命令，申请 5 元、先支付 1 元。检查申请版本 4、剩余可付金额和唯一现金流水。
- 双方向各执行 11 次负向请求，共 22 次：仅外租户 AP、混合内外 AP、外租户申请 ID 保存/提交/审批/付款、外 allocation 配本 AP、本 allocation 配外 AP、全外分配、混合内外分配，以及已占用外租户付款 ID。
- 20 次业务拒绝精确比较 `scope_mismatch/not_found/allocation_invalid` JSON，不返回外租户冻结成功结果。每次只允许调用者租户的一条对应失败命令事件；前次失败及所有原命令历史也必须不变。
- 2 次已占用付款 ID 碰撞捕获确切 `23505`、`supplier_payments_pkey`；子事务回滚且无新增命令事件。这是数据库主键拒绝证据，**不是友好 HTTP 冲突响应或前端恢复验收**。
- 每次负向比较双方 10 张应付、付款申请/分配、付款/分配、现金流水、库存余额/流水、项目成本/占用表完整 JSON；另比较命令事件历史。不得新增预留、重复付款或误记账。
- 双方不同操作者使用相同 UUID key 文本分别成功，再分别重放原付款请求，要求仅返回自己的冻结结果，全部事实和命令历史不变。
- 全部新增业务事实及临时对象最终回滚，不污染已有种子或改变性能基数。前两次运行仅遇到新增测试的变量歧义与 CASE 表达式语法问题，修正测试后通过；没有将其当作生产业务缺陷或修改生产函数。

## 验收边界

SQL 使用内部服务函数，不证明真实 HTTP 登录、权限和租户切换。尚未覆盖同用户多租户切换、
全部金融动作（例如跨租户取消/尾款关闭）、完整业务接口隔离矩阵或主键碰撞的客户端交互。
开发库完整历史升级、真实接口联调及 Stage B 最终合并门槛仍未完成。

独立规格与质量审查均通过，各自独立运行上述 3 个夹具、exit 0。根代理另运行当时全 21 个
夹具通过；30 个外层计划、11 个真实 RPC 计划及 11 个 RPC 元数据记录的数量与 JSON 解析
检查均通过。本记录仍不是 Stage B 放行单。
